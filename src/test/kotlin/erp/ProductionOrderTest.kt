package erp

import erp.engineering.*
import erp.engineering.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.*
import org.springframework.test.web.servlet.request.RequestPostProcessor
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest
@AutoConfigureMockMvc
class ProductionOrderTest @Autowired constructor(val mvc: MockMvc, val db: JdbcTemplate, val json: ObjectMapper, val catalog: Catalog, val sheets: Sheets) {
    private val account = UUID.randomUUID()
    private val group = "os-group-$account"
    private val plant = "os-plant-$account"
    private val base = "/api/units/$plant/production-orders"
    private fun user(id: UUID) = jwt().jwt { it.subject(id.toString()).issuer(System.getenv("OIDC_ISSUER")) }
    private val admin = user(account)

    @BeforeEach fun factory() {
        db.update("insert into business_group(id,name) values(?,?)",group,group)
        db.update("insert into plant(id,group_id,name) values(?,?,?)",plant,group,plant)
        db.update("insert into account(id,group_id,issuer,subject,name) values(?,?,?,?,?)",
            account,group,System.getenv("OIDC_ISSUER"),account.toString(),"Direção de teste")
        db.update("insert into assignment(group_id,account_id,role_id) values(?,?,'admin')",group,account)
    }
    private fun item(kind: Kind, name: String, categoryId: UUID? = null, unitId: UUID? = null): UUID =
        catalog.save(group,kind,ItemInput(UUID.randomUUID().toString(),name,"contagem",categoryId=categoryId,unitId=unitId),null).id
    private val product by lazy { item(Kind.product,"Carrinho de madeira") }
    private val wheel by lazy { item(Kind.part,"Roda") }
    private val category by lazy { item(Kind.category,"Madeira") }
    private val unit by lazy { item(Kind.unit,"Placa") }
    private fun plate() = item(Kind.material,"Placa de MDF",category,unit)
    private fun publish(vararg lines: Pair<UUID,String>): Int {
        val sheet = Sheet(listOf(PieceLine(wheel,4,listOf("Corte","Montagem"))),
            lines.map { (id, perKit) -> MaterialLine(id,unit,perKit.toBigDecimal()) })
        val draft = sheets.create(group,product,sheet)
        return sheets.publish(group,product,draft.id,draft.revision,"Direção")
    }
    private fun stock(material: UUID) = "/api/units/$plant/stock/materials/$material"
    private fun put(path: String, body: Any? = null, status: Int = 200, actor: RequestPostProcessor = admin): JsonNode {
        val response = mvc.put(path) {
            with(actor)
            if (body != null) { contentType = MediaType.APPLICATION_JSON; content = json.writeValueAsString(body) }
        }.andReturn().response
        assertEquals(status,response.status,response.contentAsString)
        return json.readTree(response.contentAsString.ifEmpty { "null" })
    }
    private fun get(path: String, status: Int = 200, actor: RequestPostProcessor = admin): JsonNode {
        val response = mvc.get(path) { with(actor) }.andReturn().response
        assertEquals(status,response.status,response.contentAsString)
        return json.readTree(response.contentAsString.ifEmpty { "null" })
    }
    private fun open(material: UUID, quantity: String = "100") =
        put("${stock(material)}/opening/${UUID.randomUUID()}",mapOf("unitId" to unit,"quantity" to quantity))
    private fun command(kits: Int = 100, version: Int = 1) =
        mapOf("productId" to product,"version" to version,"quantity" to kits)
    private fun balances(material: UUID, physical: String, reserved: String, available: String) {
        val current = get(stock(material))
        assertEquals(listOf(physical,reserved,available),listOf("physical","reserved","available").map { current[it].stringValue() })
    }
    @Test fun cuttingTheVillageConsumesTwelveWhitePlatesOnce() {
        val village = item(Kind.product,"Vila Natalina 1 - Vermelha (Montagem Interna)")
        val house = item(Kind.part,"Casinha Branca")
        val white = item(Kind.material,"Placa MDF 2,5mm UF Branca",category,unit)
        val sheet = Sheet(listOf(PieceLine(house,2,listOf("Corte Laser","Limpeza","Emb. Parcial"))),
            listOf(MaterialLine(white,unit,"0.20".toBigDecimal())))
        val draft = sheets.create(group,village,sheet)
        sheets.publish(group,village,draft.id,draft.revision,"Engenharia")
        open(white)
        val path = "$base/${UUID.randomUUID()}"
        put(path, mapOf("productId" to village,"version" to 1,"quantity" to 150))
        put("$path/release")
        balances(white,"100","30","70")
        val url = "$path/reports/${UUID.randomUUID()}"
        val cut = mapOf("pieceIndex" to 0,"stepIndex" to 0,"quantity" to 60,
            "consumption" to mapOf("materialId" to white,"quantity" to "12"))
        val execution = put(url,cut)
        balances(white,"88","18","70")
        assertEquals(execution,put(url,cut))
        balances(white,"88","18","70")
        assertEquals(1,execution["reports"].size())
        assertEquals("60",execution["pieces"][0]["steps"][1]["available"].stringValue())
        assertEquals("18",execution["materials"][0]["remaining"].stringValue())
        assertEquals(execution,get("$path/execution"))
        assertEquals(execution,get("$base/kanban").single())
        assertEquals("Direção de teste",execution["reports"][0]["actor"].stringValue())
        val logged = db.queryForMap("select actor_subject,actor_issuer from production_stage_report where plant_id=?",plant)
        assertEquals(account.toString(),logged["actor_subject"])
        assertEquals(System.getenv("OIDC_ISSUER"),logged["actor_issuer"])
    }

