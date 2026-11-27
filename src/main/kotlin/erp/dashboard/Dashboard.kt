package erp.dashboard

import erp.access.Access
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.*
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

data class ShiftEvent(val kind:String,val sourceId:UUID,val orderId:UUID?,val label:String,val date:String,val quantity:String,val unit:String)

@RestController
@RequestMapping("/api/units/{plant}/dashboard")
class Dashboard(private val access:Access,private val db:JdbcTemplate) {
    /** Operational timestamps use the requested UTC offset. Commercial events retain the entered business date. */
    @GetMapping fun events(@AuthenticationPrincipal jwt:Jwt,@PathVariable plant:String,@RequestParam from:LocalDate,
            @RequestParam until:LocalDate,@RequestParam(defaultValue="0") offset:Int):List<ShiftEvent> {
        access.check(jwt,"dashboard.read",plant)
        require(from<=until && offset in -1080..1080)
        val zone=ZoneOffset.ofTotalSeconds(offset*60)
        val start=from.atStartOfDay().atOffset(zone).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()
        val end=until.plusDays(1).atStartOfDay().atOffset(zone).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()
        return db.query("""select * from shift_event e where e.plant_id=? and exists(select 1 from effective_action a where
            a.issuer=? and a.subject=? and a.plant_id=e.plant_id and a.sector_id is null and a.action=e.grant_name)
            and ((e.commercial_date is not null and e.commercial_date between ? and ?) or
            (e.commercial_date is null and occurred_at>=? and occurred_at<?)) order by occurred_at desc,source_id""",
            {r,_-> ShiftEvent(r.getString("kind"),r.getObject("source_id",UUID::class.java),r.getObject("order_id",UUID::class.java),
                r.getString("label"),r.getString("commercial_date") ?: r.getString("occurred_at")+" UTC",
                r.getBigDecimal("quantity").stripTrailingZeros().toPlainString(),r.getString("unit"))},
            plant,jwt.issuer.toString(),jwt.subject,from,until,start,end)
    }
}
