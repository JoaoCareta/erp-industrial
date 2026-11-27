package erp.stock

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.util.UUID

data class ReservationLine(val materialId: UUID, val unitId: UUID, val quantity: BigDecimal)

@Service
class StockReservations(private val db: JdbcTemplate) {
    internal fun reserved(plant: String, materialId: UUID): BigDecimal = db.queryForObject(
        "select coalesce(sum(quantity - consumed),0) from stock_reservation where plant_id=? and material_id=?",
        BigDecimal::class.java, plant, materialId)!!

    /**
     * Adds the pinned material totals in the order release's READ COMMITTED transaction.
     * Lock the same accounts as physical stock movements, in a stable order across all releases.
     * The caller holds the order lock and has already checked that it is still a draft.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun reserve(plant: String, orderId: UUID, lines: List<ReservationLine>) {
        for ((material, unit, quantity) in lines.sortedBy { it.materialId }) {
            checkQuantity(quantity)
            val stockUnit = lockAccount(plant, material)
            if (unit != stockUnit) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "A unidade de medida da ficha difere da unidade do estoque")
            }
            val physical = db.queryForObject(
                "select coalesce(sum(quantity),0) from stock_movement where plant_id=? and material_id=?",
                BigDecimal::class.java, plant, material)!!
            if (quantity > physical - reserved(plant, material)) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Saldo disponível insuficiente para a reserva")
            }
            db.update("insert into stock_reservation(plant_id, material_id, order_id, quantity) values(?,?,?,?)",
                plant, material, orderId, quantity)
        }
    }

    /**
     * Requires the stage report's transaction and order lock. Issuing reserved material reduces physical and
     * reserved stock by the same amount. The physical movement retains its own UUID and links to the report.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun consume(plant: String, orderId: UUID, reportId: UUID, materialId: UUID, quantity: BigDecimal,
                issuer: String, subject: String) {
        checkQuantity(quantity)
        lockAccount(plant, materialId)
        val changed = db.update("""update stock_reservation set consumed=consumed+?
            where plant_id=? and material_id=? and order_id=? and quantity-consumed >= ?""",
            quantity, plant, materialId, orderId, quantity)
        if (changed == 0) throw ResponseStatusException(HttpStatus.CONFLICT, "Saldo reservado insuficiente para esta OS")
        db.update("""insert into stock_movement(plant_id,material_id,request_id,kind,quantity,order_id,report_id,actor_issuer,actor_subject)
            values(?,?,?,'consumption',?,?,?,?,?)""",
            plant, materialId, UUID.randomUUID(), quantity.negate(), orderId, reportId, issuer, subject)
    }

    private fun checkQuantity(quantity: BigDecimal) {
        if (quantity.signum() <= 0 || quantity > maxQuantity || quantity.stripTrailingZeros().scale() > 6) {
            throw ResponseStatusException(HttpStatus.CONFLICT,
                "Informe uma quantidade positiva com até 12 dígitos inteiros e seis casas decimais")
        }
    }

    private fun lockAccount(plant: String, material: UUID): UUID = db.queryForList(
        "select unit_id from stock_account where plant_id=? and material_id=? for update",
        UUID::class.java, plant, material).singleOrNull()
        ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Material sem saldo nesta fábrica")

    private companion object {
        val maxQuantity = BigDecimal("999999999999.999999")
    }
}