    @Test fun checkingThirtyVillageKitsReceivesThemOnceAndKeepsOrderOpen() {
        val village = item(Kind.product,"Vila Natalina")
        val draft = sheets.create(group,village,Sheet(listOf(PieceLine(wheel,1,listOf("Montagem"))),emptyList()))
        sheets.publish(group,village,draft.id,draft.revision,"Engenharia")
        val order = "$base/${UUID.randomUUID()}"
        put(order, mapOf("productId" to village,"version" to 1,"quantity" to 150))
        val receipts = "$order/finished-receipts"
        val first = "$receipts/${UUID.randomUUID()}"
        val thirty = mapOf("quantity" to 30)
        put(first,thirty,409)
        put("$order/release")
        val result = put(first,thirty)
        assertEquals(30,result["received"].intValue())
        assertEquals(120,result["remaining"].intValue())
        assertEquals(30,result["stock"].intValue())
        assertEquals(result,put(first,thirty))
        put(first,mapOf("quantity" to 31),409)
        put("$receipts/${UUID.randomUUID()}",mapOf("quantity" to 121),409)
        assertEquals(result,get(receipts))
        assertEquals("released",get(order)["status"].stringValue())
        assertEquals(150,put("$receipts/${UUID.randomUUID()}",mapOf("quantity" to 120))["stock"].intValue())
    }

    @Test fun saleReducesOnlyFinishedStockAndReplayIsSafe() {
        publish()
        val order = "$base/${UUID.randomUUID()}"
        put(order, command())
        put("$order/release")
        val receipts = "$order/finished-receipts"
        put("$receipts/${UUID.randomUUID()}", mapOf("quantity" to 30))
        val url = "/api/units/$plant/sales/${UUID.randomUUID()}"
        val sale = mapOf("productId" to product, "quantity" to 10, "unitPrice" to "12.50",
            "channel" to "Loja física", "date" to "2026-11-27")
        assertEquals("125.00", put(url,sale)["total"].stringValue())
        put(url,sale)
        put(url,sale + ("quantity" to 9),409)
        put("/api/units/$plant/sales/${UUID.randomUUID()}",sale + ("quantity" to 21),409)
        assertEquals(20,get(receipts)["stock"].intValue())
        assertEquals(30,get(receipts)["received"].intValue())
        assertEquals(90,put("$receipts/${UUID.randomUUID()}",mapOf("quantity" to 70))["stock"].intValue())
        assertEquals(1,get("/api/units/$plant/sales").size())
    }

    @Test fun reconcilesShortageAndClosesUnusedReservation() {
        val material = plate()
        publish(material to "0.30")
        open(material)
        val order = "$base/${UUID.randomUUID()}"
        put(order,command())
        put("$order/release")
        put("$order/reports/${UUID.randomUUID()}", work(quantity=1,material=material,used="12"))
        val receipts = "$order/finished-receipts"
        val original = UUID.randomUUID()
        put("$receipts/$original",mapOf("quantity" to 30))
        put("/api/units/$plant/sales/${UUID.randomUUID()}",mapOf("date" to "2026-11-27","productId" to product,
            "quantity" to 29,"unitPrice" to "10","channel" to "Loja"))
        val adjustment = "$order/corrections/${UUID.randomUUID()}"
        val input = mapOf("receiptId" to original,"revision" to 0,"counted" to 28,"reason" to "Recontagem física")
        assertEquals("pending",put(adjustment,input)["state"].stringValue())
        assertEquals(0,get(receipts)["stock"].intValue())
        put("$adjustment/resolution",mapOf("reason" to "Conferência complementar"),409)
        put("$receipts/${UUID.randomUUID()}",mapOf("quantity" to 1))
        put("$adjustment/resolution",mapOf("reason" to "Conferência complementar"))
        put("$adjustment/resolution",mapOf("reason" to "Conferência complementar"))
        assertEquals(29,get(receipts)["received"].intValue())
        put("$order/closure",mapOf("reason" to "Lote encerrado"))
        put("$order/closure",mapOf("reason" to "Lote encerrado"))
        balances(material,"88","0","88")
        assertEquals("closed",get(order)["status"].stringValue())
        put("$receipts/${UUID.randomUUID()}",mapOf("quantity" to 1),409)
        put("$order/reports/${UUID.randomUUID()}",work(),409)
    }

    @Test fun purchasesRemainLinkedToPhysicalReceiptsAndReversals() {
        val material=plate()
        val path="/api/units/$plant/purchases"
        val row=mapOf("materialId" to material,"unitId" to unit,"quantity" to "10","amount" to "100.00",
            "date" to "2026-11-27","supplier" to "Madeireira")
        val first="$path/${UUID.randomUUID()}"
        put(first,row)
        put(first,row)
        val second="$path/${UUID.randomUUID()}"
        put(second,row+("amount" to "140.00"))
        balances(material,"20","0","20")
        val summary=get("$path/summary?materialId=$material")
        assertEquals("12.00",summary["average"].stringValue())
        assertEquals("14.00",summary["last"].stringValue())
        put("$second/reversal")
        put("$second/reversal")
        balances(material,"10","0","10")
        assertEquals("10.00",get("$path/summary?materialId=$material")["average"].stringValue())
    }

