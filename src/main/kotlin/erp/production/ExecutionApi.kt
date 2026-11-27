package erp.production

import erp.access.Access
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.*
import tools.jackson.databind.JsonNode
import java.util.UUID

data class ActualMaterial(val materialId: UUID, val quantity: JsonNode) {
    fun consumption(): Consumption {
        require(quantity.isString && decimal.matches(quantity.stringValue())) { "Informe o consumo em até seis casas decimais" }
        val amount = quantity.stringValue().toBigDecimal()
        require(amount.signum() > 0) { "Informe um consumo positivo" }
        return Consumption(materialId,amount.stripTrailingZeros().toPlainString())
    }
    private companion object { val decimal = Regex("""\d{1,12}(\.\d{1,6})?""") }
}

data class ReportInput(val pieceIndex: JsonNode, val stepIndex: JsonNode, val quantity: JsonNode, val consumption: ActualMaterial? = null)

@RestController
@RequestMapping("/api/units/{plant}/production-orders")
class ExecutionApi(private val access: Access, private val execution: OrderExecution) {
    @GetMapping("/kanban") fun board(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String): List<Execution> {
        access.check(jwt,"production.read",plant)
        return execution.board(plant)
    }

    @GetMapping("/{id}/execution") fun detail(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
                                              @PathVariable id: UUID): Execution {
        access.check(jwt,"production.read",plant)
        return execution.detail(plant,id)
    }

    @PutMapping("/{id}/reports/{requestId}") fun report(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
            @PathVariable id: UUID, @PathVariable requestId: UUID, @RequestBody input: ReportInput): Execution {
        access.check(jwt,"production.read",plant)
        val actorName = access.actorName(jwt,"production.report",plant)
        val command = StageCommand(input.pieceIndex.integerAtLeast(0),input.stepIndex.integerAtLeast(0),
            input.quantity.integerAtLeast(1),input.consumption?.consumption())
        return execution.report(plant,id,requestId,command,jwt.orderActor(),actorName)
    }
}
