package erp.engineering

import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.readValue
import erp.access.Access
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus
import erp.engineering.domain.Sheet
import java.util.UUID

data class Revision(val revision: Int)
data class Edit(val revision: Int, val sheet: Sheet)
data class Draft(val id: UUID, val revision: Int, val sheet: Sheet)

@Service
class Sheets(private val db: JdbcTemplate, private val catalog: Catalog, private val json: ObjectMapper) {
    private fun checkSheet(product: UUID, sheet: Sheet): Map<String, Any> {
        sheet.validate()
        val pieces = sheet.pieces.map { catalog.usable(it.partId, Kind.part) }
        val materials = sheet.materials.mapIndexed { i, line ->
            val material = catalog.usable(line.materialId, Kind.material)
            require(line.quantity.signum() > 0 && material.value.unitId == line.unitId) { "Material ${i+1}: confira quantidade e unidade" }
            mapOf("material" to material, "unit" to catalog.usable(line.unitId, Kind.unit),
                "category" to catalog.get(requireNotNull(material.value.categoryId), Kind.category))
        }
        return mapOf("product" to catalog.usable(product, Kind.product), "sheet" to sheet, "parts" to pieces, "materials" to materials)
    }
    @Transactional fun create(product: UUID, sheet: Sheet): Draft {
        checkSheet(product, sheet)
        val id = UUID.randomUUID()
        db.update("insert into draft values(?,?,1,?::jsonb)", id, product, json.writeValueAsString(sheet))
        return Draft(id, 1, sheet)
    }
    private fun lockDraft(product: UUID, id: UUID): Draft = db.query(
        "select * from draft where product_id=? and id=? for update",
        { r, _ -> Draft(id,r.getInt("revision"),json.readValue<Sheet>(r.getString("body"))) }, product,id
    ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @Transactional fun edit(product: UUID, id: UUID, edit: Edit): Draft {
        val current = lockDraft(product,id)
        if (current.revision != edit.revision || published(id) != null) throw ResponseStatusException(HttpStatus.CONFLICT)
        checkSheet(product, edit.sheet)
        db.update("update draft set revision=revision+1,body=?::jsonb where id=?", json.writeValueAsString(edit.sheet),id)
        return Draft(id,current.revision+1,edit.sheet)
    }
    private fun published(id: UUID) = db.queryForList("select version from publication where draft_id=?", Int::class.java,id).firstOrNull()

    /** O bloqueio do produto serializa a numeração de versões, inclusive para rascunhos distintos. */
    @Transactional fun publish(product: UUID, id: UUID, revision: Int, actor: String): Int {
        val draft = lockDraft(product,id)
        if (draft.revision != revision) throw ResponseStatusException(HttpStatus.CONFLICT)
        published(id)?.let { return it }
        db.queryForObject("select id from item where id=? for update",UUID::class.java,product)
        val body = checkSheet(product,draft.sheet)
        return db.queryForObject("""insert into publication(product_id,version,draft_id,actor,body)
            select ?,coalesce(max(version),0)+1,?,?,?::jsonb from publication where product_id=? returning version""",
            Int::class.java,product,id,actor,json.writeValueAsString(body),product)!!
    }
    fun versions(product: UUID) = db.query("select version from publication where product_id=? order by version", { r, _ -> r.getInt(1) }, product)
    fun version(product: UUID, version: Int): JsonNode = db.query(
        """select body || jsonb_build_object('version',version,'publishedAt',published_at,'actor',actor)
            from publication where product_id=? and version=?""",
        { r, _ -> json.readTree(r.getString(1)) },product,version
    ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
}

@RestController
@RequestMapping("/api/products/{product}")
class SheetApi(private val sheets: Sheets, private val access: Access) {
    @PostMapping("/drafts") fun create(@AuthenticationPrincipal jwt: Jwt, @PathVariable product: UUID, @RequestBody sheet: Sheet): Draft {
        access.check(jwt,"engineering.edit")
        return sheets.create(product,sheet)
    }
    @PutMapping("/drafts/{id}") fun edit(@AuthenticationPrincipal jwt: Jwt, @PathVariable product: UUID, @PathVariable id: UUID, @RequestBody edit: Edit): Draft {
        access.check(jwt,"engineering.edit")
        return sheets.edit(product,id,edit)
    }
    @PostMapping("/drafts/{id}/publication") fun publish(@AuthenticationPrincipal jwt: Jwt, @PathVariable product: UUID, @PathVariable id: UUID, @RequestBody rev: Revision): Int {
        access.check(jwt,"engineering.publish")
        return sheets.publish(product,id,rev.revision,jwt.subject)
    }
    @GetMapping("/versions") fun versions(@AuthenticationPrincipal jwt: Jwt, @PathVariable product: UUID): List<Int> {
        access.check(jwt,"engineering.read")
        return sheets.versions(product)
    }
    @GetMapping("/versions/{version}") fun version(@AuthenticationPrincipal jwt: Jwt, @PathVariable product: UUID, @PathVariable version: Int): JsonNode {
        access.check(jwt,"engineering.read")
        return sheets.version(product,version)
    }
}
