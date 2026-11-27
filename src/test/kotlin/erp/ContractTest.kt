package erp

import tools.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import java.io.File

@SpringBootTest
class ContractTest @Autowired constructor(@Qualifier("requestMappingHandlerMapping") val mappings: RequestMappingHandlerMapping, val json: ObjectMapper) {
    @Test fun openApiMatchesHandlers() {
        val contract = json.readTree(File("docs/openapi.json"))
        for (ref in contract.findValues("\$ref")) {
            val target = ref.stringValue()
            if (target.startsWith("#/")) {
                assertFalse(contract.at(target.substring(1)).isMissingNode, "Referência OpenAPI ausente: $target")
            }
        }
        val paths = contract["paths"]
        val expected = paths.propertyNames().flatMap { path -> paths[path].propertyNames().map { "$it $path" } }.toSet()
        val actual = mappings.handlerMethods.keys.flatMap { info ->
            info.patternValues.filter { it.startsWith("/api/") }.flatMap { path ->
                info.methodsCondition.methods.map { "${it.name.lowercase()} $path" }
            }
        }.toSet()
        assertEquals(expected,actual)
    }
}