    @Test fun returnsToSupplierLedgerLeaveFortyPiecesOutstanding() {
        publish()
        val id=UUID.randomUUID()
        put("$base/$id",command())
        put("$base/$id/release")
        val path="/api/units/$plant/outsourcing/${UUID.randomUUID()}"
        val dispatch=mapOf("orderId" to id,"pieceIndex" to 0,"quantity" to 100,"date" to "2026-11-27",
            "partner" to "Pintura","unitPrice" to "2.00")
        assertEquals(id.toString(),get("/api/units/$plant/outsourcing/orders").single()["id"].stringValue())
        put(path,dispatch)
        put(path,dispatch)
        val first="$path/returns/${UUID.randomUUID()}"
        val body=mapOf("date" to "2026-11-27","returned" to 60,"lost" to 0,"note" to "Entrega parcial")
        assertEquals(40,put(first,body)["remaining"].intValue())
        assertEquals(40,put(first,body)["remaining"].intValue())
        put("$path/returns/${UUID.randomUUID()}",body,409)
        assertEquals(0,put("$path/returns/${UUID.randomUUID()}",body+mapOf("returned" to 35,"lost" to 5))["remaining"].intValue())
    }

    @Test fun capacityUsesFreePartsAndIgnoresReplayedAssembly() {
        publish()
        val order="$base/${UUID.randomUUID()}"
        put(order,command(kits=10))
        put("$order/release")
        put("$order/reports/${UUID.randomUUID()}",work(quantity=40))
        put("$order/reports/${UUID.randomUUID()}",work(step=1,quantity=40))
        val planning="/api/units/$plant/planning"
        val capacity="$planning/products/$product/versions/1/capacity"
        assertEquals(10,get(capacity)["kits"].intValue())
        val command=mapOf("partId" to wheel,"kind" to "assembly","quantity" to 20,"reason" to "Cinco kits montados")
        val consume="$planning/movements/${UUID.randomUUID()}"
        put(consume,command)
        put(consume,command)
        assertEquals(5,get(capacity)["kits"].intValue())
        put("$planning/movements/${UUID.randomUUID()}",command+("quantity" to 21),409)
    }

    @Test fun costsApplyEachStageRateAndChannelPercentages() {
        val material=plate()
        publish(material to "1")
        put("/api/units/$plant/purchases/${UUID.randomUUID()}",mapOf("materialId" to material,"unitId" to unit,"quantity" to "10",
            "amount" to "120","date" to "2026-11-27","supplier" to "Fornecedor"))
        val path="/api/units/$plant/costs/products/$product/versions/1/simulation"
        val body=mapOf("method" to "average","stages" to listOf(mapOf("name" to "Corte","minutes" to "6","rate" to "60"),
            mapOf("name" to "Montagem","minutes" to "3","rate" to "40")),"external" to "0","channel" to "Loja","commission" to "10",
            "tax" to "5","margin" to "25")
        fun simulate(input:Any,status:Int):JsonNode {
            val r=mvc.post(path) { with(admin);contentType=MediaType.APPLICATION_JSON;content=json.writeValueAsString(input) }.andReturn().response
            assertEquals(status,r.status,r.contentAsString)
            return json.readTree(r.contentAsString.ifEmpty { "null" })
        }
        val result=simulate(body,200)
        assertEquals("20.00",result["direct"].stringValue())
        assertEquals("33.33",result["price"].stringValue())
        simulate(body+("margin" to "85"),400)
    }

    @Test fun shiftDashboardTracesReceivedKitsToTheirOrder() {
        publish()
        val order="$base/${UUID.randomUUID()}"
        put(order,command())
        put("$order/release")
        put("$order/finished-receipts/${UUID.randomUUID()}",mapOf("quantity" to 30))
        val today=java.time.LocalDate.now(java.time.ZoneOffset.UTC)
        val result=get("/api/units/$plant/dashboard?from=${today.minusDays(1)}&until=${today.plusDays(1)}")
        val received=result.single { it["kind"].stringValue()=="finished" }
        assertEquals("30",received["quantity"].stringValue())
        assertEquals(order.substringAfterLast("/"),received["orderId"].stringValue())
    }

    @Test fun plantGrantsCanBeChangedWithoutReplacingTheSession() {
        val reader=UUID.randomUUID()
        db.update("insert into account(id,group_id,issuer,subject,name) values(?,?,?,?,?)",reader,group,System.getenv("OIDC_ISSUER"),reader.toString(),"Líder local")
        db.update("insert into assignment(group_id,account_id,role_id,plant_id) values(?,?,'leader',?)",group,reader,plant)
        val leader=user(reader)
        val grants="/api/units/$plant/operational-access"
        assertTrue(get(grants)["accounts"].any { it["id"].stringValue()==reader.toString() })
        get(base,403,leader)
        val original=mapOf("requestId" to UUID.randomUUID(),"enabled" to true,"reason" to "Responsável pelo turno")
        put("$grants/$reader/production.read",original)
        get(base,actor=leader)
        put("$grants/$reader/production.read",mapOf("requestId" to UUID.randomUUID(),"enabled" to false,"reason" to "Fim do turno"))
        get(base,403,leader)
        put("$grants/$reader/production.read",original)
        get(base,403,leader)
        put("$grants/$reader/production.read",original+("reason" to "Motivo diferente"),409)
        put("$grants/$reader/access.operations",mapOf("requestId" to UUID.randomUUID(),"enabled" to true,"reason" to "Inválido"),400)
        put("$grants/$account/production.read",mapOf("requestId" to UUID.randomUUID(),"enabled" to false,"reason" to "Inválido"),403)
    }

