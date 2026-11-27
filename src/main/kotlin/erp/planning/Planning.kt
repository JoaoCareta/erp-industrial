package erp.planning

import erp.access.Access
import erp.engineering.Catalog
import erp.engineering.Kind
import erp.engineering.ProductionCatalog
import erp.production.ProductionOrders
import erp.stock.MovementKind
import erp.stock.Stock
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

data class PieceMove(val partId:UUID,val kind:String,val quantity:JsonNode,val reason:String,val origin:UUID?=null)
data class PartEvent(val id:UUID,val partId:UUID,val kind:String,val quantity:Int,val physical:Int,val reserved:Int,val reason:String,val origin:UUID?)
data class PartCapacity(val partId:UUID,val name:String,val perKit:Int,val ready:Long,val reserved:Long,val free:Long,val kits:Long)
data class Capacity(val kits:Long,val parts:List<PartCapacity>)
data class Restock(val id:UUID,val name:String,val unit:String,val physical:String,val available:String,val consumed:String,val reorder:Boolean)

@RestController
@RequestMapping("/api/units/{plant}/planning")
class Planning(private val access:Access,private val db:JdbcTemplate,private val catalog:Catalog,private val sheets:ProductionCatalog,
               private val orders:ProductionOrders,private val stock:Stock) {
    private fun conflict():Nothing=throw ResponseStatusException(HttpStatus.CONFLICT,"Confira o saldo, a origem e os dados do movimento")
    private fun changes(plant:String)=db.query("select * from piece_movement where plant_id=? order by created_at,id",{r,_->
        PartEvent(r.getObject("id",UUID::class.java),r.getObject("part_id",UUID::class.java),r.getString("kind"),r.getInt("quantity"),
            r.getInt("physical_delta"),r.getInt("reserved_delta"),r.getString("reason"),r.getObject("origin",UUID::class.java))
    },plant)
    @GetMapping("/products") fun products(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String)=sheets.products(access.check(jwt,"planning.read",plant))
    @GetMapping("/movements") fun history(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):List<PartEvent> {
        access.check(jwt,"planning.read",plant)
        return changes(plant)
    }
    @GetMapping("/products/{product}/versions/{version}/capacity")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    fun capacity(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable product:UUID,@PathVariable version:Int):Capacity {
        val group=access.check(jwt,"planning.read",plant)
        val ready=orders.completedParts(group,plant)
        val moves=changes(plant).groupBy { it.partId }
        val parts=sheets.sheet(group,product,version).pieces.map { p->
            val part=requireNotNull(p.partId)
            val events=moves[part].orEmpty()
            val physical=(ready[part] ?: 0L)+events.sumOf { it.physical.toLong() }
            val reserved=events.sumOf { it.reserved.toLong() }
            PartCapacity(part,p.name,p.perKit,physical,reserved,physical-reserved,(physical-reserved)/p.perKit)
        }
        return Capacity(parts.minOf { it.kits },parts)
    }
    @PutMapping("/movements/{key}") @Transactional(isolation=Isolation.READ_COMMITTED)
    fun move(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable key:UUID,@RequestBody input:PieceMove):PartEvent {
        val group=access.check(jwt,"planning.read",plant)
        access.check(jwt,"planning.write",plant)
        catalog.get(group,input.partId,Kind.part)
        val q=input.quantity
        require(q.isIntegralNumber && q.canConvertToInt() && q.intValue()>0 && input.reason.trim().length in 1..500)
        val n=q.intValue()
        db.update("insert into piece_account(plant_id,part_id) values(?,?) on duplicate key update part_id=values(part_id)",plant,input.partId)
        val events=changes(plant)
        events.find { it.id==key }?.let {
            if(it.kind!=input.kind || it.quantity!=n || it.reason!=input.reason.trim() || it.origin!=input.origin || it.partId!=input.partId) conflict()
            return it
        }
        val part=events.filter { it.partId==input.partId }
        require((input.kind=="reversal")== (input.origin!=null))
        val (physical,reserved)=when(input.kind) {
            "opening" -> { if(part.any { it.kind=="opening" }) conflict(); n to 0 }
            "reserve" -> 0 to n
            "release" -> 0 to -n
            "loss","assembly" -> -n to 0
            "assembleReserved" -> -n to -n
            "reversal" -> {
                val source=part.find { it.id==input.origin } ?: conflict()
                if(source.quantity!=n || source.kind=="reversal" || part.any { it.origin==source.id }) conflict()
                -source.physical to -source.reserved
            }
            else -> throw IllegalArgumentException("Tipo de movimento inválido")
        }
        val available=(orders.completedParts(group,plant)[input.partId] ?: 0L)+part.sumOf { it.physical.toLong() }+physical
        val held=part.sumOf { it.reserved.toLong() }+reserved
        if(held<0 || held>available) conflict()
        db.update("""insert into piece_movement(plant_id,part_id,id,kind,quantity,physical_delta,reserved_delta,reason,origin,actor_subject,actor_issuer)
            values(?,?,?,?,?,?,?,?,?,?,?)""",plant,input.partId,key,input.kind,n,physical,reserved,input.reason.trim(),input.origin,jwt.subject,jwt.issuer.toString())
        return PartEvent(key,input.partId,input.kind,n,physical,reserved,input.reason.trim(),input.origin)
    }
    @GetMapping("/replenishment") @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    fun replenishment(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@RequestParam from:LocalDate,@RequestParam until:LocalDate,
                      @RequestParam basis:String,@RequestParam material:UUID,@RequestParam threshold:BigDecimal):Restock {
        val group=access.check(jwt,"planning.read",plant)
        access.check(jwt,"stock.read",plant)
        require(from<=until && basis in setOf("physical","available") && threshold.signum()>=0)
        val item=stock.list(group,plant).singleOrNull { it.id==material } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val balance=stock.balance(group,plant,material)
        val used=balance.movements.filter { it.kind==MovementKind.consumption && it.occurredAt.atZone(ZoneOffset.UTC).toLocalDate() in from..until }
            .sumOf { -it.quantity.toBigDecimal() }
        val compared=if(basis=="physical") balance.physical else balance.available
        return Restock(material,item.name,item.unitCode,balance.physical,balance.available,used.toPlainString(),compared.toBigDecimal()<threshold)
    }
}
