package erp

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JourneyTest @Autowired constructor(val mvc: MockMvc) {
    val leader = principal("00000000-0000-4000-8000-000000000001")
    val admin = principal("00000000-0000-4000-8000-000000000002")
    fun principal(id: String) = jwt().jwt { it.subject(id).issuer(System.getenv("OIDC_ISSUER")) }

    @Test fun sectorAndSuspension() {
        mvc.get("/api/sectors/corte/team") { with(leader) }.andExpect { status { isOk() }; jsonPath("$[0].name") { value("Ana") } }
        mvc.get("/api/sectors/pintura/team") { with(leader) }.andExpect { status { isForbidden() } }
        mvc.post("/api/accounts/00000000-0000-4000-8000-000000000001/suspension") {
            with(admin); contentType = org.springframework.http.MediaType.APPLICATION_JSON; content = """{"reason":"Teste de suspensão"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/api/sectors/corte/team") { with(leader) }.andExpect { status { isForbidden() } }
    }
}
