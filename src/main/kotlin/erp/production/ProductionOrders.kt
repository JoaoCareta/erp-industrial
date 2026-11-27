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
    val pieces: List<PublishedPiece>, val materials: List<OrderMaterial>
) {
    val status: String get() = if (releasedAt == null) "draft" else "released"
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
            json.readValue<List<PublishedPiece>>(row.getString("pieces")), json.readValue<List<OrderMaterial>>(row.getString("materials")))
    }
    fun list(plant: String): List<ProductionOrder> = db.query("select * from production_order where plant_id=? order by number desc",rowMapper,plant)
    internal fun released(plant: String): List<ProductionOrder> = db.query(
        "select * from production_order where plant_id=? and released_at is not null order by number desc", rowMapper,plant)
    private fun load(plant: String, id: UUID, lock: Boolean): ProductionOrder {
        val suffix = if (lock) " for update" else ""
        return db.query("select * from production_order where plant_id=? and id=?" + suffix,rowMapper,plant,id)
            .singleOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND,"OS ausente nesta unidade")
    }
    fun get(plant: String, id: UUID) = load(plant,id,false)
    internal fun lock(plant: String, id: UUID) = load(plant,id,true)

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