    @Test fun finishedInventoryAndCompetingSalesNeverOverdraw() {
        publish()
        val sales="/api/units/$plant/sales"
        val opening="$sales/products/$product/opening/${UUID.randomUUID()}"
        put(opening,mapOf("quantity" to 1))
        put(opening,mapOf("quantity" to 1))
        put(opening,mapOf("quantity" to 2),409)
        put(opening,mapOf("quantity" to "1"),400)
        val sale=mapOf("productId" to product,"quantity" to 1,"date" to "2026-11-27","channel" to "Loja","unitPrice" to "2")
        val barrier=CyclicBarrier(2)
        val pool=Executors.newFixedThreadPool(2)
        try {
            val results=(1..2).map { pool.submit(Callable {
                barrier.await(10,TimeUnit.SECONDS)
                mvc.put("$sales/${UUID.randomUUID()}") { with(admin);contentType=MediaType.APPLICATION_JSON;content=json.writeValueAsString(sale) }.andReturn().response.status
            }) }.map { it.get(15,TimeUnit.SECONDS) }.sorted()
            assertEquals(listOf(200,409),results)
        } finally { pool.shutdownNow() }
        val summary=get("$sales/products").single()["balance"]
        assertEquals(0,summary["available"].intValue())
        assertEquals(1,summary["opening"].intValue())
        for(invalid in listOf(mapOf("channel" to ""),mapOf("channel" to "x".repeat(121)),mapOf("unitPrice" to "1.999"),
                mapOf("quantity" to -1),mapOf("quantity" to 1.5),mapOf("quantity" to 2147483648L)))
            put("$sales/${UUID.randomUUID()}",sale+invalid,400)
        val row=get(sales).single()
        for(different in listOf(mapOf("quantity" to 2),mapOf("date" to "2026-11-26"),mapOf("channel" to "Site"),mapOf("unitPrice" to "3")))
            put("$sales/${row["id"].stringValue()}",sale+different,409)
    }

    @Test fun repeatedRecountsUseTheEffectiveRevisionAndPreserveHistory() {
        publish()
        val id=UUID.randomUUID()
        val order="$base/$id"
        put(order,command(kits=150))
        put("$order/closure",mapOf("reason" to "Antes da liberação"),409)
        put("$order/release")
        val receipt=UUID.randomUUID()
        put("$order/finished-receipts/$receipt",mapOf("quantity" to 30))
        put("/api/units/$plant/sales/${UUID.randomUUID()}",mapOf("date" to "2026-11-27","productId" to product,
            "quantity" to 10,"unitPrice" to "2.50","channel" to "Site"))
        val body=mapOf("receiptId" to receipt,"revision" to 0,"counted" to 28,"reason" to "Recontagem")
        val key="$order/corrections/${UUID.randomUUID()}"
        val adjusted=put(key,body)
        assertEquals("applied",adjusted["state"].stringValue())
        assertEquals(adjusted,put(key,body))
        for(change in listOf(mapOf("counted" to 29),mapOf("reason" to "Outro"),mapOf("revision" to 1),mapOf("receiptId" to UUID.randomUUID())))
            put(key,body+change,409)
        val totals=get("$order/finished-receipts")
        assertEquals(18,totals["stock"].intValue())
        assertEquals(122,totals["remaining"].intValue())
        assertEquals(28,get("$order/receipt-lines").single()["effective"].intValue())
        assertEquals(adjusted,get("$base/corrections").single())
        val newKey="$order/corrections/${UUID.randomUUID()}"
        put(newKey,body,409)
        put(newKey,body+mapOf("revision" to 1,"counted" to 28),409)
        put(newKey,body+mapOf("revision" to 1,"counted" to 151),409)
        put(newKey,body+mapOf("receiptId" to UUID.randomUUID()),404)
        put(newKey,body+mapOf("revision" to 1,"counted" to 10))
        assertEquals(0,get("$order/finished-receipts")["stock"].intValue())
        put("$key/resolution",mapOf("reason" to "Inexistente"),409)
        put("$order/corrections/${UUID.randomUUID()}/resolution",mapOf("reason" to "Inexistente"),404)
        put("$order/closure",mapOf("reason" to ""),400)
        put("$order/closure",mapOf("reason" to "Fim do lote"))
        put("$order/closure",mapOf("reason" to "Outro"),409)
    }

    @Test fun filtersPurchasesAndCalculatesReplenishmentFromActualMovements() {
        val material=plate()
        val path="/api/units/$plant/purchases"
        val key=UUID.randomUUID()
        val body=mapOf("materialId" to material,"unitId" to unit,"quantity" to "10","amount" to "140","date" to "2026-11-27","supplier" to "Madeiras Sul")
        assertTrue(get("$path/materials").any { it["id"].stringValue()==material.toString() })
        put("$path/$key",body)
        for(diff in listOf(mapOf("unitId" to UUID.randomUUID()), mapOf("materialId" to UUID.randomUUID()),mapOf("quantity" to "2"),
                mapOf("date" to "2026-11-28"),mapOf("supplier" to "Outra"),mapOf("amount" to "2"))) put("$path/$key",body+diff,409)
        for(diff in listOf(mapOf("supplier" to ""),mapOf("supplier" to "x".repeat(161)),mapOf("amount" to "1.111")))
            put("$path/${UUID.randomUUID()}",body+diff,400)
        val sum="$path/summary?materialId=$material"
        assertEquals("140.00",get("$sum&from=2026-11-27&until=2026-11-27&supplier=Sul")["amount"].stringValue())
        for(filter in listOf("from=2026-11-28","until=2026-11-26","supplier=Nenhum")) assertTrue(get("$sum&$filter")["average"].isNull)
        get("$sum&from=2026-11-28&until=2026-11-27",400)
        assertEquals(1,get(path).size())
        put("$path/${UUID.randomUUID()}/reversal",status=404)
        val planning="/api/units/$plant/planning/replenishment?material=$material&from=2026-01-01&until=2027-12-31"
        assertTrue(get("$planning&basis=available&threshold=11")["reorder"].booleanValue())
        assertFalse(get("$planning&basis=physical&threshold=10")["reorder"].booleanValue())
        get("$planning&basis=other&threshold=1",400)
        get("$planning&basis=physical&threshold=-1",400)
        get(planning.replace(material.toString(),UUID.randomUUID().toString())+"&basis=physical&threshold=0",404)
    }

