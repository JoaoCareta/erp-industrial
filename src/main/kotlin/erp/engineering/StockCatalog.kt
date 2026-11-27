package erp.engineering

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Service
import java.util.UUID

data class MaterialReference(val id: UUID, val code: String, val name: String, val unitId: UUID, val unitCode: String)

/** Materiais disponíveis para novas movimentações do grupo, na unidade de medida de referência. */
@Service
class StockCatalog(private val db: JdbcTemplate) {
    private val activeMaterials = """
        select m.id, m.code, m.name, u.id as unit_id, u.code as unit_code from item m
        join item u on u.group_id=m.group_id and u.id=m.unit_id and u.kind='unit'
        where m.group_id=? and m.kind='material' and m.active and u.active
    """
    private val reference = RowMapper { row, _ ->
        MaterialReference(row.getObject("id", UUID::class.java), row.getString("code"), row.getString("name"),
            row.getObject("unit_id", UUID::class.java), row.getString("unit_code"))
    }

    fun list(group: String): List<MaterialReference> = db.query(activeMaterials, reference, group)

    fun find(group: String, id: UUID): MaterialReference? =
        db.query("$activeMaterials and m.id=?", reference, group, id).singleOrNull()

    /** Na transação de recebimento, conserva a unidade e o estado do cadastro até o commit. */
    fun lockForReceipt(group: String, id: UUID): MaterialReference? =
        db.query("$activeMaterials and m.id=? lock in share mode", reference, group, id).singleOrNull()
}
