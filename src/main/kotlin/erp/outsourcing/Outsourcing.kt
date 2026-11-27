package erp.outsourcing

import erp.access.Access
import erp.production.ProductionOrders
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.time.LocalDate
import java.util.UUID

data class ShipmentInput(val orderId:UUID,val pieceIndex:JsonNode,val partner:String,val date:LocalDate,val quantity:JsonNode,val unitPrice:String)
data class ReturnInput(val date:LocalDate,val returned:JsonNode,val lost:JsonNode,val note:String)
data class DispatchPiece(val name:String)
data class DispatchOrder(val id:UUID,val number:Long,val productName:String,val pieces:List<DispatchPiece>)
data class Delivery(val id:UUID,val date:LocalDate,val returned:Int,val lost:Int,val note:String)
data class Shipment(val id:UUID,val orderId:UUID,val pieceIndex:Int,val piece:String,val number:Long,val partner:String,val date:LocalDate,
                    val quantity:Int,val unitPrice:String,val deliveries:List<Delivery>) {
    val remaining get()=quantity-deliveries.sumOf { it.returned+it.lost }
    val serviceOnReturned get()=(unitPrice.toBigDecimal()*deliveries.sumOf { it.returned }.toBigDecimal()).toPlainString()
}
private fun JsonNode.count(min:Int):Int {
    require(isIntegralNumber && canConvertToInt() && intValue()>=min)
    return intValue()
}
@RestController
@RequestMapping("/api/units/{plant}/outsourcing")
class Outsourcing(private val access:Access,private val orders:ProductionOrders,private val db:JdbcTemplate) {
    private fun conflict():Nothing=throw ResponseStatusException(HttpStatus.CONFLICT,"Confira a remessa, a data e a quantidade pendente")
    private fun records(plant:String,id:UUID?=null):List<Shipment> {
        val where=if(id==null) "" else " and id=?"
        val args=if(id==null) arrayOf<Any>(plant) else arrayOf<Any>(plant,id)
        return db.query("select * from external_shipment where plant_id=?"+where+" order by shipped desc,id",{r,_->
            val key=r.getObject("id",UUID::class.java)
            val order=orders.get(plant,r.getObject("order_id",UUID::class.java))
            val index=r.getInt("piece_index")
            val deliveries=db.query("select * from external_return where plant_id=? and shipment_id=? order by received,id",{row,_->
                Delivery(row.getObject("id",UUID::class.java),row.getObject("received",LocalDate::class.java),row.getInt("returned"),
                    row.getInt("lost"),row.getString("note"))},plant,key)
            Shipment(key,order.id,index,order.pieces[index].name,order.number,r.getString("partner"),r.getObject("shipped",LocalDate::class.java),
                r.getInt("quantity"),r.getBigDecimal("unit_price").toPlainString(),deliveries)
        },*args)
    }
    @GetMapping("/orders") fun choices(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):List<DispatchOrder> {
        authorize(jwt,plant)
        return orders.list(plant).filter { it.status=="released" }.map { o ->
            DispatchOrder(o.id,o.number,o.productName,o.pieces.map { DispatchPiece(it.name) })
        }
    }
    @GetMapping fun list(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):List<Shipment> {
        access.check(jwt,"outsourcing.read",plant)
        return records(plant)
    }
    private fun authorize(jwt:Jwt,plant:String) {
        access.check(jwt,"outsourcing.read",plant)
        access.check(jwt,"outsourcing.write",plant)
    }
    @PutMapping("/{key}") @Transactional(isolation=Isolation.READ_COMMITTED)
    fun dispatch(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable key:UUID,@RequestBody input:ShipmentInput):Shipment {
        authorize(jwt,plant)
        val order=orders.lock(plant,input.orderId)
        val index=input.pieceIndex.count(0)
        val piece=order.pieces.getOrNull(index) ?: throw IllegalArgumentException("Peça ausente da OS")
        val qty=input.quantity.count(1)
        val partner=input.partner.trim()
        require(partner.length in 1..160 && input.unitPrice.matches(Regex("""\d{1,13}(\.\d{1,2})?""")))
        val price=input.unitPrice.toBigDecimal().setScale(2).toPlainString()
        records(plant,key).singleOrNull()?.let {
            if(it.orderId!=order.id || it.pieceIndex!=index || it.quantity!=qty || it.date!=input.date || it.partner!=partner || it.unitPrice!=price) conflict()
            return it
        }
        val outstanding=db.queryForObject("""select coalesce(sum(s.quantity-(select coalesce(sum(r.returned+r.lost),0) from external_return r
            where r.plant_id=s.plant_id and r.shipment_id=s.id)),0) from external_shipment s where s.plant_id=? and s.order_id=? and s.piece_index=?""",
            Long::class.java,plant,order.id,index)!!
        if(order.status!="released" || qty+outstanding>order.quantity.toLong()*piece.perKit) conflict()
        db.update("insert into external_shipment(plant_id,id,order_id,piece_index,partner,shipped,quantity,unit_price,actor_subject,actor_issuer) values(?,?,?,?,?,?,?,?,?,?)",
            plant,key,order.id,index,partner,input.date,qty,price,jwt.subject,jwt.issuer.toString())
        return records(plant,key).single()
    }
    @PutMapping("/{key}/returns/{event}") @Transactional(isolation=Isolation.READ_COMMITTED)
    fun receive(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable key:UUID,@PathVariable event:UUID,@RequestBody input:ReturnInput):Shipment {
        authorize(jwt,plant)
        val orderId=db.queryForList("select order_id from external_shipment where plant_id=? and id=?",UUID::class.java,plant,key).singleOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        orders.lock(plant,orderId)
        val s=records(plant,key).single()
        val row=Delivery(event,input.date,input.returned.count(0),input.lost.count(0),input.note.trim())
        require(row.note.length in 1..500 && row.returned.toLong()+row.lost>0)
        s.deliveries.find { it.id==event }?.let { if(it!=row) conflict();return s }
        if(row.date<s.date || row.returned.toLong()+row.lost>s.remaining) conflict()
        db.update("insert into external_return(plant_id,shipment_id,id,received,returned,lost,note,actor_subject,actor_issuer) values(?,?,?,?,?,?,?,?,?)",
            plant,key,event,row.date,row.returned,row.lost,row.note,jwt.subject,jwt.issuer.toString())
        return records(plant,key).single()
    }
}
