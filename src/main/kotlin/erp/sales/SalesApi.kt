package erp.sales

import erp.access.Access
import erp.engineering.Catalog
import erp.engineering.Kind
import erp.stock.Actor
import erp.stock.FinishedStock
import erp.stock.KitBalance
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.time.LocalDate
import java.util.UUID

data class SaleInput(val productId: UUID, val date: LocalDate, val channel: String, val quantity: JsonNode, val unitPrice: String)
data class Sale(val id: UUID, val productId: UUID, val date: LocalDate, val channel: String, val quantity: Int, val unitPrice: String) {
    val total get() = (unitPrice.toBigDecimal() * quantity.toBigDecimal()).toPlainString()
}
data class ProductBalance(val productId: UUID, val name: String, val balance: KitBalance)
data class OpeningInput(val quantity: JsonNode)

private fun JsonNode.quantity(min: Int): Int {
    require(isIntegralNumber && canConvertToInt() && intValue() >= min) { "Quantidade de kits inválida" }
    return intValue()
}

@RestController
@RequestMapping("/api/units/{plant}/sales")
class SalesApi(private val access: Access, private val db: JdbcTemplate, private val catalog: Catalog, private val stock: FinishedStock) {
    private val mapper = RowMapper { row,_ ->
        Sale(row.getObject("request_id",UUID::class.java),row.getObject("product_id",UUID::class.java),
            row.getObject("sale_date",LocalDate::class.java),row.getString("channel"),row.getInt("quantity"),
            row.getBigDecimal("unit_price").toPlainString())
    }
    @GetMapping
    fun history(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String): List<Sale> {
        access.check(jwt,"sales.read",plant)
        return db.query("select * from product_sale where plant_id=? order by sale_date desc,created_at desc,request_id",mapper,plant)
    }
    @GetMapping("/products")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    fun products(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String): List<ProductBalance> {
        val group = access.check(jwt,"sales.read",plant)
        return catalog.list(group,Kind.product).map { ProductBalance(it.id,it.value.name,stock.balance(plant,it.id)) }
    }
    @PutMapping("/products/{product}/opening/{id}")
    @Transactional(isolation=Isolation.READ_COMMITTED)
    fun open(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String,@PathVariable product: UUID,
             @PathVariable id: UUID,@RequestBody input: OpeningInput): KitBalance {
        val group = access.check(jwt,"sales.read",plant)
        access.check(jwt,"stock.write",plant)
        catalog.get(group,product,Kind.product)
        stock.open(plant,product,id,input.quantity.quantity(0),Actor(jwt.issuer.toString(),jwt.subject))
        return stock.balance(plant,product)
    }
    @PutMapping("/{id}")
    @Transactional(isolation=Isolation.READ_COMMITTED)
    fun sell(@AuthenticationPrincipal jwt: Jwt,@PathVariable plant: String,@PathVariable id: UUID,@RequestBody input: SaleInput): Sale {
        val group = access.check(jwt,"sales.read",plant)
        access.check(jwt,"sales.write",plant)
        catalog.get(group,input.productId,Kind.product)
        val channel = input.channel.trim()
        require(channel.length in 1..120 && input.unitPrice.matches(Regex("""\d{1,13}(\.\d{1,2})?"""))) { "Confira o canal e o preço" }
        val sale = Sale(id,input.productId,input.date,channel,input.quantity.quantity(1),input.unitPrice.toBigDecimal().setScale(2).toPlainString())
        stock.lock(plant,input.productId)
        val previous = db.query("select * from product_sale where plant_id=? and request_id=?",mapper,plant,id).singleOrNull()
        if (previous != null) {
            if (previous != sale) throw ResponseStatusException(HttpStatus.CONFLICT,"Chave já utilizada em outra venda")
            return previous
        }
        stock.sell(plant,input.productId,sale.quantity)
        db.update("""insert into product_sale(plant_id,request_id,product_id,sale_date,channel,quantity,unit_price,actor_subject,actor_issuer)
            values(?,?,?,?,?,?,?,?,?)""",plant,id,input.productId,input.date,channel,sale.quantity,sale.unitPrice,jwt.subject,jwt.issuer.toString())
        return sale
    }
}