    @Test fun pieceMovementsProtectHeldStockAndTraceReversals() {
        publish()
        val root="/api/units/$plant/planning"
        assertEquals(product.toString(),get("$root/products").single()["productId"].stringValue())
        val moves="$root/movements"
        fun move(kind:String,n:Any,status:Int=200,origin:UUID?=null):UUID {
            val key=UUID.randomUUID()
            put("$moves/$key",mapOf("partId" to wheel,"kind" to kind,"quantity" to n,"reason" to "Conferência","origin" to origin),status)
            return key
        }
        move("opening",40)
        move("opening",1,409)
        move("reserve",12)
        move("assembly",29,409)
        move("release",13,409)
        move("assembleReserved",2)
        move("release",10)
        val loss=move("loss",1)
        move("reversal",2,409,loss)
        val rev=move("reversal",1,origin=loss)
        move("reversal",1,409,rev)
        move("reversal",1,409,loss)
        move("reversal",1,409,UUID.randomUUID())
        move("loss",1,400,loss)
        move("other",1,400)
        move("reserve",0,400)
        move("reserve",1.5,400)
        move("reserve",2147483648L,400)
        val path="$moves/${UUID.randomUUID()}"
        val command=mapOf("kind" to "assembly","partId" to wheel,"quantity" to 1,"reason" to "Motivo")
        put(path,command)
        val other=item(Kind.part,"Outra")
        for(change in listOf(mapOf("kind" to "loss"),mapOf("quantity" to 2),mapOf("reason" to "Outro"),mapOf("origin" to loss),mapOf("partId" to other)))
            put(path,command+change,409)
        put("$moves/${UUID.randomUUID()}",command+("reason" to ""),400)
        assertEquals(7,get(moves).size())
    }

    @Test fun externalShipmentRejectsExcessAndConflictingReplays() {
        publish()
        val id=UUID.randomUUID()
        put("$base/$id",command(kits=2))
        val root="/api/units/$plant/outsourcing"
        val first="$root/${UUID.randomUUID()}"
        val input=mapOf("orderId" to id,"pieceIndex" to 0,"quantity" to 8,"date" to "2026-11-27","partner" to "Empresa","unitPrice" to "10")
        put(first,input,409)
        put("$base/$id/release")
        for(edit in listOf(mapOf("quantity" to 0),mapOf("pieceIndex" to -1),mapOf("pieceIndex" to 1),mapOf("quantity" to 1.5),
                mapOf("quantity" to 2147483648L),mapOf("partner" to ""),mapOf("partner" to "a".repeat(161)),mapOf("unitPrice" to "1.999")))
            put(first,input+edit,400)
        put(first,input)
        for(edit in listOf(mapOf("quantity" to 7),mapOf("date" to "2026-11-28"),mapOf("partner" to "Diferente"),mapOf("unitPrice" to "9")))
            put(first,input+edit,409)
        put("$root/${UUID.randomUUID()}",input,409)
        val receive="$first/returns/${UUID.randomUUID()}"
        val body=mapOf("date" to "2026-11-27","returned" to 8,"lost" to 0,"note" to "Retorno")
        put(receive,body+("note" to ""),400)
        put(receive,body+("returned" to 0),400)
        put(receive,body+("date" to "2026-11-26"),409)
        put("$root/${UUID.randomUUID()}/returns/${UUID.randomUUID()}",body,404)
        put(receive,body)
        put(receive,body+("note" to "Outro"),409)
        assertEquals("80.00",get(root).single()["serviceOnReturned"].stringValue())
    }

    @Test fun costingDistinguishesMissingPurchasesFromZeroCosts() {
        val material=plate()
        publish(material to "0.5")
        val root="/api/units/$plant/costs"
        assertEquals(1,get("$root/products").size())
        val path="$root/products/$product/versions/1"
        assertEquals(2,get("$path/stages").size())
        val stages=listOf(mapOf("name" to "Montagem","minutes" to "0","rate" to "0"),mapOf("name" to "Corte","minutes" to "3","rate" to "10"))
        val body=mapOf("method" to "last","channel" to "Loja","commission" to "3","tax" to "0","margin" to "10","external" to "0","stages" to stages)
        fun simulate(data:Any,status:Int):JsonNode {
            val r=mvc.post("$path/simulation") { with(admin);contentType=MediaType.APPLICATION_JSON;content=json.writeValueAsString(data) }.andReturn().response
            assertEquals(status,r.status,r.contentAsString)
            return json.readTree(r.contentAsString.ifEmpty { "null" })
        }
        assertTrue(simulate(body,200)["direct"].isNull)
        for(change in listOf(mapOf("method" to "other"),mapOf("stages" to emptyList<Any>()),mapOf("channel" to ""),mapOf("channel" to "x".repeat(121)),
                mapOf("commission" to "-1"))) simulate(body+change,400)
        put("/api/units/$plant/purchases/${UUID.randomUUID()}",mapOf("materialId" to material,"unitId" to unit,"quantity" to "1","amount" to "0",
            "date" to "2026-11-27","supplier" to "Fornecedor"))
        assertEquals("0.50",simulate(body,200)["direct"].stringValue())
    }

