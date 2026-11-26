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
    fun check(jwt: Jwt, action: String, plant: String, sector: String? = null): String {
        val groups = db.queryForList("""select distinct group_id from effective_action
            where issuer=? and subject=? and plant_id=? and action=? and (sector_id is null or sector_id=?)""",
            String::class.java, jwt.issuer.toString(), jwt.subject, plant, action, sector)
        return groups.firstOrNull() ?: deny(jwt, action, "$plant/${sector.orEmpty()}")
    }
    private fun deny(jwt: Jwt, action: String, target: String): Nothing {
        audit.denied(jwt.subject, action, target)
        throw ResponseStatusException(HttpStatus.FORBIDDEN)
    }
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    fun context(jwt: Jwt): WorkContext {
        val id = db.queryForList("select id from account where issuer=? and subject=? and active",
            UUID::class.java, jwt.issuer.toString(),jwt.subject).firstOrNull() ?: deny(jwt,"context.read","login")
        val units = db.query("""select distinct p.id,p.name,g.name as group_name from effective_role r
            join plant p on p.id=r.plant_id join business_group g on g.id=p.group_id
            where r.account_id=? order by p.name,p.id""", { row, _ ->
            val plant = row.getString("id")
            val actions = db.queryForList("select distinct action from effective_action where account_id=? and plant_id=? order by action",
                String::class.java,id,plant)
            val sectors = db.query("""select distinct s.id,s.name from sector s join effective_action a
                on a.plant_id=s.plant_id and (a.sector_id is null or a.sector_id=s.id)
                where a.account_id=? and s.plant_id=? and a.action='team.read' order by s.name,s.id""",
                { r, _ -> Sector(r.getString("id"),r.getString("name")) },id,plant)
            WorkUnit(plant,row.getString("name"),row.getString("group_name"),actions,sectors)
        },id)
        return WorkContext(id,units)
    }
}
data class Sector(val id: String, val name: String)
data class WorkUnit(val id: String,val name: String,val groupName: String,val actions: List<String?>,val sectors: List<Sector>)
data class WorkContext(val accountId: UUID,val units: List<WorkUnit>)
data class TeamMember(val id: UUID, val name: String, val role: String?)

@RestController
@RequestMapping("/api")
class Accounts(private val access: Access, private val db: JdbcTemplate) {
    @GetMapping("/me/context")
    fun context(@AuthenticationPrincipal jwt: Jwt) = access.context(jwt)

    @GetMapping("/units/{plant}/sectors/{sector}/team")
    fun team(@AuthenticationPrincipal jwt: Jwt, @PathVariable plant: String, @PathVariable sector: String): List<TeamMember> {
        access.check(jwt, "team.read", plant, sector)
        return db.query("""
            select a.id, a.name, group_concat(r.name order by r.name separator ' · ') as role
            from team_member m join account a on a.id=m.account_id
            left join assignment b on b.account_id=m.account_id
                and b.plant_id=m.plant_id and b.sector_id=m.sector_id
            left join job_role r on r.id=b.role_id
            where m.plant_id=? and m.sector_id=? and a.active
            group by a.id,a.name order by a.name,a.id
        """, { row, _ -> TeamMember(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("role")) },
            plant,sector)
    }
}
