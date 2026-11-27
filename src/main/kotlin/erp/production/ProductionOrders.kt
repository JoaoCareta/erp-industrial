package erp.production

import erp.engineering.ProductionCatalog
import erp.engineering.PublishedPiece
import erp.stock.ReservationLine
import erp.stock.StockReservations
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

data class OrderMaterial(val materialId: UUID, val name: String, val unitId: UUID, val unitCode: String, val perKit: String, val required: String)
data class ProductionOrder(
    val id: UUID, val number: Long, val productId: UUID, val productCode: String, val productName: String,
    val version: Int, val quantity: Int, val createdAt: Instant, val releasedAt: Instant?,
    val pieces: List<PublishedPiece>, val materials: List<OrderMaterial>, val closedAt: Instant? = null, val closureReason: String? = null
) {
    val status: String get() = when { closedAt != null -> "closed"; releasedAt == null -> "draft"; else -> "released" }
}
data class OrderActor(val issuer: String, val subject: String)

@Service
class ProductionOrders(private val db: JdbcTemplate, private val json: ObjectMapper, private val catalog: ProductionCatalog,
                       private val reservations: StockReservations) {
    private val rowMapper = RowMapper { row, _ ->
        ProductionOrder(row.getObject("id",UUID::class.java), row.getLong("number"), row.getObject("product_id", UUID::class.java),
            row.getString("product_code"), row.getString("product_name"), row.getInt("version"), row.getInt("quantity"),
            row.getObject("created_at",LocalDateTime::class.java).toInstant(ZoneOffset.UTC),
            row.getObject("released_at",LocalDateTime::class.java)?.toInstant(ZoneOffset.UTC),
            json.readValue<List<PublishedPiece>>(row.getString("pieces")), json.readValue<List<OrderMaterial>>(row.getString("materials")),row.getObject("closed_at",LocalDateTime::class.java)?.toInstant(ZoneOffset.UTC),row.getString("closure_reason"))
    }
    fun list(plant: String): List<ProductionOrder> = db.query("select * from production_order where plant_id=? order by number desc",rowMapper,plant)
    internal fun released(plant: String): List<ProductionOrder> = db.query(
        "select * from production_order where plant_id=? and released_at is not null and closed_at is null order by number desc", rowMapper,plant)
    /** A finished piece is credited once at its final routed step. Legacy orders recover the ID from their pinned publication. */
    fun completedParts(group:String,plant:String):Map<UUID,Long> {
        val totals=mutableMapOf<UUID,Long>()
        val progress=db.query("""select order_id,piece_index,step_index,sum(quantity) as amount from production_stage_report
            where plant_id=? group by order_id,piece_index,step_index""",{r,_->
            r.getObject("order_id",UUID::class.java) to Triple(r.getInt("piece_index"),r.getInt("step_index"),r.getLong("amount"))
        },plant).groupBy({it.first},{it.second})
        for(order in list(plant)) {
            val legacy by lazy { catalog.sheet(group,order.productId,order.version).pieces }
            for((index,step,amount) in progress[order.id].orEmpty()) {
                val piece=order.pieces[index]
                if(step==piece.steps.lastIndex) {
                    val part=piece.partId ?: requireNotNull(legacy[index].partId)
                    totals[part]=(totals[part] ?: 0L)+amount
                }
            }
        }
        return totals
    }

    private fun load(plant: String, id: UUID, lock: Boolean): ProductionOrder {
        val suffix = if (lock) " for update" else ""
        return db.query("select * from production_order where plant_id=? and id=?" + suffix,rowMapper,plant,id)
            .singleOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND,"OS ausente nesta unidade")
    }
    fun get(plant: String, id: UUID) = load(plant,id,false)
    /** Operational commands acquire this order lock before locking its materials or finished product. */
    fun lock(plant: String, id: UUID) = load(plant,id,true)

    /** A chave de criação é o UUID escolhido pelo cliente. A OS fixa materiais e roteiro antes da liberação. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun create(group: String, plant: String, id: UUID, productId: UUID, version: Int, quantity: Int, actor: OrderActor): ProductionOrder {
        val sheet = catalog.sheet(group,productId,version)
        val materials = sheet.materials.groupBy { it.materialId }.map { (_, lines) ->
            val first = lines.first()
            val perKit = lines.sumOf { it.perKit }
            OrderMaterial(first.materialId, first.name, first.unitId, first.unitCode,
                perKit.stripTrailingZeros().toPlainString(), (perKit * quantity.toBigDecimal()).stripTrailingZeros().toPlainString())
        }
        db.update("""insert into production_order(plant_id,id,product_id,version,quantity,product_code,product_name,
            materials,pieces,created_by,created_issuer) values(?,?,?,?,?,?,?,?,?,?,?)
            on duplicate key update id=values(id)""",plant,id,productId,version,quantity,sheet.product.code,sheet.product.name,
            json.writeValueAsString(materials),json.writeValueAsString(sheet.pieces),actor.subject,actor.issuer)
        val order = get(plant,id)
        if (order.productId != productId || order.version != version || order.quantity != quantity) {
            throw ResponseStatusException(HttpStatus.CONFLICT,"Esta chave de OS já foi usada com outros dados")
        }
        return order
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun close(plant: String, id: UUID, actor: OrderActor, reason: String): ProductionOrder {
        val order = lock(plant,id)
        if (order.closureReason == reason) return order
        if (order.status != "released") throw ResponseStatusException(HttpStatus.CONFLICT,"A OS deve estar liberada")
        reservations.releaseRemaining(plant,id,order.materials.map { it.materialId })
        db.update("update production_order set closed_at=utc_timestamp(6),closed_by=?,closed_issuer=?,closure_reason=? where plant_id=? and id=?",
            actor.subject,actor.issuer,reason,plant,id)
        return get(plant,id)
    }

    /** O bloqueio da OS precede os dos materiais. A reserva e a liberação confirmam ou revertem juntas. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun release(plant: String, id: UUID, actor: OrderActor): ProductionOrder {
        val order = load(plant,id,true)
        if (order.releasedAt != null) return order
        reservations.reserve(plant,id,order.materials.map { ReservationLine(it.materialId,it.unitId,BigDecimal(it.required)) })
        db.update("""update production_order set released_at=utc_timestamp(6),released_by=?,released_issuer=?
            where plant_id=? and id=?""",actor.subject,actor.issuer,plant,id)
        return get(plant,id)
    }
}
