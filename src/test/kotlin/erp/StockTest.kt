package erp

import erp.engineering.Catalog
import erp.engineering.ItemInput
import erp.engineering.Kind
import erp.stock.ReservationLine
import erp.stock.StockReservations
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.*
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest
@AutoConfigureMockMvc
class StockTest @Autowired constructor(val mvc: MockMvc, val catalog: Catalog, val db: JdbcTemplate, val json: ObjectMapper,
        val reservations: StockReservations, transactions: PlatformTransactionManager) {
    private val releaseTransaction = TransactionTemplate(transactions).apply {
        isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
    }
    private val admin = jwt().jwt { it.subject("00000000-0000-4000-8000-000000000002").issuer(System.getenv("OIDC_ISSUER")) }
    private val regional = jwt().jwt { it.subject("00000000-0000-4000-8000-000000000006").issuer(System.getenv("OIDC_ISSUER")) }
    private val createdItems = mutableListOf<UUID>()
    private val secondPlant = "stock-test-" + UUID.randomUUID()
    private fun path(material: UUID, plant: String = "eduk") = "/api/units/$plant/stock/materials/$material"
    private fun put(path: String, input: Any, status: Int = 200, actor: RequestPostProcessor = admin): JsonNode {
        val response = mvc.put(path) { with(actor); contentType = MediaType.APPLICATION_JSON; content = json.writeValueAsString(input) }
            .andReturn().response
        assertEquals(status, response.status, response.contentAsString)
        return json.readTree(response.contentAsString.ifEmpty { "null" })
    }
    private fun get(path: String, code: Int = 200, actor: RequestPostProcessor = admin): JsonNode {
        val response = mvc.get(path) { with(actor) }.andReturn().response
        assertEquals(code, response.status)
        return json.readTree(response.contentAsString.ifEmpty { "null" })
    }
    private fun incoming(unit: UUID, quantity: Any = "100") = mapOf("unitId" to unit, "quantity" to quantity)
    private fun reverse(source: UUID) = mapOf("sourceId" to source)

    private fun material(group: String = "mundo-eduk"): Pair<UUID, UUID> {
        val code = UUID.randomUUID().toString()
        val category = catalog.save(group, Kind.category, ItemInput(code,"Madeira"),null)
        val unit = catalog.save(group, Kind.unit, ItemInput(code,"Placa","contagem"), null)
        val item = catalog.save(group, Kind.material, ItemInput(code,"Painel",categoryId=category.id,unitId=unit.id),null)
        createdItems.addAll(listOf(category.id, unit.id, item.id))
        return item.id to unit.id
    }

    @AfterEach fun cleanup() {
        for (id in createdItems.reversed()) {
            db.update("delete from stock_movement where material_id=? and source_id is not null", id)
            db.update("delete from stock_movement where material_id=?", id)
            db.update("delete from stock_reservation where material_id=?", id)
            db.update("delete from stock_account where material_id=?", id)
            db.update("delete from item where id=?", id)
        }
        db.update("delete from plant where id=?", secondPlant)
    }

    @Test fun opensOneHundredPlatesOnce() {
        val (id, unit) = material()
        val path = "/api/units/eduk/stock/materials/$id"
        val request = UUID.randomUUID()
        val command = """{"quantity":"100","unitId":"$unit"}"""
        repeat(2) {
            mvc.put("$path/opening/$request") { with(admin); contentType = MediaType.APPLICATION_JSON; content = command }
                .andExpect { status { isOk() } }
        }
        mvc.get(path) { with(admin) }.andExpect {
            status { isOk() }
            jsonPath("$.physical") { value("100") }
            jsonPath("$.reserved") { value("0") }
            jsonPath("$.available") { value("100") }
            jsonPath("$.movements.length()") { value(1) }
        }
    }

    @Test fun protectsPhysicalStockAlreadyReservedForOrders() {
        val (plate, unit) = material()
        val path = path(plate)
        val opening = UUID.randomUUID()
        put("$path/opening/$opening", incoming(unit))
        for (quantity in listOf("12.000001", "17.9999990")) {
            releaseTransaction.executeWithoutResult {
                reservations.reserve("eduk", UUID.randomUUID(), listOf(ReservationLine(plate, unit, quantity.toBigDecimal())))
            }
        }
        val balance = get(path)
        assertEquals("100", balance["physical"].stringValue())
        assertEquals("30", balance["reserved"].stringValue())
        assertEquals("70", balance["available"].stringValue())
        assertEquals(1, balance["movements"].size())
        put("$path/reversals/${UUID.randomUUID()}", reverse(opening), 409)
        assertEquals(balance, get(path))
        val receipt = UUID.randomUUID()
        assertEquals("75", put("$path/receipts/$receipt", incoming(unit, "5"))["available"].stringValue())
        assertEquals("70", put("$path/reversals/${UUID.randomUUID()}", reverse(receipt))["available"].stringValue())
    }

    @Test fun consumesOnlyTheReservationOfTheReportingOrder() {
        val (plate, unit) = material()
        val materialPath = path(plate)
        val stockKey = UUID.randomUUID()
        put("$materialPath/opening/$stockKey", incoming(unit))
        val order = UUID.randomUUID()
        val otherOrder = UUID.randomUUID()
        releaseTransaction.executeWithoutResult {
            reservations.reserve("eduk", order, listOf(ReservationLine(plate, unit, "30".toBigDecimal())))
            reservations.reserve("eduk", otherOrder, listOf(ReservationLine(plate, unit, "10".toBigDecimal())))
        }
        fun consume(owner: UUID, amount: String, key: UUID = UUID.randomUUID(), plant: String = "eduk") {
            releaseTransaction.executeWithoutResult {
                reservations.consume(plant, owner, key, plate, amount.toBigDecimal(), "local", "operator")
            }
        }
        fun balances(physical: String, reserved: String, available: String) {
            val balance = get(materialPath)
            assertEquals(listOf(physical,reserved,available),
                listOf("physical","reserved","available").map { balance[it].stringValue() })
        }
        consume(order,"12",stockKey) // Report IDs and stock request IDs have separate namespaces.
        balances("88","28","60")
        val balance = get(materialPath)
        val movement = balance["movements"].last()
        assertEquals("consumption",movement["kind"].stringValue())
        assertEquals("-12",movement["quantity"].stringValue())
        assertEquals(order.toString(),movement["orderId"].stringValue())
        assertEquals(stockKey.toString(),movement["reportId"].stringValue())
        assertTrue(movement["sourceId"].isNull)
        val movementId = UUID.fromString(movement["requestId"].stringValue())
        assertNotEquals(stockKey,movementId)
        assertEquals("operator",db.queryForObject("select actor_subject from stock_movement where request_id=?",String::class.java,movementId))
        put("$materialPath/reversals/${UUID.randomUUID()}", reverse(movementId),409)
        assertThrows(org.springframework.dao.DuplicateKeyException::class.java) { consume(order, "12", stockKey) }
        for (amount in listOf("19","0","-1","0.0000001","1000000000000")) {
            assertThrows(ResponseStatusException::class.java) { consume(order, amount) }
        }
        assertThrows(ResponseStatusException::class.java) { consume(UUID.randomUUID(), "1") }
        assertThrows(ResponseStatusException::class.java) { consume(order, "1", plant=secondPlant) }
        assertEquals(balance,get(materialPath))
        consume(order,"18")
        consume(otherOrder,"10")
        balances("60","0","60")
        assertThrows(ResponseStatusException::class.java) { consume(order,"0.000001") }
    }

    @Test fun competingConsumptionCannotOverdrawTheOrderReservation() {
        val (plate, unit) = material()
        val order = UUID.randomUUID()
        put("${path(plate)}/opening/${UUID.randomUUID()}", incoming(unit))
        releaseTransaction.executeWithoutResult {
            reservations.reserve("eduk",order,listOf(ReservationLine(plate,unit,"30".toBigDecimal())))
        }
        val barrier = CyclicBarrier(2)
        val outcomes = Executors.newFixedThreadPool(2).use { pool ->
            pool.invokeAll(List(2) { Callable {
                barrier.await(10,TimeUnit.SECONDS)
                try {
                    releaseTransaction.executeWithoutResult {
                        reservations.consume("eduk",order,UUID.randomUUID(),plate,"20".toBigDecimal(),"local","operator")
                    }
                    200
                } catch (failure: ResponseStatusException) { failure.statusCode.value() }
            } }).map { it.get(15,TimeUnit.SECONDS) }.sorted()
        }
        assertEquals(listOf(200,409),outcomes)
        val balance = get(path(plate))
        assertEquals(listOf("80","10","70"),listOf("physical","reserved","available").map { balance[it].stringValue() })
        assertEquals(2,balance["movements"].size())
    }

    @Test fun rejectsIncompatibleReservationsWithoutHoldingMaterial() {
        val stocked = listOf(material(), material()).sortedBy { it.first }
        val (first, firstUnit) = stocked.first()
        val (second, secondUnit) = stocked.last()
        for ((materialId, unitId) in stocked) {
            put("${path(materialId)}/opening/${UUID.randomUUID()}", incoming(unitId))
        }
        fun rejects(line: ReservationLine) {
            val error = assertThrows(ResponseStatusException::class.java) {
                releaseTransaction.executeWithoutResult {
                    reservations.reserve("eduk", UUID.randomUUID(),
                        listOf(line, ReservationLine(first, firstUnit, "1".toBigDecimal())))
                }
            }
            assertEquals(409, error.statusCode.value())
            assertEquals("0", get(path(first))["reserved"].stringValue())
            assertEquals("0", get(path(second))["reserved"].stringValue())
        }
        for (invalid in listOf("0", "1000000000000", "0.0000001", "101")) {
            rejects(ReservationLine(second, secondUnit, invalid.toBigDecimal()))
        }
        rejects(ReservationLine(second, firstUnit, "1".toBigDecimal()))
        rejects(ReservationLine(UUID.randomUUID(), secondUnit, "1".toBigDecimal()))
    }

    @Test fun serializesReservationAndReversalOfTheSameStock() {
        val (plate, unit) = material()
        val opening = UUID.randomUUID()
        put("${path(plate)}/opening/$opening", incoming(unit))
        val start = CyclicBarrier(2)
        val outcomes = Executors.newFixedThreadPool(2).use { pool ->
            val reserve = pool.submit<Int> {
                start.await(10, TimeUnit.SECONDS)
                try {
                    releaseTransaction.executeWithoutResult {
                        reservations.reserve("eduk", UUID.randomUUID(),
                            listOf(ReservationLine(plate, unit, "30".toBigDecimal())))
                    }
                    200
                } catch (e: ResponseStatusException) {
                    e.statusCode.value()
                }
            }
            val reversal = pool.submit<Int> {
                start.await(10, TimeUnit.SECONDS)
                mvc.put("${path(plate)}/reversals/${UUID.randomUUID()}") {
                    with(admin)
                    contentType = MediaType.APPLICATION_JSON
                    content = json.writeValueAsString(reverse(opening))
                }.andReturn().response.status
            }
            listOf(reserve.get(15, TimeUnit.SECONDS), reversal.get(15, TimeUnit.SECONDS))
        }
        assertEquals(listOf(200, 409), outcomes.sorted())
        val expected = if (outcomes.first() == 200) listOf("100", "30", "70") else listOf("0", "0", "0")
        val balance = get(path(plate))
        assertEquals(expected, listOf("physical", "reserved", "available").map { balance[it].stringValue() })
    }

    @Test fun reconcilesReceiptsAndLinkedReversals() {
        val (id,unit) = material()
        val path = path(id)
        val opening = UUID.randomUUID()
        val receipt = UUID.randomUUID()
        val reversal = UUID.randomUUID()
        assertEquals("0", get(path)["physical"].stringValue())
        put("$path/opening/$opening", incoming(unit))
        put("$path/receipts/$receipt", incoming(unit,"1.250000"))
        val after = put("$path/reversals/$reversal", reverse(opening))
        assertEquals("1.25", after["available"].stringValue())
        val movements = after["movements"].toList()
        assertEquals(listOf("100","1.25","-100"), movements.map { it["quantity"].stringValue() })
        assertEquals(listOf("opening","receipt","reversal"), movements.map { it["kind"].stringValue() })
        assertEquals(opening.toString(), movements.last()["sourceId"].stringValue())
        assertEquals(after, put("$path/reversals/$reversal", reverse(opening)))
        assertEquals(after, put("$path/receipts/$receipt", incoming(unit,"1.25")))
        assertEquals(after, get(path))
        put("$path/reversals/$reversal", reverse(receipt),409)
        put("$path/reversals/${UUID.randomUUID()}", reverse(opening),409)
        put("$path/reversals/${UUID.randomUUID()}", reverse(reversal),409)
        put("$path/reversals/${UUID.randomUUID()}", reverse(UUID.randomUUID()),404)
        put("$path/opening/${UUID.randomUUID()}", incoming(unit),409)
        put("$path/receipts/$opening", incoming(unit),409)
        put("$path/receipts/$receipt", incoming(unit,"1.2"),409)
        put("$path/receipts/$receipt", incoming(UUID.randomUUID(),"1.25"),409)
        assertEquals(after, get(path))
    }

    @Test fun checksPrecisionUnitAndHistoricalCatalog() {
        val (id, unit) = material()
        val path = path(id)
        val entry = UUID.randomUUID()
        for (bad in listOf("0","-1","1.1234567","1000000000000","1e2",100)) {
            put("$path/receipts/$entry", incoming(unit,bad),400)
        }
        put("$path/receipts/$entry", incoming(UUID.randomUUID()),400)
        val before = get("/api/units/eduk/stock/materials").single { it["id"].stringValue() == id.toString() }
        assertTrue(before["canReceive"].booleanValue())
        val history = put("$path/receipts/$entry", incoming(unit,"999999999999.999999"))
        assertEquals("999999999999.999999", history["physical"].stringValue())
        put("$path/opening/${UUID.randomUUID()}", incoming(unit),409)

        val group = "mundo-eduk"
        val original = catalog.get(group,id,Kind.material)
        val newUnit = catalog.save(group,Kind.unit,ItemInput("g-$id","Grama","massa"),null)
        // Remove the referencing material first during cleanup.
        createdItems.add(0,newUnit.id)
        catalog.save(group,Kind.material,original.value.copy(name="Renomeado",unitId=newUnit.id),id)
        put("$path/receipts/${UUID.randomUUID()}", incoming(newUnit.id),409)
        val changed = get("/api/units/eduk/stock/materials").single { it["id"].stringValue() == id.toString() }
        assertFalse(changed["canReceive"].booleanValue())
        assertEquals(before["unitCode"], changed["unitCode"])
        assertEquals(before["name"], changed["name"])
        catalog.save(group,Kind.material,original.value.copy(active=false),id)
        assertFalse(get("/api/units/eduk/stock/materials").single { it["id"].stringValue() == id.toString() }["canReceive"].booleanValue())
        put("$path/receipts/${UUID.randomUUID()}", incoming(unit),409)
        assertEquals(history, put("$path/receipts/$entry", incoming(unit,"999999999999.999999")))
        assertEquals(history, get(path))
        assertEquals("0", put("$path/reversals/${UUID.randomUUID()}", reverse(entry))["physical"].stringValue())
        val (unused, unavailableUnit) = material()
        val stale = catalog.get(group, unavailableUnit, Kind.unit)
        catalog.save(group,Kind.unit,stale.value.copy(active=false),unavailableUnit)
        assertTrue(get("/api/units/eduk/stock/materials").none { it["id"].stringValue() == unused.toString() })
        get(path(unused),404)
        put("${path(unused)}/receipts/${UUID.randomUUID()}", incoming(unavailableUnit),404)
    }

    @Test fun isolatesPlantsAndLimitsStockGrants() {
        val (id,unit) = material()
        val key = UUID.randomUUID()
        val path = path(id)
        db.update("insert into plant(id,group_id,name) values (?,'mundo-eduk',?)", secondPlant,secondPlant)
        put("$path/opening/$key", incoming(unit))
        assertEquals("0", get(path(id,secondPlant))["available"].stringValue())
        assertEquals("25", put("${path(id,secondPlant)}/opening/$key", incoming(unit,"25"))["physical"].stringValue())
        val (other,otherUnit) = material()
        put("${path(other)}/receipts/$key", incoming(otherUnit),409)
        put("${path(other)}/reversals/$key", reverse(key),409)
        get(path,403,regional)
        get(path(id,"birigui"),404,regional)
        get("/api/units/birigui/stock/materials",200,regional)
        put("${path(id,"birigui")}/receipts/$key", incoming(unit),403,regional)
        val writeOnly = jwt().jwt { it.subject("00000000-0000-4000-8000-000000000003").issuer(System.getenv("OIDC_ISSUER")) }
        val role = "stock-write-only-" + UUID.randomUUID()
        db.update("insert into job_role(id,name) values (?,?)",role,role)
        try {
            db.update("insert into role_action(role_id,action) values (?,'stock.write')",role)
            db.update("""insert into assignment(group_id,account_id,role_id,plant_id)
                values ('mundo-eduk','00000000-0000-4000-8000-000000000003',?,'eduk')""",role)
            get(path,403,writeOnly)
            put("$path/receipts/${UUID.randomUUID()}", incoming(unit),403,writeOnly)
        } finally {
            db.update("delete from assignment where role_id=?",role)
            db.update("delete from role_action where role_id=?",role)
            db.update("delete from job_role where id=?",role)
        }
        get(path(UUID.randomUUID()),404)
        put("${path(UUID.randomUUID())}/receipts/$key", incoming(unit),404)
    }

    @Test fun serializesCompetingFirstMovements() {
        fun compete(id: UUID, unit: UUID, keys: List<UUID>): List<Int> {
            val start = CyclicBarrier(2)
            return Executors.newFixedThreadPool(2).use { pool ->
                pool.invokeAll(keys.map { key -> Callable {
                    start.await(10,TimeUnit.SECONDS)
                    mvc.put("${path(id)}/opening/$key") {
                        with(admin)
                        contentType=MediaType.APPLICATION_JSON
                        content=json.writeValueAsString(incoming(unit))
                    }.andReturn().response.status
                } }).map { it.get(15, TimeUnit.SECONDS) }.sorted()
            }
        }
        val (first,unit) = material()
        val key = UUID.randomUUID()
        assertEquals(listOf(200,200),compete(first,unit,listOf(key,key)))
        val (second,secondUnit) = material()
        assertEquals(listOf(200,409),compete(second,secondUnit,List(2){UUID.randomUUID()}))
        for (material in listOf(first,second)) {
            val balance = get(path(material))
            assertEquals(1, balance["movements"].size())
            assertEquals("100",balance["available"].stringValue())
        }
    }
}
