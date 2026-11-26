package erp

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

@Tag("architecture")
class BoundariesTest {
    @Test fun moduleBoundaries() {
        val classes = ClassFileImporter().importPackages("erp.access","erp.engineering")
        slices().matching("erp.(*)..").should().beFreeOfCycles().check(classes)
        val privateAccess = com.tngtech.archunit.base.DescribedPredicate.describe<com.tngtech.archunit.core.domain.JavaClass>("internos de acesso") {
            it.packageName.startsWith("erp.access") && it.name != "erp.access.Access"
        }
        noClasses().that().resideInAPackage("erp.engineering..").should().dependOnClassesThat(privateAccess).check(classes)
        noClasses().that().resideInAPackage("..domain..").should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework..","java.sql..","..infrastructure..").check(classes)
    }
}
