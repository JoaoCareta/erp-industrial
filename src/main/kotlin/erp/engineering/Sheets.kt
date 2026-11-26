package erp.engineering

import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.ObjectNode
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
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME
import java.util.UUID

data class Revision(val revision: Int)
data class Edit(val revision: Int, val sheet: Sheet)
data class Draft(val id: UUID, val revision: Int, val sheet: Sheet)

@Service
class Sheets(private val db: JdbcTemplate, private val catalog: Catalog, private val json: ObjectMapper) {
    private fun checkSheet(group: String, product: UUID, sheet: Sheet): Map<String, Any> {
        sheet.validate()
        val pieces = sheet.pieces.map { catalog.usable(group,it.partId, Kind.part) }
        val materials = sheet.materials.mapIndexed { i, line ->
            val material = catalog.usable(group,line.materialId, Kind.material)
            require(line.quantity.signum() > 0 && material.value.unitId == line.unitId) { "Material ${i+1}: confira quantidade e unidade" }
            mapOf("material" to material, "unit" to catalog.usable(group,line.unitId, Kind.unit),
                "category" to catalog.get(group,requireNotNull(material.value.categoryId), Kind.category))
        }
        return mapOf("product" to catalog.usable(group,product, Kind.product), "sheet" to sheet, "parts" to pieces, "materials" to materials)
    }
    @Transactional fun create(group: String, product: UUID, sheet: Sheet): Draft {
        checkSheet(group,product, sheet)
        val id = UUID.randomUUID()
        db.update("insert into draft(id,product_id,revision,body) values(?,?,1,?)", id, product, json.writeValueAsString(sheet))
        return Draft(id, 1, sheet)
    }
    private fun lockDraft(product: UUID, id: UUID): Draft = db.query(
        "select * from draft where product_id=? and id=? for update",
        { r, _ -> Draft(id,r.getInt("revision"),json.readValue<Sheet>(r.getString("body"))) }, product,id
    ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @Transactional fun edit(group: String, product: UUID, id: UUID, edit: Edit): Draft {
        catalog.get(group,product,Kind.product)
        val current = lockDraft(product,id)
        if (current.revision != edit.revision || published(id) != null) throw ResponseStatusException(HttpStatus.CONFLICT)
        checkSheet(group,product, edit.sheet)
        db.update("update draft set revision=revision+1,body=? where id=?", json.writeValueAsString(edit.sheet),id)
        return Draft(id,current.revision+1,edit.sheet)
    }
    private fun published(id: UUID) = db.queryForList("select version from publication where draft_id=?", Int::class.java,id).firstOrNull()

    /** O bloqueio do produto serializa a numeração de versões, inclusive para rascunhos distintos. */
    @Transactional fun publish(group: String, product: UUID, id: UUID, revision: Int, actor: String): Int {
        catalog.get(group,product,Kind.product)
        val draft = lockDraft(product,id)
        if (draft.revision != revision) throw ResponseStatusException(HttpStatus.CONFLICT)
        published(id)?.let { return it }
        db.queryForObject("select id from item where id=? for update",UUID::class.java,product)
        val body = checkSheet(group,product,draft.sheet)
        val nextVersion = db.queryForObject("select coalesce(max(version),0)+1 from publication where product_id=?",
            Int::class.java, product)!!
        db.update("insert into publication(product_id,version,draft_id,actor,body) values(?,?,?,?,?)",
            product, nextVersion, id, actor, json.writeValueAsString(body))
        return nextVersion
    }
    fun versions(group: String, product: UUID) = db.query("select version from publication where product_id in (select id from item where group_id=? and id=?) order by version", { r, _ -> r.getInt(1) }, group,product)
    fun version(group: String, product: UUID, version: Int): JsonNode = db.query(
        """select body,version,published_at,actor from publication
            where product_id in (select id from item where group_id=? and id=?) and version=?""",
        { r, _ ->
            val publishedAt = r.getObject("published_at", LocalDateTime::class.java)
            json.readValue(r.getString("body"), ObjectNode::class.java).apply {
                put("version", r.getInt("version"))
                put("publishedAt", ISO_LOCAL_DATE_TIME.format(publishedAt) + "+00:00")
                put("actor", r.getString("actor"))
            }
        }, group,product,version
    ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
}

@RestController
@RequestMapping("/api/units/{plant}/products/{product}")
class SheetApi(private val sheets: Sheets, private val access: Access) {
    @PostMapping("/drafts") fun create(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable product: UUID, @RequestBody sheet: Sheet): Draft {
        val group = access.check(jwt,"engineering.edit",plant)
        return sheets.create(group,product,sheet)
    }
    @PutMapping("/drafts/{id}") fun edit(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable product: UUID, @PathVariable id: UUID, @RequestBody edit: Edit): Draft {
        val group = access.check(jwt,"engineering.edit",plant)
        return sheets.edit(group,product,id,edit)
    }
    @PostMapping("/drafts/{id}/publication") fun publish(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable product: UUID, @PathVariable id: UUID, @RequestBody rev: Revision): Int {
        val group = access.check(jwt,"engineering.publish",plant)
        return sheets.publish(group,product,id,rev.revision,jwt.subject)
    }
    @GetMapping("/versions") fun versions(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable product: UUID): List<Int> {
        val group = access.check(jwt,"engineering.read",plant)
        return sheets.versions(group,product)
    }
    @GetMapping("/versions/{version}") fun version(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable product: UUID, @PathVariable version: Int): JsonNode {
        val group = access.check(jwt,"engineering.read",plant)
        return sheets.version(group,product,version)
    }
}
