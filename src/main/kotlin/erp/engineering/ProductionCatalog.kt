package erp.engineering

import erp.engineering.domain.Sheet
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import java.math.BigDecimal
import java.util.UUID

data class PublishedProduct(val productId: UUID, val code: String, val name: String, val version: Int)
data class PublishedPiece(val name: String, val perKit: Int, val steps: List<String>)
data class PublishedRequirement(val materialId: UUID, val name: String, val unitId: UUID, val unitCode: String, val perKit: BigDecimal)
data class ProductionSheet(val product: PublishedProduct, val pieces: List<PublishedPiece>, val materials: List<PublishedRequirement>)

private data class MaterialNames(val material: Item, val unit: Item, val category: Item)
private data class SavedSheet(val product: Item, val sheet: Sheet, val parts: List<Item>, val materials: List<MaterialNames>)

/** Lê apenas publicações imutáveis, inclusive os nomes e as unidades vigentes naquela versão. */
@Service
class ProductionCatalog(private val db: JdbcTemplate, private val json: ObjectMapper) {
    fun products(group: String): List<PublishedProduct> = db.query(
        """select p.product_id,p.version,json_unquote(json_extract(p.body,'$.product.value.code')) as code,
            json_unquote(json_extract(p.body,'$.product.value.name')) as name
            from publication p join item i on i.id=p.product_id where i.group_id=?
            order by name,code,p.product_id,p.version desc""", { row, _ ->
            PublishedProduct(row.getObject("product_id",UUID::class.java), row.getString("code"),row.getString("name"),row.getInt("version"))
        }, group)

    fun sheet(group: String, product: UUID, version: Int): ProductionSheet {
        val body = db.queryForList("""select p.body from publication p join item i on i.id=p.product_id
            where i.group_id=? and p.product_id=? and p.version=?""",String::class.java,group,product,version)
            .singleOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND,"Ficha publicada ausente")
        val saved = json.readValue<SavedSheet>(body)
        val pieces = saved.sheet.pieces.zip(saved.parts) { line, part -> PublishedPiece(part.value.name,line.quantity,line.steps) }
        val materials = saved.sheet.materials.zip(saved.materials) { line, names ->
            PublishedRequirement(line.materialId,names.material.value.name,line.unitId,names.unit.value.code,line.quantity)
        }
        return ProductionSheet(PublishedProduct(product,saved.product.value.code,saved.product.value.name,version),pieces,materials)
    }
}
