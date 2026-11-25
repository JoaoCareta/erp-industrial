package erp

import erp.engineering.*
import erp.engineering.domain.*
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest
class PublicationTest @Autowired constructor(val catalog: Catalog, val sheets: Sheets, val db: JdbcTemplate) {
    @Test fun concurrentRetryAndImmutableHistory() {
        val code = "zz-" + UUID.randomUUID()
        val product = catalog.save(Kind.product,ItemInput(code,"Kit"),null)
        val part = catalog.save(Kind.part,ItemInput(code,"Peça"),null)
        val sheet = Sheet(listOf(PieceLine(part.id,2,listOf("corte"))),emptyList())
        val draft = sheets.create(product.id,sheet)
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val calls = List(2) { pool.submit(Callable {
                barrier.await(10,TimeUnit.SECONDS)
                sheets.publish(product.id,draft.id,1,"teste")
            }) }
            assertEquals(listOf(1,1), calls.map { it.get(20,TimeUnit.SECONDS) })
        } finally { pool.shutdownNow() }
        assertThrows<DataAccessException> { db.update("update publication set actor='outro' where draft_id=?",draft.id) }
        assertThrows<DataAccessException> { db.update("delete from publication where draft_id=?",draft.id) }
        assertEquals(listOf(1),sheets.versions(product.id))
        val invalidated = sheets.create(product.id,sheet)
        catalog.save(Kind.part,part.value.copy(active=false),part.id)
        assertThrows<IllegalArgumentException> { sheets.publish(product.id,invalidated.id,1,"teste") }
        assertEquals(listOf(1),sheets.versions(product.id))
    }
}
