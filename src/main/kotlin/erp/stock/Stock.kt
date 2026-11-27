package erp.stock

import erp.engineering.MaterialReference
import erp.engineering.StockCatalog
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

enum class MovementKind { opening, receipt, reversal, consumption }
data class StockMaterial(val id: UUID, val code: String, val name: String, val unitId: UUID, val unitCode: String, val canReceive: Boolean)
data class Movement(val requestId: UUID, val quantity: String, val occurredAt: Instant, val kind: MovementKind,
                    val sourceId: UUID?, val orderId: UUID?, val reportId: UUID?)
data class Balance(val physical: String, val reserved: String, val available: String, val unitCode: String, val movements: List<Movement>)
data class Actor(val issuer: String, val subject: String)
private fun BigDecimal.decimalString() = stripTrailingZeros().toPlainString()
private fun conflict(reason: String) = ResponseStatusException(HttpStatus.CONFLICT, reason)
private fun missing() = ResponseStatusException(HttpStatus.NOT_FOUND, "Material ou movimento ausente")

@Service
class Stock(private val db: JdbcTemplate, private val catalog: StockCatalog, private val reservations: StockReservations) {
    private val account = RowMapper { row, _ ->
        MaterialReference(row.getObject("material_id", UUID::class.java), row.getString("material_code"),
            row.getString("material_name"),row.getObject("unit_id",UUID::class.java),row.getString("unit_code"))
    }
    private fun existing(plant: String, material: UUID) =
        db.query("select * from stock_account where plant_id=? and material_id=?", account, plant, material).singleOrNull()

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun list(group: String, plant: String): List<StockMaterial> {
        val active = catalog.list(group).associateBy { it.id }
        val historical = db.query("select * from stock_account where plant_id=?", account, plant).associateBy { it.id }
        return (active + historical).values.map { material ->
            StockMaterial(material.id, material.code, material.name, material.unitId, material.unitCode,
                active[material.id]?.unitId == material.unitId)
        }.sortedWith(compareBy({ it.code }, { it.id }))
    }

    private fun history(plant: String, reference: MaterialReference): Balance {
        val events = db.query("""select request_id, quantity, occurred_at, kind, source_id, order_id, report_id from stock_movement
                where plant_id=? and material_id=? order by sequence_id""", { row, _ ->
            Movement(row.getObject("request_id", UUID::class.java), row.getBigDecimal("quantity").decimalString(),
                row.getObject("occurred_at", LocalDateTime::class.java).toInstant(ZoneOffset.UTC),
                MovementKind.valueOf(row.getString("kind")),row.getObject("source_id",UUID::class.java),
                row.getObject("order_id", UUID::class.java), row.getObject("report_id", UUID::class.java))
        }, plant, reference.id)
        val physical = events.sumOf { it.quantity.toBigDecimal() }
        val reserved = reservations.reserved(plant, reference.id)
        return Balance(physical.decimalString(), reserved.decimalString(), (physical - reserved).decimalString(),
            reference.unitCode, events)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun balance(group: String, plant: String, material: UUID): Balance {
        val reference = existing(plant,material) ?: catalog.find(group, material) ?: throw missing()
        return history(plant, reference)
    }

    /** A linha da conta serializa abertura, entradas e estornos deste material na fábrica.
     * A chave da requisição tem escopo de fábrica e a comparação da carga ocorre sob o mesmo bloqueio. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun record(group: String, plant: String, material: UUID, request: UUID, kind: MovementKind, actor: Actor,
               quantity: BigDecimal? = null, unit: UUID? = null, source: UUID? = null): Balance {
        val active = catalog.lockForReceipt(group,material)
        val reference = active ?: existing(plant, material) ?: throw missing()
        db.update("""insert into stock_account(plant_id,material_id,material_code,material_name,unit_id,unit_code)
            values(?,?,?,?,?,?) on duplicate key update material_id=values(material_id)""",
            plant, material, reference.code, reference.name, reference.unitId, reference.unitCode)
        // Another transaction may have won the first movement with a different catalog snapshot.
        val saved = db.queryForObject("select * from stock_account where plant_id=? and material_id=? for update",
            account, plant, material)
        val before = history(plant, saved)
        val otherMaterial = db.queryForObject("""select exists(select 1 from stock_movement
            where plant_id=? and request_id=? and material_id<>?)""", Boolean::class.java, plant, request, material)
        if (otherMaterial == true) throw conflict("Chave já utilizada para outro material")
        val replay = before.movements.find { it.requestId == request }
        if (replay != null) {
            if (replay.kind != kind || replay.sourceId != source ||
                (kind != MovementKind.reversal && (saved.unitId != unit || replay.quantity != quantity!!.decimalString()))) {
                throw conflict("Chave reutilizada com dados diferentes")
            }
            return before
        }
        val delta = if (kind == MovementKind.reversal) {
            val origin = before.movements.find { it.requestId == source } ?: throw missing()
            if (origin.kind == MovementKind.reversal || origin.kind == MovementKind.consumption || before.movements.any { it.sourceId == source }) {
                throw conflict("Movimento já estornado ou inválido para estorno")
            }
            origin.quantity.toBigDecimal().negate()
        } else {
            if (active?.unitId != saved.unitId) throw conflict("Cadastro indisponível para novas entradas nesta unidade de medida")
            require(unit == saved.unitId) { "Unidade de medida incompatível" }
            if (kind == MovementKind.opening && before.movements.isNotEmpty()) throw conflict("O extrato já possui movimentação")
            quantity!!
        }
        if (before.available.toBigDecimal() + delta < BigDecimal.ZERO) throw conflict("Saldo disponível insuficiente")
        db.update("""insert into stock_movement(plant_id,material_id,request_id,kind,quantity,source_id,actor_issuer,actor_subject)
            values(?,?,?,?,?,?,?,?)""", plant, material, request, kind.name, delta, source, actor.issuer, actor.subject)
        return history(plant,saved)
    }
}
