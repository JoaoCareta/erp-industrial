package erp.access

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class Audit(private val db: JdbcTemplate) {
    fun record(actor: String, action: String, target: String, result: String, reason: String) {
        db.update("insert into access_audit(actor,action,target,result,reason,correlation) values (?,?,?,?,?,?)",
            actor, action, target, result, reason, UUID.randomUUID())
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun denied(actor: String, action: String, target: String) = record(actor, action, target, "denied", "Sem acesso efetivo")
}

/** Verifica a conta e a concessão vigentes no banco a cada operação protegida. */
@Service
class Access(private val db: JdbcTemplate, private val audit: Audit) {
    fun check(jwt: Jwt, action: String, scope: String = "*") {
        val allowed = db.queryForObject("""select exists(select 1 from account a join entitlement e on a.id=e.account_id
            where a.issuer=? and a.subject=? and a.active and e.action=? and e.scope in (?, '*'))""",
            Boolean::class.java, jwt.issuer.toString(), jwt.subject, action, scope)
        if (allowed != true) {
            audit.denied(jwt.subject, action, scope)
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
    }
}

data class Suspension(val reason: String)

@RestController
@RequestMapping("/api")
class Accounts(private val access: Access, private val db: JdbcTemplate, private val audit: Audit) {
    @GetMapping("/sectors/{sector}/team")
    fun team(@AuthenticationPrincipal jwt: Jwt, @PathVariable sector: String): List<Map<String, Any?>> {
        access.check(jwt, "team.read", sector)
        return db.queryForList("select id,name from account where sector_id=? and active order by name,id", sector)
    }
    @PostMapping("/accounts/{id}/suspension")
    @Transactional
    fun suspendAccount(@AuthenticationPrincipal jwt: Jwt, @PathVariable id: UUID, @RequestBody request: Suspension) {
        access.check(jwt, "account.suspend")
        require(request.reason.isNotBlank()) { "Informe o motivo" }
        if (db.update("update account set active=false where id=?", id) == 0) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        audit.record(jwt.subject, "account.suspend", id.toString(), "allowed", request.reason)
    }
}
