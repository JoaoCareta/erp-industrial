package erp.costs

import erp.access.Access
import erp.engineering.ProductionCatalog
import erp.purchasing.PurchaseHistory
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

data class StageRate(val name:String,val minutes:String,val rate:String)
data class Estimate(val method:String,val stages:List<StageRate>,val external:String,val channel:String,val commission:String,val tax:String,val margin:String)
data class CostLine(val name:String,val quantity:String,val unit:String,val unitCost:String?,val amount:String?)
data class StageCost(val name:String,val minutes:String,val rate:String,val amount:String)
data class Quote(val materials:List<CostLine>,val stages:List<StageCost>,val method:String,val external:String,val channel:String,
                 val materialTotal:String?,val labor:String,val direct:String?,val price:String?)
private fun String.amount():BigDecimal { require(matches(Regex("""\d{1,12}(\.\d{1,6})?""")));return toBigDecimal() }
private fun BigDecimal.money()=setScale(2,RoundingMode.HALF_UP).toPlainString()

@RestController
@RequestMapping("/api/units/{plant}/costs")
class Costing(private val access:Access,private val sheets:ProductionCatalog,private val purchases:PurchaseHistory) {
    @GetMapping("/products") fun products(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String)=sheets.products(access.check(jwt,"costs.read",plant))
    @GetMapping("/products/{product}/versions/{version}/stages")
    fun stages(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable product:UUID,@PathVariable version:Int)=
        sheets.sheet(access.check(jwt,"costs.read",plant),product,version).pieces.flatMap { it.steps }.distinct()

    /** Amounts are rounded per displayed cost line. A missing purchase leaves the product price undetermined. */
    @PostMapping("/products/{product}/versions/{version}/simulation")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    fun simulate(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable product:UUID,@PathVariable version:Int,@RequestBody input:Estimate):Quote {
        val sheet=sheets.sheet(access.check(jwt,"costs.read",plant),product,version)
        val expected=sheet.pieces.flatMap { it.steps }.distinct()
        require(input.stages.map { it.name }.sorted()==expected.sorted()) { "Informe tempo e taxa de cada etapa" }
        require(input.method in setOf("last","average") && input.channel.trim().length in 1..120)
        val fraction=BigDecimal.ONE-(input.commission.amount()+input.tax.amount()+input.margin.amount()).movePointLeft(2)
        require(fraction.signum()>0) { "As deduções do canal devem ficar abaixo de 100%" }
        val external=input.external.amount().money()
        val prices=purchases.unitCosts(plant,input.method)
        val materials=sheet.materials.map {
            val cost=prices[it.materialId]
            CostLine(it.name,it.perKit.toPlainString(),it.unitCode,cost?.stripTrailingZeros()?.toPlainString(),cost?.multiply(it.perKit)?.money())
        }
        val stages=input.stages.map { s->
            val value=(s.minutes.amount()*s.rate.amount()).divide(60.toBigDecimal(),2,RoundingMode.HALF_UP)
            StageCost(s.name,s.minutes,s.rate,value.money())
        }
        val labor=stages.sumOf { it.amount.toBigDecimal() }
        val materialTotal=if(materials.all { it.amount!=null }) materials.sumOf { it.amount!!.toBigDecimal() } else null
        val direct=materialTotal?.plus(labor)?.plus(external.toBigDecimal())
        return Quote(materials,stages,input.method,external,input.channel,materialTotal?.money(),labor.money(),direct?.money(),
            direct?.divide(fraction,2,RoundingMode.HALF_UP)?.money())
    }
}
