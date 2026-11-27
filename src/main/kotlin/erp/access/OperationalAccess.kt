package erp.access

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class AccountGrant(val id:UUID,val name:String,val actions:List<String>)
data class GrantDecision(val enabled:Boolean,val reason:String,val requestId:UUID)
data class GrantPage(val actions:List<String>,val accounts:List<AccountGrant>)

@RestController
@RequestMapping("/api/units/{plant}/operational-access")
class OperationalAccess(private val access:Access,private val audit:Audit,private val db:JdbcTemplate) {
    private fun actions()=db.queryForList("select action from operational_action where action<>'access.operations' order by action",String::class.java).filterNotNull()
    private val accounts="""select distinct a.id,a.name from effective_role r join account a on a.id=r.account_id where r.plant_id=?
        and not exists(select 1 from effective_role admin where admin.plant_id=r.plant_id and admin.account_id=r.account_id and admin.role_id='admin')"""
    @GetMapping fun list(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String):GrantPage {
        access.check(jwt,"access.operations",plant)
        val actions=actions()
        val people=db.query(accounts+" order by a.name,a.id",{r,_->
            val id=r.getObject("id",UUID::class.java)
            val granted=db.queryForList("select distinct action from effective_action where plant_id=? and account_id=? and sector_id is null order by action",
                String::class.java,plant,id).filterNotNull().filter { it in actions }
            AccountGrant(id,r.getString("name"),granted)
        },plant)
        return GrantPage(actions,people)
    }
    @PutMapping("/{id}/{action}") @Transactional
    fun set(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@PathVariable id:UUID,@PathVariable action:String,@RequestBody input:GrantDecision):GrantPage {
        val group=access.check(jwt,"access.operations",plant)
        require(action in actions() && input.reason.trim().length in 1..500)
        if(db.queryForList(accounts+" and a.id=? and not(a.issuer=? and a.subject=?)",plant,id,jwt.issuer.toString(),jwt.subject).isEmpty())
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        db.queryForObject("select id from plant where id=? for update",String::class.java,plant)
        val prior=db.queryForList("select account_id,action,enabled,reason from operational_decision where plant_id=? and request_id=?",plant,input.requestId)
        if(prior.isNotEmpty()) {
            val same=db.queryForObject("""select count(*) from operational_decision where plant_id=? and request_id=? and account_id=?
                and action=? and enabled=? and reason=?""",Int::class.java,plant,input.requestId,id,action,input.enabled,input.reason.trim())
            if(same!=1) throw ResponseStatusException(HttpStatus.CONFLICT,"Chave utilizada com outra decisão")
            return list(jwt,plant)
        }
        db.update("insert into operational_decision(plant_id,request_id,account_id,action,enabled,reason) values(?,?,?,?,?,?)",
            plant,input.requestId,id,action,input.enabled,input.reason.trim())
        db.update("""insert into operational_grant(group_id,plant_id,account_id,action,enabled) values(?,?,?,?,?)
            on duplicate key update enabled=values(enabled)""",group,plant,id,action,input.enabled)
        audit.record(jwt.subject,if(input.enabled) "access.grant" else "access.revoke","$plant/$id/$action","allowed",input.reason.trim())
        return list(jwt,plant)
    }
}
