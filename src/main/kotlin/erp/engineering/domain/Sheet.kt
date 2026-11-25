package erp.engineering.domain

import java.util.UUID
import java.math.BigDecimal

data class PieceLine(val partId: UUID, val quantity: Int, val steps: List<String>,
                     val thicknessMm: BigDecimal? = null, val piecesPerPlate: Int? = null,
                     val piecesPerCut: Int? = null, val minutesPerCut: BigDecimal? = null)
data class MaterialLine(val materialId: UUID, val unitId: UUID, val quantity: BigDecimal)
data class Sheet(val pieces: List<PieceLine>, val materials: List<MaterialLine>) {
    fun validate() {
        require(pieces.isNotEmpty()) { "Inclua uma peça" }
        require(pieces.distinctBy { it.partId }.size == pieces.size) { "Peça repetida" }
        pieces.forEachIndexed { i, line ->
            require(line.quantity > 0 && line.steps.isNotEmpty() && line.steps.all { it.isNotBlank() }) { "Peça ${i+1}: confira quantidade e etapas" }
            val cut = listOfNotNull(line.thicknessMm, line.minutesPerCut, line.piecesPerPlate?.toBigDecimal(), line.piecesPerCut?.toBigDecimal())
            require(cut.all { it.signum() > 0 }) { "Peça ${i+1}: parâmetros de corte devem ser positivos" }
        }
    }
}
