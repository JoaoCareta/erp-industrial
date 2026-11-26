package erp

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.*
import tools.jackson.databind.ObjectMapper
import java.io.File

@SpringBootTest
@AutoConfigureMockMvc
class LegacyFixtureTest @Autowired constructor(val mvc: MockMvc, val json: ObjectMapper, val db: JdbcTemplate) {
    private val api = if (System.getenv("ERP_FIXTURE_HISTORY") == "scoped") "/api/units/eduk" else "/api"
    private fun user(n: Int) = jwt().jwt {
        it.subject("00000000-0000-4000-8000-00000000000$n").issuer(System.getenv("OIDC_ISSUER"))
    }
    private fun post(path: String, body: String) = json.readTree(mvc.post("$api/$path") {
        with(user(2)); contentType = MediaType.APPLICATION_JSON; content = body
    }.andExpect { status { isOk() } }.andReturn().response.contentAsString)

    @Test fun publishReference() {
        db.update("""insert into access_audit(id,occurred_at,actor,action,target,result,reason,correlation)
            overriding system value values (123456,'2024-06-01T03:04:05.123456Z','fixture','team.read','corte',
            'denied','Medição de precisão 🧪','4f281446-80c0-11ee-b962-0242ac120002')""")
        fun item(kind: String, extra: String = "") = post("catalog/$kind",
            """{"code":"$kind","name":"$kind"$extra}""")["id"].stringValue()
        val category = item("category")
        val unit = item("unit", ""","dimension":"contagem"""")
        val material = item("material", ""","categoryId":"$category","unitId":"$unit"""")
        val product = item("product")
        val part = item("part")
        val draft = post("products/$product/drafts", """{"pieces":[{"partId":"$part","quantity":2,"steps":["corte","pintura"]}],"materials":[{"materialId":"$material","unitId":"$unit","quantity":0.50}]}""")["id"].stringValue()
        post("products/$product/drafts/$draft/publication", """{"revision":1}""")
        fun get(path: String, n: Int) = json.readTree(mvc.get("$api/$path") { with(user(n)) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString)
        File(System.getenv("ERP_REFERENCE")).writeText(json.writeValueAsString(mapOf(
            "product" to product, "sheet" to get("products/$product/versions/1",2),
            "team" to get("sectors/corte/team",1))))
    }
}
