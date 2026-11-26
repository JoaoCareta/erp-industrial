package erp

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.ObjectNode
import java.io.File
import java.time.OffsetDateTime

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "ERP_REFERENCE", matches = ".+")
class UpgradeTest @Autowired constructor(val mvc: MockMvc, val json: ObjectMapper, val db: JdbcTemplate) {
    private fun snapshot(sheet: JsonNode): ObjectNode {
        val instant = OffsetDateTime.parse(sheet["publishedAt"].stringValue()).toInstant()
        return (sheet as ObjectNode).put("publishedAt", instant.toString())
    }

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
        assertEquals(snapshot(reference["sheet"]), snapshot(get("products/$product/versions/1",2)))
        val team = get("sectors/corte/team",1)
        assertEquals(reference["team"].size(), team.size())
        for ((i, person) in team.withIndex()) {
            for (key in listOf("id","name")) assertEquals(reference["team"][i][key],person[key])
        }
        mvc.get("/api/units/eduk/sectors/pintura/team") { with(user(1)) }.andExpect { status { isForbidden() } }
    }

    @Test @Transactional fun preservesAuditAndContinuesSequence() {
        val correlation = "4f281446-80c0-11ee-b962-0242ac120002"
        val row = db.queryForMap("""select id, reason, date_format(occurred_at, '%Y-%m-%d %H:%i:%s.%f') as occurred
            from access_audit where correlation=?""", correlation)
        assertEquals(123456L, (row["id"] as Number).toLong())
        assertEquals("Medição de precisão 🧪", row["reason"])
        assertEquals("2024-06-01 03:04:05.123456", row["occurred"])
        val maximum = db.queryForObject("select max(id) from access_audit", Long::class.java)!!
        db.update("""insert into access_audit(actor,action,target,result,reason,correlation)
            values ('upgrade','team.read','eduk/corte','allowed','ensaio',?)""", correlation)
        val newId = db.queryForObject("select id from access_audit where actor='upgrade' and reason='ensaio'", Long::class.java)!!
        assertTrue(newId > maximum && newId > 2_000_000)
    }
}

@SpringBootTest
@EnabledIfEnvironmentVariable(named = "ERP_REFERENCE", matches = ".+")
class UpgradeTargetTest @Autowired constructor(val db: JdbcTemplate, val flyway: org.flywaydb.core.Flyway) {
    @Test fun initializesCoreWithoutDemoData() {
        assertEquals(0, db.queryForObject("select count(*) from account", Int::class.java))
        assertEquals(0, flyway.migrate().migrationsExecuted)
    }
}
