package erp.engineering

import erp.access.Access
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

enum class Kind { category, unit, material, product, part }
data class ItemInput(val code: String, val name: String, val dimension: String = "", val active: Boolean = true,
                     val categoryId: UUID? = null, val unitId: UUID? = null)
data class Item(val id: UUID, val kind: Kind, val value: ItemInput)

@Service
class Catalog(private val db: JdbcTemplate) {
    private val mapper = org.springframework.jdbc.core.RowMapper { r, _: Int ->
        Item(r.getObject("id", UUID::class.java), Kind.valueOf(r.getString("kind")),
            ItemInput(r.getString("code"), r.getString("name"), r.getString("dimension"), r.getBoolean("active"),
                r.getObject("category_id", UUID::class.java), r.getObject("unit_id", UUID::class.java)))
    }
    fun list(group: String, kind: Kind) = db.query("select * from item where group_id=? and kind=? order by code", mapper, group,kind.name)
    fun get(group: String, id: UUID, kind: Kind) = db.query("select * from item where group_id=? and id=? and kind=?", mapper, group,id, kind.name)
        .firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Cadastro ausente: $kind")
    fun usable(group: String, id: UUID, kind: Kind): Item = get(group,id, kind).also { require(it.value.active) { "Cadastro inativo: ${it.value.code}" } }

    @Transactional
    fun save(group: String, kind: Kind, input: ItemInput, existing: UUID?): Item {
        require(input.code.isNotBlank() && input.name.isNotBlank()) { "Informe código e descrição" }
        if (kind == Kind.unit) require(input.dimension.isNotBlank()) { "Informe a dimensão" }
        if (kind == Kind.material) {
            usable(group,requireNotNull(input.categoryId) { "Informe a categoria" }, Kind.category)
            usable(group,requireNotNull(input.unitId) { "Informe a unidade" }, Kind.unit)
        } else require(input.categoryId == null && input.unitId == null) { "Vínculos exclusivos de matéria-prima" }
        val id = existing ?: UUID.randomUUID()
        if (existing == null) {
            db.update("""insert into item(group_id,id,kind,code,name,dimension,active,category_id,unit_id)
                values(?,?,?,?,?,?,?,?,?)""", group, id, kind.name, input.code.trim(), input.name.trim(),
                input.dimension, input.active, input.categoryId, input.unitId)
        } else {
            db.update("""update item set code=?,name=?,dimension=?,active=?,category_id=?,unit_id=?
                where group_id=? and id=? and kind=?""", input.code.trim(), input.name.trim(), input.dimension,
                input.active, input.categoryId, input.unitId, group, id, kind.name)
        }
        return get(group,id, kind)
    }
}

@RestController
@RequestMapping("/api/units/{plant}/catalog/{kind}")
class CatalogApi(private val access: Access, private val catalog: Catalog) {
    @GetMapping fun list(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable kind: Kind): List<Item> {
        val group = access.check(jwt, "engineering.read",plant)
        return catalog.list(group,kind)
    }
    @PostMapping fun create(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable kind: Kind, @RequestBody input: ItemInput): Item {
        val group = access.check(jwt, "engineering.edit",plant)
        return catalog.save(group,kind, input, null)
    }
    @PutMapping("/{id}") fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable kind: Kind, @PathVariable id: UUID, @RequestBody input: ItemInput): Item {
        val group = access.check(jwt, "engineering.edit",plant)
        return catalog.save(group,kind, input, id)
    }
}