    @Test fun filtersShiftPeriodsAndRejectsInvalidPermissionDecisions() {
        val sales="/api/units/$plant/sales"
        put("$sales/products/$product/opening/${UUID.randomUUID()}",mapOf("quantity" to 30))
        put("$sales/${UUID.randomUUID()}",mapOf("date" to "2026-11-27","quantity" to 10,"unitPrice" to "3.20","channel" to "Loja","productId" to product))
        val dash="/api/units/$plant/dashboard"
        assertEquals("2026-11-27",get("$dash?from=2026-11-27&until=2026-11-27&offset=-180").single()["date"].stringValue())
        assertTrue(get("$dash?from=2026-11-28&until=2026-11-28").isEmpty)
        get("$dash?from=2026-11-28&until=2026-11-27",400)
        for(offset in listOf(-1081,1081)) get("$dash?from=2026-11-27&until=2026-11-27&offset=$offset",400)
        val grants="/api/units/$plant/operational-access/$account/dashboard.read"
        for(reason in listOf("","a".repeat(501))) put(grants,mapOf("requestId" to UUID.randomUUID(),"enabled" to false,"reason" to reason),400)
    }

    @Test fun legacyOrderRecoversPieceIdentityFromFrozenVersion() {
        publish()
        val id=UUID.randomUUID()
        val path="$base/$id"
        put(path,command())
        put("$path/release")
        db.update("update production_order set pieces=json_remove(pieces,'$[0].partId') where plant_id=? and id=?",plant,id)
        put("$path/reports/${UUID.randomUUID()}",work(quantity=8))
        put("$path/reports/${UUID.randomUUID()}",work(step=1,quantity=8))
        assertEquals(2,get("/api/units/$plant/planning/products/$product/versions/1/capacity")["kits"].intValue())
        val second="$base/${UUID.randomUUID()}"
        put(second,command());put("$second/release")
        put("$second/reports/${UUID.randomUUID()}",work(quantity=4))
        put("$second/reports/${UUID.randomUUID()}",work(step=1,quantity=4))
        assertEquals(3,get("/api/units/$plant/planning/products/$product/versions/1/capacity")["kits"].intValue())
    }

    @Test fun replenishmentCountsActualConsumptionInTheSelectedInterval() {
        val material=plate()
        open(material)
        publish(material to "0.3")
        val id=UUID.randomUUID()
        val path="$base/$id"
        put(path,command());put("$path/release")
        put("$path/reports/${UUID.randomUUID()}",work(quantity=10,material=material,used="12"))
        val date=java.time.LocalDate.now(java.time.ZoneOffset.UTC)
        fun check(from:java.time.LocalDate,until:java.time.LocalDate,status:Int=200)=get(
            "/api/units/$plant/planning/replenishment?from=$from&until=$until&basis=available&material=$material&threshold=71",status)
        assertEquals("12",check(date,date)["consumed"].stringValue())
        assertEquals("0",check(date.plusDays(1),date.plusDays(2))["consumed"].stringValue())
        assertEquals("0",check(date.minusDays(2),date.minusDays(1))["consumed"].stringValue())
        check(date.plusDays(1),date,400)
    }

    @Test fun capacityUsesEveryMandatoryPartIncludingAnEmptyBin() {
        val frame=item(Kind.part,"Base")
        val cap=item(Kind.part,"Tampa")
        val sheet=Sheet(listOf(PieceLine(wheel,2,listOf("Corte")),PieceLine(frame,1,listOf("Montagem")),PieceLine(cap,1,listOf("Limpeza"))),emptyList())
        val draft=sheets.create(group,product,sheet)
        sheets.publish(group,product,draft.id,draft.revision,"Engenharia")
        val root="/api/units/$plant/planning"
        val capacity="$root/products/$product/versions/1/capacity"
        fun move(part:UUID,kind:String,n:Int,reason:String="Inventário",status:Int=200)=put("$root/movements/${UUID.randomUUID()}",
            mapOf("partId" to part,"kind" to kind,"quantity" to n,"reason" to reason),status)
        move(wheel,"opening",40)
        move(wheel,"assembly",30)
        move(frame,"opening",3)
        assertEquals(0,get(capacity)["kits"].intValue())
        move(cap,"opening",20)
        assertEquals(3,get(capacity)["kits"].intValue())
        move(cap,"reserve",1,"x".repeat(501),400)
        move(frame,"reserve",1)
        assertEquals(2,get(capacity)["kits"].intValue())
    }

    private fun work(piece: Int = 0, step: Int = 0, quantity: Int = 1, material: UUID? = null, used: String = "1") =
        mapOf("pieceIndex" to piece,"stepIndex" to step,"quantity" to quantity,
            "consumption" to material?.let { mapOf("materialId" to it,"quantity" to used) })

    @Test fun reportsOnlyAvailablePiecesInTheirPublishedRoute() {
        val secondPiece = item(Kind.part,"Eixo")
        val sheet = Sheet(listOf(PieceLine(wheel,4,listOf("Corte","Montagem")),
            PieceLine(secondPiece,1,listOf("Corte"))),emptyList())
        val engineering = sheets.create(group,product,sheet)
        sheets.publish(group,product,engineering.id,engineering.revision,"Engenharia")
        val order = "$base/${UUID.randomUUID()}"
        fun post(body: Any, status: Int = 200) = put("$order/reports/${UUID.randomUUID()}",body,status)
        put(order,command(kits=2))
        assertTrue(get("$base/kanban").isEmpty)
        get("$order/execution",409)
        post(work(),409)
        put("$order/release")
        val before = get("$order/execution")
        assertTrue(before["reports"].isEmpty)
        assertEquals("8",before["pieces"][0]["total"].stringValue())
        assertEquals("2",before["pieces"][1]["total"].stringValue())
        assertEquals(before,get("$base/kanban").single())
        post(work(step=1),409)
        post(work(quantity=9),409)
        val partial = post(work(quantity=3))
        assertEquals("5",partial["pieces"][0]["steps"][0]["available"].stringValue())
        assertEquals("3",partial["pieces"][0]["steps"][1]["available"].stringValue())
        post(work(step=1,quantity=4),409)
        post(work(step=1,quantity=2))
        post(work(quantity=5))
        post(work(step=1,quantity=6))
        val complete = post(work(piece=1,quantity=2))
        assertEquals(5,complete["reports"].size())
        assertEquals("8",complete["pieces"][0]["steps"][1]["completed"].stringValue())
        assertEquals("0",complete["pieces"][1]["steps"][0]["available"].stringValue())
        assertEquals(1,complete["reports"][0]["pieceIndex"].intValue())
        assertEquals(complete,get("$base/kanban").single())
        assertEquals("released",get(order)["status"].stringValue())
    }

