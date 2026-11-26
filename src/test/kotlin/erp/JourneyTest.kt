package erp

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JourneyTest @Autowired constructor(val mvc: MockMvc, val db: org.springframework.jdbc.core.JdbcTemplate) {
    val leader = principal("00000000-0000-4000-8000-000000000001")
    val admin = principal("00000000-0000-4000-8000-000000000002")
    fun principal(id: String) = jwt().jwt { it.subject(id).issuer(System.getenv("OIDC_ISSUER")) }

    @Test fun sectorAndSuspension() {
        mvc.get("/api/units/eduk/sectors/corte/team") { with(leader) }.andExpect { status { isOk() }; jsonPath("$[0].name") { value("Ana") } }
        mvc.get("/api/units/eduk/sectors/pintura/team") { with(leader) }.andExpect { status { isForbidden() } }
        mvc.post("/api/units/eduk/accounts/00000000-0000-4000-8000-000000000001/suspension") {
            with(admin); contentType = org.springframework.http.MediaType.APPLICATION_JSON; content = """{"reason":"Teste de suspensão"}"""
        }.andExpect { status { isNotFound() } }
        db.update("update account set active=false where subject=?", "00000000-0000-4000-8000-000000000001")
        mvc.get("/api/units/eduk/sectors/corte/team") { with(leader) }.andExpect { status { isForbidden() } }
        mvc.get("/api/me/context") { with(leader) }.andExpect { status { isForbidden() } }
    }

    @Test fun scopedRoles() {
        fun check(user: String, plant: String, expected: Int) {
            mvc.get("/api/units/$plant/sectors/corte/team") { with(principal("00000000-0000-4000-8000-00000000000$user")) }
                .andExpect { status { isEqualTo(expected) } }
        }
        check("4","birigui",200); check("4","aracatuba",403)
        check("5","aracatuba",200); check("5","birigui",403)
        check("6","birigui",200); check("6","aracatuba",200); check("6","eduk",403)
        check("7","birigui",200); check("7","aracatuba",403)
        db.update("delete from assignment where role_id='regional' and plant_id='aracatuba'")
        check("6","aracatuba",403); check("6","birigui",200)
        val manager = principal("00000000-0000-4000-8000-000000000007")
        mvc.get("/api/units/birigui/catalog/product") { with(manager) }.andExpect { status { isOk() } }
        mvc.get("/api/units/aracatuba/catalog/product") { with(manager) }.andExpect { status { isForbidden() } }
        mvc.post("/api/units/birigui/catalog/product") {
            with(manager); contentType=org.springframework.http.MediaType.APPLICATION_JSON; content="""{"code":"kit","name":"Kit"}"""
        }.andExpect { status { isForbidden() } }
        val id=java.util.UUID.randomUUID()
        db.update("insert into item(id,group_id,kind,code,name,dimension,active) values (?,'grupo-demo','product','kit-privado','Produto privado','',true)",id)
        mvc.get("/api/units/eduk/catalog/product") { with(admin) }.andExpect {
            jsonPath("$[?(@.value.code == 'kit-privado')]") { isEmpty() }
        }
        mvc.put("/api/units/eduk/catalog/product/$id") {
            with(admin); contentType=org.springframework.http.MediaType.APPLICATION_JSON; content="""{"code":"kit","name":"Kit"}"""
        }.andExpect { status { isNotFound() } }
        mvc.get("/api/me/context") { with(leader) }.andExpect {
            jsonPath("$.units.length()") { value(1) }; jsonPath("$.units[0].groupName") { value("Mundo Eduk") }
        }
        mvc.get("/api/me/context") { with(principal("00000000-0000-4000-8000-000000000003")) }.andExpect {
            jsonPath("$.units.length()") { value(0) }
        }
        mvc.post("/api/units/eduk/accounts/00000000-0000-4000-8000-000000000004/suspension") {
            with(admin); contentType=org.springframework.http.MediaType.APPLICATION_JSON; content="""{"reason":"Teste"}"""
        }.andExpect { status { isNotFound() } }
    }
}
