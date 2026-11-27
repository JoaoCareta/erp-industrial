package erp.stock

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class KitBalance(val opening: Long, val produced: Long, val sold: Long, val disputed: Long = 0) {
    val available get() = (opening + produced - sold - disputed).coerceAtLeast(0)
}

/** The product account serializes receipts, sales and opening inventory across orders in one factory. */
@Service
class FinishedStock(private val db: JdbcTemplate) {
    fun balance(plant: String, product: UUID): KitBalance =
        db.query("select opening,produced,sold,disputed from finished_stock where plant_id=? and product_id=?",
            { r,_ -> KitBalance(r.getLong(1),r.getLong(2),r.getLong(3),r.getLong(4)) }, plant,product).singleOrNull() ?: KitBalance(0,0,0)

    @Transactional(propagation = Propagation.MANDATORY)
    fun lock(plant: String, product: UUID) {
        db.update("""insert into finished_stock(plant_id,product_id) values(?,?)
            on duplicate key update product_id=values(product_id)""",plant,product)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun receive(plant: String, product: UUID, quantity: Int) {
        lock(plant,product)
        db.update("update finished_stock set produced=produced+? where plant_id=? and product_id=?",quantity,plant,product)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun adjust(plant: String, product: UUID, delta: Int, disputedChange: Int) {
        db.update("update finished_stock set produced=produced+?,disputed=disputed+? where plant_id=? and product_id=?",
            delta,disputedChange,plant,product)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun sell(plant: String, product: UUID, quantity: Int) {
        val changed = db.update("""update finished_stock set sold=sold+? where plant_id=? and product_id=?
            and opening+produced-sold-disputed>=?""",quantity,plant,product,quantity)
        if (changed != 1) throw ResponseStatusException(HttpStatus.CONFLICT,"Saldo de acabados insuficiente")
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun open(plant: String, product: UUID, request: UUID, quantity: Int, actor: Actor) {
        lock(plant,product)
        val changed = db.update("""update finished_stock set opening=?,opening_request=?,opening_actor=?,opening_issuer=?,
            opened_at=utc_timestamp(6) where plant_id=? and product_id=? and opening_request is null""",
            quantity,request,actor.subject,actor.issuer,plant,product)
        if (changed == 0 && db.queryForObject("""select count(*) from finished_stock where plant_id=? and product_id=?
            and opening_request=? and opening=?""",Int::class.java,plant,product,request,quantity) != 1)
            throw ResponseStatusException(HttpStatus.CONFLICT,"Inventário inicial já registrado")
    }
}
