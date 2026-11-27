package erp.production

import erp.access.Access
import erp.engineering.ProductionCatalog
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.*
import tools.jackson.databind.JsonNode
import java.util.UUID

data class CreateOrder(val productId: UUID, val version: JsonNode, val quantity: JsonNode)

internal fun JsonNode.integerAtLeast(minimum: Int): Int {
    require(isIntegralNumber && canConvertToInt() && intValue() >= minimum) { "Informe um número inteiro a partir de $minimum" }
    return intValue()
}
internal fun Jwt.orderActor() = OrderActor(issuer.toString(),subject)

@RestController
@RequestMapping("/api/units/{plant}/production-orders")
class ProductionApi(private val access: Access, private val orders: ProductionOrders, private val catalog: ProductionCatalog) {
    @GetMapping("/products") fun products(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String) =
        catalog.products(access.check(jwt,"production.read",plant))

    @GetMapping fun list(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String): List<ProductionOrder> {
        access.check(jwt,"production.read",plant)
        return orders.list(plant)
    }
    @GetMapping("/{id}") fun detail(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable id: UUID): ProductionOrder {
        access.check(jwt,"production.read",plant)
        return orders.get(plant,id)
    }
    @PutMapping("/{id}") fun create(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String,
                                    @PathVariable id: UUID, @RequestBody input: CreateOrder): ProductionOrder {
        access.check(jwt,"production.read",plant)
        val group = access.check(jwt,"production.create",plant)
        return orders.create(group,plant,id,input.productId,input.version.integerAtLeast(1),input.quantity.integerAtLeast(1),jwt.orderActor())
    }
    @PutMapping("/{id}/release") fun release(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable id: UUID): ProductionOrder {
        access.check(jwt,"production.read",plant)
        access.check(jwt,"production.release",plant)
        return orders.release(plant,id,jwt.orderActor())
    }
}
