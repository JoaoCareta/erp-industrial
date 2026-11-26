package erp

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.*
import tools.jackson.databind.ObjectMapper
import java.io.File

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "ERP_REFERENCE", matches = ".+")
class UpgradeTest @Autowired constructor(val mvc: MockMvc, val json: ObjectMapper) {
    @Test fun readsLegacyInstallation() {
        val reference = json.readTree(File(System.getenv("ERP_REFERENCE")))
        fun user(n: Int) = jwt().jwt {
            it.subject("00000000-0000-4000-8000-00000000000$n").issuer(System.getenv("OIDC_ISSUER"))
        }
        fun get(path: String, n: Int) = json.readTree(mvc.get("/api/units/eduk/$path") { with(user(n)) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString)
        val context = json.readTree(mvc.get("/api/me/context") { with(user(2)) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString)
        val actions = json.treeToValue(context, erp.access.WorkContext::class.java).units.single().actions.toSet()
        assertEquals(setOf("team.read","engineering.read","engineering.edit","engineering.publish"),actions)
        val product = reference["product"].stringValue()
        assertEquals("[1]",get("products/$product/versions",2).toString())
        assertEquals(reference["sheet"],get("products/$product/versions/1",2))
        val team = get("sectors/corte/team",1)
        assertEquals(reference["team"].size(), team.size())
        for ((i, person) in team.withIndex()) {
            for (key in listOf("id","name")) assertEquals(reference["team"][i][key],person[key])
        }
        mvc.get("/api/units/eduk/sectors/pintura/team") { with(user(1)) }.andExpect { status { isForbidden() } }
    }

    @Test fun upgradesWithoutDemoData() {
        val schema = "core_" + java.util.UUID.randomUUID().toString().replace("-","")
        fun config() = org.flywaydb.core.Flyway.configure()
            .dataSource(System.getenv("DB_URL"),System.getenv("DB_USER"),System.getenv("DB_PASSWORD"))
            .schemas(schema).locations("classpath:db/legacy")
            .placeholders(mapOf("issuer" to System.getenv("OIDC_ISSUER"), "legacyCatalogGroup" to ""))
        config().target("2").load().migrate()
        val migration = config().load()
        migration.configuration.dataSource.connection.use { connection ->
            connection.createStatement().use { sql ->
                sql.execute("set search_path to $schema")
                sql.execute("insert into sector values ('unknown','Sem vínculo')")
            }
        }
        org.junit.jupiter.api.assertThrows<org.flywaydb.core.api.FlywayException> { migration.migrate() }
        migration.configuration.dataSource.connection.use { connection ->
            connection.createStatement().use { sql ->
                sql.execute("set search_path to $schema")
                assertEquals(1,sql.executeUpdate("delete from sector where id='unknown'"))
            }
        }
        assertEquals(1,config().load().migrate().migrationsExecuted)
        assertEquals(0,config().load().migrate().migrationsExecuted)
    }
}
