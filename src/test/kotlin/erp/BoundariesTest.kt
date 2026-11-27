package erp

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

@Tag("architecture")
class BoundariesTest {
    @Test fun moduleBoundaries() {
        val classes = ClassFileImporter().importPackages("erp.access","erp.engineering","erp.stock","erp.production","erp.sales","erp.purchasing","erp.outsourcing","erp.planning","erp.costs","erp.dashboard")
        slices().matching("erp.(*)..").should().beFreeOfCycles().check(classes)
        val privateAccess = com.tngtech.archunit.base.DescribedPredicate.describe<com.tngtech.archunit.core.domain.JavaClass>("internos de acesso") {
            it.packageName.startsWith("erp.access") && it.name != "erp.access.Access"
        }
        noClasses().that().resideOutsideOfPackage("erp.access..").should().dependOnClassesThat(privateAccess).check(classes)
        val privateEngineering = com.tngtech.archunit.base.DescribedPredicate.describe<com.tngtech.archunit.core.domain.JavaClass>("internos de engenharia") {
            it.packageName.startsWith("erp.engineering") &&
                it.name !in setOf("erp.engineering.StockCatalog", "erp.engineering.MaterialReference")
        }
        noClasses().that().resideInAPackage("erp.stock..").should().dependOnClassesThat(privateEngineering).check(classes)
        val productionContracts = setOf("erp.engineering.ProductionCatalog", "erp.engineering.ProductionSheet",
            "erp.engineering.PublishedProduct", "erp.engineering.PublishedPiece", "erp.engineering.PublishedRequirement",
            "erp.stock.FinishedStock", "erp.stock.KitBalance", "erp.stock.StockReservations", "erp.stock.ReservationLine")
        val privateSuppliers = com.tngtech.archunit.base.DescribedPredicate.describe<com.tngtech.archunit.core.domain.JavaClass>("internos de Engenharia e Estoque") {
            (it.packageName.startsWith("erp.engineering") || it.packageName.startsWith("erp.stock")) && it.name !in productionContracts
        }
        noClasses().that().resideInAPackage("erp.production..").should().dependOnClassesThat(privateSuppliers).check(classes)
        noClasses().that().resideInAPackage("..domain..").should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework..","java.sql..","..infrastructure..").check(classes)
    }
}