    @Test fun rejectsInvalidConsumptionAndScopesStageReporting() {
        val plates = plate()
        open(plates)
        publish(plates to "0.30")
        val order = "$base/${UUID.randomUUID()}"
        put(order,command())
        put("$order/release")
        val report = "$order/reports/${UUID.randomUUID()}"
        val before = get("$order/execution")
        for (bad in listOf(0, -1, "2", 0.5, 2147483648L)) put(report,work() + ("quantity" to bad),400)
        for (bad in listOf(work(piece=-1),work(piece=1),work(step=-1),work(step=2))) put(report,bad,400)
        for (bad in listOf(-12,"-12","0","12,1","1.1234567","1000000000000")) {
            put(report,work() + ("consumption" to mapOf("materialId" to plates,"quantity" to bad)),400)
        }
        put(report,work(material=UUID.randomUUID()),409)
        put(report,work(material=plates,used="30.000001"),409)
        val unknown = "$base/${UUID.randomUUID()}"
        get("$unknown/execution",404)
        put("$unknown/reports/${UUID.randomUUID()}",work(),404)
        val otherPlant = "other-$plant"
        db.update("insert into plant(id,group_id,name) values(?,?,?)",otherPlant,group,otherPlant)
        assertTrue(get("/api/units/$otherPlant/production-orders/kanban").isEmpty)
        get(order.replace(plant,otherPlant) + "/execution",404)
        put(report.replace(plant,otherPlant),work(),404)
        val reader = UUID.randomUUID()
        val role = "work-reader-$reader"
        db.update("insert into account(id,group_id,issuer,subject,name) values(?,?,?,?,?)",
            reader,group,System.getenv("OIDC_ISSUER"),reader.toString(),"Consulta")
        db.update("insert into job_role values(?,?)",role,role)
        db.update("insert into role_action values(?,'production.read')",role)
        db.update("insert into assignment(group_id,account_id,role_id,plant_id) values(?,?,?,?)",group,reader,role,plant)
        val viewer = user(reader)
        assertEquals(before,get("$base/kanban",actor=viewer).single())
        put(report,work(material=plates),403,viewer)
        db.update("insert into role_action values(?,'production.report')",role)
        db.update("delete from role_action where role_id=? and action='production.read'",role)
        put(report,work(material=plates),403,viewer)
        get("$order/execution",403,viewer)
        get("$base/kanban",403,viewer)
        assertEquals(before,get("$order/execution"))
        balances(plates,"100","30","70")
        val posted = put(report,work(material=plates,used="12.0"))
        assertEquals(posted,put(report,work(material=plates,used="12.000000")))
        put(report,work(material=plates,used="11"),409)
        put(report,work(quantity=2,material=plates,used="12"),409)
        put(report,work(),409)
        assertEquals(posted,get("$order/execution"))
        balances(plates,"88","18","70")
    }

    @Test fun competingStageReportsCannotOverdrawOrDuplicate() {
        val plates = plate()
        open(plates)
        publish(plates to "0.30")
        val order = "$base/${UUID.randomUUID()}"
        put(order,command())
        put("$order/release")
        val reports = "$order/reports"
        val retry = "$reports/${UUID.randomUUID()}"
        fun race(paths: List<String>, body: Any): List<Int> {
            val barrier = CyclicBarrier(paths.size)
            return Executors.newFixedThreadPool(paths.size).use { pool ->
                pool.invokeAll(paths.map { path -> Callable {
                    barrier.await(10,TimeUnit.SECONDS)
                    mvc.put(path) { with(admin); contentType = MediaType.APPLICATION_JSON; content = json.writeValueAsString(body) }
                        .andReturn().response.status
                } }).map { it.get(20,TimeUnit.SECONDS) }.sorted()
            }
        }
        assertEquals(listOf(200,200),race(listOf(retry,retry),work(quantity=300,material=plates,used="12")))
        balances(plates,"88","18","70")
        val paths = List(2) { "$reports/${UUID.randomUUID()}" }
        assertEquals(listOf(200,409),race(paths,work(quantity=90)))
        val result = get("$order/execution")
        assertEquals("390",result["pieces"][0]["steps"][0]["completed"].stringValue())
        assertEquals(2,result["reports"].size())
    }
    @Test fun releasesOneHundredKitsReservingThirtyOfOneHundredPlates() {
        val plates = plate()
        open(plates)
        publish(plates to "0.30")
        val path = "$base/${UUID.randomUUID()}"
        assertEquals("draft",put(path,command())["status"].stringValue())
        balances(plates,"100","0","100")
        assertEquals("released",put("$path/release")["status"].stringValue())
        balances(plates,"100","30","70")
    }

