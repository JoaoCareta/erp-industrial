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
    fun list(kind: Kind) = db.query("select * from item where kind=? order by code", mapper, kind.name)
    fun get(id: UUID, kind: Kind) = db.query("select * from item where id=? and kind=?", mapper, id, kind.name)
        .firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Cadastro ausente: $kind")
    fun usable(id: UUID, kind: Kind): Item = get(id, kind).also { require(it.value.active) { "Cadastro inativo: ${it.value.code}" } }

    @Transactional
    fun save(kind: Kind, input: ItemInput, existing: UUID?): Item {
        require(input.code.isNotBlank() && input.name.isNotBlank()) { "Informe código e descrição" }
        if (kind == Kind.unit) require(input.dimension.isNotBlank()) { "Informe a dimensão" }
        if (kind == Kind.material) {
            usable(requireNotNull(input.categoryId) { "Informe a categoria" }, Kind.category)
            usable(requireNotNull(input.unitId) { "Informe a unidade" }, Kind.unit)
        } else require(input.categoryId == null && input.unitId == null) { "Vínculos exclusivos de matéria-prima" }
        val id = existing ?: UUID.randomUUID()
        if (existing != null) get(id, kind)
        db.update("""insert into item(id,kind,code,name,dimension,active,category_id,unit_id) values(?,?,?,?,?,?,?,?)
            on conflict(id) do update set code=excluded.code,name=excluded.name,dimension=excluded.dimension,
            active=excluded.active,category_id=excluded.category_id,unit_id=excluded.unit_id""",
            id, kind.name, input.code.trim(), input.name.trim(), input.dimension, input.active, input.categoryId, input.unitId)
        return get(id, kind)
    }
}

@RestController
@RequestMapping("/api/catalog/{kind}")
class CatalogApi(private val access: Access, private val catalog: Catalog) {
    @GetMapping fun list(@AuthenticationPrincipal jwt: Jwt, @PathVariable kind: Kind): List<Item> {
        access.check(jwt, "engineering.read")
        return catalog.list(kind)
    }
    @PostMapping fun create(@AuthenticationPrincipal jwt: Jwt, @PathVariable kind: Kind, @RequestBody input: ItemInput): Item {
        access.check(jwt, "engineering.edit")
        return catalog.save(kind, input, null)
    }
    @PutMapping("/{id}") fun update(@AuthenticationPrincipal jwt: Jwt, @PathVariable kind: Kind, @PathVariable id: UUID, @RequestBody input: ItemInput): Item {
        access.check(jwt, "engineering.edit")
        return catalog.save(kind, input, id)
    }
}
