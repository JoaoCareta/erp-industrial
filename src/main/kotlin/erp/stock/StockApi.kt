package erp.stock

import erp.access.Access
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.*
import tools.jackson.databind.JsonNode
import java.math.BigDecimal
import java.util.UUID

data class IncomingStock(val quantity: JsonNode, val unitId: UUID) {
    fun amount(): BigDecimal {
        require(quantity.isString && decimal.matches(quantity.stringValue())) { "Informe uma quantidade com até seis casas decimais" }
        return quantity.stringValue().toBigDecimal().also { require(it.signum() > 0) { "Informe uma quantidade positiva" } }
    }
    companion object { private val decimal = Regex("""\d{1,12}(\.\d{1,6})?""") }
}
data class ReverseStock(val sourceId: UUID)

@RestController
@RequestMapping("/api/units/{plant}/stock/materials")
class StockApi(private val access: Access, private val stock: Stock) {
    @GetMapping fun materials(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String) =
        stock.list(access.check(jwt, "stock.read", plant), plant)

    @GetMapping("/{materialId}") fun balance(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable materialId: UUID) =
        stock.balance(access.check(jwt, "stock.read", plant), plant, materialId)

    @PutMapping("/{materialId}/opening/{requestId}") fun open(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
        @PathVariable materialId: UUID, @PathVariable requestId: UUID, @RequestBody input: IncomingStock) =
        receive(jwt, plant, materialId, requestId, input, MovementKind.opening)

    @PutMapping("/{materialId}/receipts/{requestId}") fun receipt(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
        @PathVariable materialId: UUID, @PathVariable requestId: UUID, @RequestBody input: IncomingStock) =
        receive(jwt, plant, materialId, requestId, input, MovementKind.receipt)

    private fun receive(jwt: Jwt, plant: String, material: UUID, request: UUID, input: IncomingStock, kind: MovementKind) =
        stock.record(writeGroup(jwt,plant), plant, material, request, kind, Actor(jwt.issuer.toString(),jwt.subject),
            quantity=input.amount(), unit=input.unitId)

    /** Um lançamento devolve o extrato de estoque completo da unidade. */
    private fun writeGroup(jwt: Jwt, plant: String): String {
        access.check(jwt,"stock.read",plant)
        return access.check(jwt,"stock.write",plant)
    }

    @PutMapping("/{materialId}/reversals/{requestId}") fun reverse(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
        @PathVariable materialId: UUID, @PathVariable requestId: UUID, @RequestBody input: ReverseStock) =
        stock.record(writeGroup(jwt,plant), plant, materialId, requestId, MovementKind.reversal,
            Actor(jwt.issuer.toString(),jwt.subject), source=input.sourceId)
}
