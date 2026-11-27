package erp.production

import erp.access.Access
import erp.stock.FinishedStock
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
import java.util.UUID

data class Reason(val reason:String) {
    fun checked() = reason.trim().also { require(it.length in 1..500) { "Informe um motivo de até 500 caracteres" } }
}
data class Recount(val receiptId:UUID,val revision:JsonNode,val counted:JsonNode,val reason:String)
data class ReceiptLine(val id:UUID,val quantity:Int,val effective:Int,val revision:Int)
data class Correction(val id:UUID,val orderId:UUID,val receiptId:UUID,val revision:Int,val prior:Int,val counted:Int,
                      val state:String,val reason:String,val resolution:String?,val actor:String,val createdAt:String)

@RestController
@RequestMapping("/api/units/{plant}/production-orders")
class Reconciliation(private val access:Access,private val orders:ProductionOrders,private val stock:FinishedStock,private val db:JdbcTemplate) {
    private val mapper=RowMapper { r,_ -> Correction(r.getObject("id",UUID::class.java),r.getObject("order_id",UUID::class.java),
        r.getObject("receipt_id",UUID::class.java),r.getInt("revision"),r.getInt("prior"),r.getInt("counted"),
        r.getString("state"),r.getString("reason"),r.getString("resolution"),r.getString("actor_subject"),r.getString("created_at")) }
    private fun conflict():Nothing=throw ResponseStatusException(HttpStatus.CONFLICT,"Confira a revisão, a pendência e o saldo")
    private fun missing():Nothing=throw ResponseStatusException(HttpStatus.NOT_FOUND,"Registro ausente nesta fábrica")
    private fun entries(plant:String,id:UUID)=db.query(
        "select * from finished_kit_receipt where plant_id=? and order_id=? order by received_at,request_id",
        { r,_ -> ReceiptLine(r.getObject("request_id",UUID::class.java),r.getInt("quantity"),r.getInt("effective_quantity"),r.getInt("revision")) },plant,id)
    private fun find(plant:String,id:UUID,key:UUID)=db.query("select * from kit_correction where plant_id=? and order_id=? and id=?",mapper,plant,id,key).singleOrNull()
    private fun authorize(jwt:Jwt,plant:String) {
        access.check(jwt,"production.read",plant)
        access.check(jwt,"production.correct",plant)
    }
    @GetMapping("/{id}/receipt-lines")
    fun receipts(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID):List<ReceiptLine> {
        access.check(jwt,"production.read",plant)
        orders.get(plant,id)
        return entries(plant,id)
    }
    @GetMapping("/corrections")
    fun history(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):List<Correction> {
        access.check(jwt,"production.read",plant)
        return db.query("select * from kit_correction where plant_id=? order by created_at desc,id",mapper,plant)
    }
    @PutMapping("/{id}/corrections/{key}")
    @Transactional(isolation=Isolation.READ_COMMITTED)
    fun correct(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID,@PathVariable key:UUID,
                @RequestBody body:Recount):Correction {
        authorize(jwt,plant)
        val order=orders.lock(plant,id)
        val counted=body.counted.integerAtLeast(0)
        val revision=body.revision.integerAtLeast(0)
        val reason=Reason(body.reason).checked()
        find(plant,id,key)?.let {
            if(it.receiptId!=body.receiptId || it.revision!=revision || it.counted!=counted || it.reason!=reason) conflict()
            return it
        }
        val lines=entries(plant,id)
        val line=lines.find { it.id==body.receiptId } ?: missing()
        val delta=counted-line.effective
        if(line.revision!=revision || delta==0 || lines.sumOf { it.effective.toLong() }+delta>order.quantity) conflict()
        stock.lock(plant,order.productId)
        val pending=stock.balance(plant,order.productId).available + delta < 0
        val state=if(pending) "pending" else "applied"
        db.update("""insert into kit_correction(plant_id,order_id,id,receipt_id,revision,prior,counted,reason,actor_subject,actor_issuer,state)
            values(?,?,?,?,?,?,?,?,?,?,?)""",plant,id,key,line.id,revision,line.effective,counted,reason,jwt.subject,jwt.issuer.toString(),state)
        if(pending) stock.adjust(plant,order.productId,0,-delta)
        else apply(plant,order,line.id,counted,delta,0)
        return find(plant,id,key)!!
    }
    private fun apply(plant:String,order:ProductionOrder,receipt:UUID,counted:Int,delta:Int,holdChange:Int) {
        stock.adjust(plant,order.productId,delta,holdChange)
        db.update("update finished_kit_receipt set effective_quantity=?,revision=revision+1 where plant_id=? and order_id=? and request_id=?",
            counted,plant,order.id,receipt)
    }
    @PutMapping("/{id}/corrections/{key}/resolution")
    @Transactional(isolation=Isolation.READ_COMMITTED)
    fun resolve(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID,@PathVariable key:UUID,
                @RequestBody body:Reason):Correction {
        authorize(jwt,plant)
        val order=orders.lock(plant,id)
        val correction=find(plant,id,key) ?: missing()
        val reason=body.checked()
        if(correction.state=="applied") {
            if(reason!=correction.resolution) conflict()
            return correction
        }
        stock.lock(plant,order.productId)
        val balance=stock.balance(plant,order.productId)
        val delta=correction.counted-correction.prior
        if(balance.opening+balance.produced-balance.sold < -delta.toLong()) conflict()
        apply(plant,order,correction.receiptId,correction.counted,delta,delta)
        db.update("""update kit_correction set state='applied',resolution=?,resolved_by=?,resolved_issuer=?,resolved_at=utc_timestamp(6)
            where plant_id=? and order_id=? and id=?""",reason,jwt.subject,jwt.issuer.toString(),plant,id,key)
        return find(plant,id,key)!!
    }
}
