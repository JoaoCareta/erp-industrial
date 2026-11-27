package erp.production

import erp.stock.StockReservations
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

data class Consumption(val materialId: UUID, val quantity: String)
data class StageCommand(val pieceIndex: Int, val stepIndex: Int, val quantity: Int, val consumption: Consumption?)
data class StageReport(val requestId: UUID, val pieceIndex: Int, val stepIndex: Int, val quantity: Int,
                       val consumption: Consumption?, val actor: String, val occurredAt: Instant)
data class StageProgress(val stepIndex: Int, val name: String, val available: String, val completed: String)
data class PieceProgress(val pieceIndex: Int, val name: String, val total: String, val steps: List<StageProgress>)
data class MaterialProgress(val materialId: UUID, val name: String, val unitCode: String,
                            val initial: String, val consumed: String, val remaining: String)
data class Execution(val orderId: UUID, val number: Long, val productName: String, val quantity: Int, val version: Int,
                     val pieces: List<PieceProgress>, val materials: List<MaterialProgress>, val reports: List<StageReport>)

private fun conflict(message: String) = ResponseStatusException(HttpStatus.CONFLICT,message)
private fun BigDecimal.display() = stripTrailingZeros().toPlainString()

/** A etapa pode receber o volume concluído na anterior, descontadas as peças já apontadas nesta etapa. */
private fun ProductionOrder.progress(reports: List<StageReport>): Execution {
    if (releasedAt == null) throw conflict("Libere a OS antes de iniciar o roteiro")
    val completed = reports.groupBy { it.pieceIndex to it.stepIndex }
        .mapValues { (_, work) -> work.sumOf { it.quantity.toLong() } }
    val pieces = this.pieces.mapIndexed { pieceIndex, piece ->
        val total = quantity.toLong() * piece.perKit
        var received = total
        val steps = piece.steps.mapIndexed { stepIndex, name ->
            val done = completed.getOrDefault(pieceIndex to stepIndex,0L)
            val available = received - done
            received = done
            StageProgress(stepIndex,name,available.toString(),done.toString())
        }
        PieceProgress(pieceIndex,piece.name,total.toString(),steps)
    }
    val consumed = reports.mapNotNull { it.consumption }.groupBy { it.materialId }
        .mapValues { (_, uses) -> uses.sumOf { it.quantity.toBigDecimal() } }
    val materials = this.materials.map { material ->
        val used = consumed.getOrDefault(material.materialId,BigDecimal.ZERO)
        MaterialProgress(material.materialId,material.name,material.unitCode,material.required,used.display(),
            (material.required.toBigDecimal() - used).display())
    }
    return Execution(id,number,productName,quantity,version,pieces,materials,reports)
}

@Service
class OrderExecution(private val db: JdbcTemplate, private val orders: ProductionOrders, private val stock: StockReservations) {
    private fun readReport(row: ResultSet) = StageReport(row.getObject("request_id",UUID::class.java),
        row.getInt("piece_index"),row.getInt("step_index"),row.getInt("quantity"),
        row.getObject("material_id",UUID::class.java)?.let { Consumption(it,row.getBigDecimal("consumed").display()) },
        row.getString("actor_name"),row.getObject("occurred_at",LocalDateTime::class.java).toInstant(ZoneOffset.UTC))

    private fun reports(plant: String, id: UUID) = db.query(
        "select * from production_stage_report where plant_id=? and order_id=? order by sequence_id desc",
        { row, _ -> readReport(row) },plant,id)

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun board(plant: String): List<Execution> {
        val reports = db.query("select * from production_stage_report where plant_id=? order by sequence_id desc",
            { row, _ -> row.getObject("order_id",UUID::class.java) to readReport(row) },plant)
            .groupBy({ it.first },{ it.second })
        return orders.released(plant).map { it.progress(reports[it.id].orEmpty()) }
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun detail(plant: String, id: UUID): Execution = orders.get(plant,id).progress(reports(plant,id))

    /** O mesmo bloqueio protege a liberação, o saldo por etapa e a deduplicação da OS até o commit do consumo. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun report(plant: String, id: UUID, requestId: UUID, command: StageCommand, actor: OrderActor, actorName: String): Execution {
        val order = orders.lock(plant,id)
        val before = order.progress(reports(plant,id))
        val replay = before.reports.find { it.requestId == requestId }
        if (replay != null) {
            if (StageCommand(replay.pieceIndex,replay.stepIndex,replay.quantity,replay.consumption) != command)
                throw conflict("Chave de apontamento reutilizada com outros dados")
            return before
        }
        val piece = before.pieces.getOrNull(command.pieceIndex)
        val step = piece?.steps?.getOrNull(command.stepIndex) ?: throw IllegalArgumentException("Etapa ausente no roteiro da peça")
        if (command.quantity.toLong() > step.available.toLong()) throw conflict("Quantidade acima do saldo disponível nesta etapa")
        val used = command.consumption
        val amount = used?.let { material ->
            if (before.materials.none { it.materialId == material.materialId }) throw conflict("Material ausente na ficha da OS")
            val quantity = material.quantity.toBigDecimal()
            stock.consume(plant,id,requestId,material.materialId,quantity,actor.issuer,actor.subject)
            quantity
        }
        db.update("""insert into production_stage_report(plant_id, order_id, request_id, piece_index, step_index,
            quantity, material_id, consumed, actor_name, actor_issuer, actor_subject) values(?,?,?,?,?,?,?,?,?,?,?)""",
            plant,id,requestId,command.pieceIndex,command.stepIndex,command.quantity,used?.materialId,amount,
            actorName,actor.issuer,actor.subject)
        return order.progress(reports(plant,id))
    }
}