    @Test fun preservesSheetAndReplaysCreationAndRelease() {
        val plates = plate()
        open(plates)
        publish(plates to "0.20",plates to "0.10")
        val path = "$base/${UUID.randomUUID()}"
        val draft = put(path,command())
        assertEquals(draft, put(path,command()))
        assertTrue(draft["number"].longValue() > 0)
        assertEquals("Carrinho de madeira",draft["productName"].stringValue())
        val piece = draft["pieces"].single()
        assertEquals(listOf("Corte","Montagem"),piece["steps"].toList().map { it.stringValue() })
        assertEquals(4,piece["perKit"].intValue())
        assertEquals("0.3",draft["materials"].single()["perKit"].stringValue())
        assertEquals("30",draft["materials"].single()["required"].stringValue())
        publish(plates to "0.6")
        val options = get("$base/products")
        assertEquals(listOf(2,1), options.toList().map { it["version"].intValue() })
        put(path,command(version=2),409)
        put(path,command(kits=101),409)
        assertEquals(draft,get(path))
        val released = put("$path/release")
        assertFalse(released["releasedAt"].isNull)
        assertEquals(1,released["version"].intValue())
        assertEquals(released,put("$path/release"))
        assertEquals(released,put(path,command()))
        assertEquals(released,get(base).single())
        balances(plates,"100","30","70")
        val actor = db.queryForList("select created_by,released_by from production_order where plant_id=?",plant).single()
        assertTrue(actor.values.all { it == account.toString() })
    }

    @Test fun insufficientSecondMaterialRollsBackReleaseAndAllReservations() {
        // The first material has stock. The second fails after the first reservation is written.
        val (first,second) = listOf(plate(),plate()).sorted()
        open(first)
        open(second,"29")
        publish(first to "0.30", second to "0.30")
        val path = "$base/${UUID.randomUUID()}"
        val draft = put(path,command())
        put("$path/release",status=409)
        assertEquals(draft,get(path))
        balances(first,"100","0","100")
        balances(second,"29","0","29")
        put("${stock(second)}/receipts/${UUID.randomUUID()}",mapOf("unitId" to unit,"quantity" to "1"))
        put("$path/release")
        balances(first,"100","30","70")
        balances(second,"30","30","0")
    }

    private fun race(first: String, second: String): List<Int> {
        val barrier = CyclicBarrier(2)
        return Executors.newFixedThreadPool(2).use { pool ->
            pool.invokeAll(listOf(first,second).map { path -> Callable {
                barrier.await(10,TimeUnit.SECONDS)
                mvc.put("$path/release") { with(admin) }.andReturn().response.status
            } }).map { it.get(20, TimeUnit.SECONDS) }.sorted()
        }
    }

    @Test fun concurrentOrdersAndRetriesPreserveAvailableStock() {
        val plates = plate()
        open(plates)
        publish(plates to "0.60")
        val orders = List(2) { "$base/${UUID.randomUUID()}" }
        orders.forEach { put(it,command()) }
        assertEquals(listOf(200,409),race(orders.first(),orders.last()))
        val winner = orders.single { get(it)["status"].stringValue() == "released" }
        assertEquals(listOf(200,200),race(winner,winner))
        balances(plates,"100","60","40")
    }

    @Test fun limitsOrdersToFactoryAndRequiresSeparateGrants() {
        val plates = plate()
        open(plates)
        publish(plates to "0.30")
        val id = UUID.randomUUID()
        val path = "$base/$id"
        val draft = put(path,command())
        val reader = UUID.randomUUID()
        val role = "reader-$reader"
        db.update("insert into account(id,group_id,issuer,subject,name) values(?,?,?,?,?)",
            reader,group,System.getenv("OIDC_ISSUER"),reader.toString(),"Consulta")
        db.update("insert into job_role values(?,?)",role,role)
        db.update("insert into role_action values(?,'production.read')",role)
        db.update("insert into assignment(group_id,account_id,role_id,plant_id) values(?,?,?,?)",group,reader,role,plant)
        val viewer = user(reader)
        assertEquals(draft,get(path,actor=viewer))
        put(path,command(),403,viewer)
        put("$path/release",status=403,actor=viewer)
        db.update("insert into role_action values(?,'production.create')",role)
        put(path,command(),actor=viewer)
        put("$path/release",status=403,actor=viewer)
        db.update("insert into role_action values(?,'production.release')",role)
        db.update("delete from role_action where role_id=? and action='production.read'",role)
        get(path,403,viewer)
        get("$base/products",403,viewer)
        get(base,403,viewer)
        put(path,command(),403,viewer)
        put("$path/release",status=403,actor=viewer)
        val other = "second-$plant"
        db.update("insert into plant(id,group_id,name) values(?,?,?)",other,group,other)
        val there = "/api/units/$other/production-orders"
        assertTrue(get(there).isEmpty)
        get("$there/$id",404)
        put("$there/$id/release",status=404)
        put("$there/$id",command())
        put("$there/$id/release",status=409)
        balances(plates,"100","0","100")
        val regional = user(UUID.fromString("00000000-0000-4000-8000-000000000006"))
        get(path,403,regional)
        assertTrue(get("/api/units/birigui/production-orders/products",actor=regional).none { it["productId"].stringValue() == product.toString() })
        put("/api/units/birigui/production-orders/$id",command(),403,regional)
    }

    @Test fun rejectsUnpublishedSheetsAndNonIntegralKitCounts() {
        val path = "$base/${UUID.randomUUID()}"
        put(path,command(),404)
        for (bad in listOf(-1,0,"100",1.5,2147483648L)) put(path,command() + ("quantity" to bad),400)
        put(path,command(version=0),400)
        assertTrue(get(base).isEmpty)
        publish()
        put(path,command())
        val order = put("$path/release")
        assertTrue(order["materials"].isEmpty)
        // Reusing a valid UUID for another published product conflicts as well.
        val other = item(Kind.product,"Pião")
        val draft = sheets.create(group,other,Sheet(listOf(PieceLine(wheel,1,listOf("Corte"))),emptyList()))
        sheets.publish(group,other,draft.id,draft.revision,"Direção")
        put(path,command() + ("productId" to other),409)
        assertEquals(order,get(path))
    }
}
