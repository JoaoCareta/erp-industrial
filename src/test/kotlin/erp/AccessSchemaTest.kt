package erp

import java.time.LocalDateTime
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
class AccessSchemaTest @Autowired constructor(private val db: JdbcTemplate) {
    @Test fun duplicateGrantsAreRejectedAtEveryScope() {
        val account = UUID.randomUUID()
        db.update("""insert into account (id,group_id,issuer,subject,name)
            values (?,'mundo-eduk','fixture',?,'Teste')""", account, account.toString())

        for ((plant, sector) in listOf(null to null, "eduk" to null, "eduk" to "corte")) {
            fun grant() = db.update("""insert into assignment (group_id,account_id,role_id,plant_id,sector_id)
                values ('mundo-eduk',?,'operator',?,?)""", account, plant, sector)
            assertEquals(1, grant())
            assertThrows<DuplicateKeyException> { grant() }
        }
    }

    @Test fun oidcIdentityUsesExactStringComparison() {
        val issuer = "https://example.invalid/realms/" + UUID.randomUUID()
        db.update("""insert into account (id,group_id,issuer,subject,name)
            values (?,'mundo-eduk',?,'João','Teste')""", UUID.randomUUID(), issuer)

        fun accounts(iss: String, sub: String) = db.queryForObject(
            "select count(*) from account where issuer=? and subject=?", Int::class.java, iss, sub)
        assertEquals(1, accounts(issuer, "João"))
        assertEquals(0, accounts(issuer.uppercase(), "João"))
        assertEquals(0, accounts(issuer, "joão"))
        assertEquals(0, accounts(issuer, "Joao"))
        assertEquals(0, accounts(issuer, "João "))
    }

    @Test fun auditPreservesUtcMicrosecondsAfter2038() {
        val instant = LocalDateTime.of(2040, 6, 1, 12, 0, 0, 123456000)
        val correlation = UUID.randomUUID()
        db.update("""insert into access_audit(occurred_at,actor,action,target,result,reason,correlation)
            values (?,'fixture','test','fixture','allowed','fixture',?)""", instant, correlation)
        assertEquals(instant, db.queryForObject("select occurred_at from access_audit where correlation=?",
            LocalDateTime::class.java, correlation))
    }
}
