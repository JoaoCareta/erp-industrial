package erp.purchasing

import erp.access.Access
import erp.stock.Actor
import erp.stock.IncomingStock
import erp.stock.MovementKind
import erp.stock.Stock
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.util.UUID

data class PurchaseInput(val materialId:UUID,val unitId:UUID,val quantity:JsonNode,val amount:String,val date:LocalDate,val supplier:String)
data class Purchase(val id:UUID,val materialId:UUID,val unitId:UUID,val quantity:String,val amount:String,val date:LocalDate,
                    val supplier:String,val movementId:UUID,val reversalId:UUID,val reversed:Boolean)
data class PurchaseSummary(val quantity:String,val amount:String,val average:String?,val last:String?)

/** Shared purchase history and valuation for queries and industrial costing. Reversals are traced through their receipt. */
@org.springframework.stereotype.Service
class PurchaseHistory(private val db:JdbcTemplate) {
    private val mapper=RowMapper { r,_ -> Purchase(r.getObject("id",UUID::class.java),r.getObject("material_id",UUID::class.java),
        r.getObject("unit_id",UUID::class.java),r.getBigDecimal("quantity").stripTrailingZeros().toPlainString(),r.getBigDecimal("amount").toPlainString(),
        r.getObject("purchase_date",LocalDate::class.java),r.getString("supplier"),r.getObject("movement_id",UUID::class.java),
        r.getObject("reversal_id",UUID::class.java),r.getBoolean("reversed")) }
    private val select="""select p.*,exists(select 1 from stock_movement s where s.plant_id=p.plant_id and s.source_id=p.movement_id) as reversed
        from material_purchase p where p.plant_id=?"""
    internal fun list(plant:String)=db.query(select+" order by purchase_date desc,created_at desc,id",mapper,plant)
    internal fun find(plant:String,id:UUID)=db.query(select+" and p.id=?",mapper,plant,id).singleOrNull()
    /** Prices for a simulation use effective purchases in the same plant and material reference unit. */
    fun unitCosts(plant:String,method:String):Map<UUID,BigDecimal> =
        list(plant).filterNot { it.reversed }.groupBy { it.materialId }.mapValues { (_,rows) ->
            val first=rows.first()
            if(method=="last") first.amount.toBigDecimal().divide(first.quantity.toBigDecimal(),12,RoundingMode.HALF_UP)
            else rows.sumOf { it.amount.toBigDecimal() }.divide(rows.sumOf { it.quantity.toBigDecimal() },12,RoundingMode.HALF_UP)
        }
}

@RestController
@RequestMapping("/api/units/{plant}/purchases")
class Purchases(private val access:Access,private val stock:Stock,private val db:JdbcTemplate,private val purchaseHistory:PurchaseHistory) {
    private fun write(jwt:Jwt,plant:String):String {
        access.check(jwt,"purchases.read",plant)
        return access.check(jwt,"purchases.write",plant)
    }
    @GetMapping fun history(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):List<Purchase> {
        access.check(jwt,"purchases.read",plant)
        return purchaseHistory.list(plant)
    }
    @GetMapping("/materials") fun materials(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String)=
        stock.list(access.check(jwt,"purchases.read",plant),plant)

    @GetMapping("/summary") fun summary(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@RequestParam materialId:UUID,
            @RequestParam(required=false) from:LocalDate?,@RequestParam(required=false) until:LocalDate?,
            @RequestParam(required=false) supplier:String?):PurchaseSummary {
        access.check(jwt,"purchases.read",plant)
        require(from==null || until==null || from<=until)
        val rows=purchaseHistory.list(plant).filter { !it.reversed && it.materialId==materialId && (from==null || it.date>=from) &&
            (until==null || it.date<=until) && (supplier==null || it.supplier.contains(supplier,true)) }
        val qty=rows.sumOf { it.quantity.toBigDecimal() }
        val total=rows.sumOf { it.amount.toBigDecimal() }
        fun price(amount:BigDecimal,quantity:BigDecimal)=amount.divide(quantity,2,RoundingMode.HALF_UP).toPlainString()
        return PurchaseSummary(qty.stripTrailingZeros().toPlainString(),total.setScale(2).toPlainString(),
            if(rows.isEmpty()) null else price(total,qty),rows.firstOrNull()?.let { price(it.amount.toBigDecimal(),it.quantity.toBigDecimal()) })
    }

    @PutMapping("/{id}") @Transactional(isolation=Isolation.READ_COMMITTED)
    fun record(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID,@RequestBody input:PurchaseInput):Purchase {
        val group=write(jwt,plant)
        val qty=IncomingStock(input.quantity,input.unitId).amount()
        val supplier=input.supplier.trim()
        require(supplier.length in 1..160 && input.amount.matches(Regex("""\d{1,16}(\.\d{1,2})?""")))
        val amount=input.amount.toBigDecimal().setScale(2)
        // Reserve the key before generating the stock movement. A concurrent replay reads the committed row.
        db.queryForObject("select id from plant where id=? for update",String::class.java,plant)
        purchaseHistory.find(plant,id)?.let {
            if(it.materialId!=input.materialId || it.unitId!=input.unitId || it.quantity.toBigDecimal().compareTo(qty)!=0 ||
                it.supplier!=supplier || it.date!=input.date || it.amount!=amount.toPlainString())
                throw ResponseStatusException(HttpStatus.CONFLICT,"Chave de compra já utilizada")
            return it
        }
        val movement=UUID.randomUUID()
        stock.record(group,plant,input.materialId,movement,MovementKind.receipt,Actor(jwt.issuer.toString(),jwt.subject),qty,input.unitId)
        db.update("""insert into material_purchase(plant_id,id,material_id,unit_id,movement_id,reversal_id,purchase_date,supplier,
            quantity,amount,actor_subject,actor_issuer) values(?,?,?,?,?,?,?,?,?,?,?,?)""",plant,id,input.materialId,input.unitId,
            movement,UUID.randomUUID(),input.date,supplier,qty,amount,jwt.subject,jwt.issuer.toString())
        return purchaseHistory.find(plant,id)!!
    }
    @PutMapping("/{id}/reversal") @Transactional(isolation=Isolation.READ_COMMITTED)
    fun reverse(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID):Purchase {
        val group=write(jwt,plant)
        val purchase=purchaseHistory.find(plant,id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if(!purchase.reversed) stock.record(group,plant,purchase.materialId,purchase.reversalId,MovementKind.reversal,
            Actor(jwt.issuer.toString(),jwt.subject),source=purchase.movementId)
        return purchaseHistory.find(plant,id)!!
    }
}
