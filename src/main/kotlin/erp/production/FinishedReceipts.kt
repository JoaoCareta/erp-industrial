package erp.production

import erp.access.Access
import erp.stock.FinishedStock
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.util.UUID

data class CheckedKits(val quantity: JsonNode)
data class FinishedBalance(val received: Int, val remaining: Int, val stock: Long)

@RestController
@RequestMapping("/api/units/{plant}/production-orders/{id}/finished-receipts")
class FinishedReceipts(private val access: Access, private val orders: ProductionOrders, private val finished: FinishedStock, private val db: JdbcTemplate) {
    private fun balance(plant: String, order: ProductionOrder): FinishedBalance {
        val received = db.queryForObject("select coalesce(sum(effective_quantity),0) from finished_kit_receipt where plant_id=? and order_id=?",
            Int::class.java,plant,order.id)!!
        val stock = finished.balance(plant,order.productId).available
        return FinishedBalance(received,order.quantity-received,stock)
    }

    @GetMapping
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    fun get(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String,@PathVariable id: UUID): FinishedBalance {
        access.check(jwt,"production.read",plant)
        return balance(plant,orders.get(plant,id))
    }

    /** A conferência física gera a entrada. O bloqueio da OS serializa lotes concorrentes e reenvios. */
    @PutMapping("/{requestId}")
    @Transactional(isolation=Isolation.READ_COMMITTED)
    fun receive(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String,@PathVariable id: UUID,
                @PathVariable requestId: UUID,@RequestBody input: CheckedKits): FinishedBalance {
        access.check(jwt,"production.read",plant)
        val actor = access.actorName(jwt,"production.receive",plant)
        val quantity = input.quantity.integerAtLeast(1)
        val order = orders.lock(plant,id)
        val current = balance(plant,order)
        val previous = db.queryForList("select quantity from finished_kit_receipt where plant_id=? and order_id=? and request_id=?",
            Int::class.java,plant,id,requestId).singleOrNull()
        if (previous == quantity) return current
        if (previous != null || order.status != "released" || quantity > current.remaining)
            throw ResponseStatusException(HttpStatus.CONFLICT,"Confira a liberação, o saldo da OS e o lote informado")
        db.update("""insert into finished_kit_receipt(plant_id,order_id,request_id,quantity,effective_quantity,actor_name,actor_subject,actor_issuer)
            values(?,?,?,?,?,?,?,?)""",plant,id,requestId,quantity,quantity,actor,jwt.subject,jwt.issuer.toString())
        finished.receive(plant,order.productId,quantity)
        return balance(plant,order)
    }
}
