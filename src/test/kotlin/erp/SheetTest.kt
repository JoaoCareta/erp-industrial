package erp

import erp.engineering.domain.PieceLine
import erp.engineering.domain.Sheet
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.util.UUID

@Tag("unit")
class SheetTest {
    private val wheel = PieceLine(UUID.randomUUID(), 2, listOf("corte", "pintura"))

    @Test fun acceptsOrderedStepsAndPositiveQuantities() {
        Sheet(listOf(wheel), emptyList()).validate()
    }

    @Test fun rejectsDuplicateParts() {
        assertThrows(IllegalArgumentException::class.java) {
            Sheet(listOf(wheel, wheel.copy(quantity = 1)), emptyList()).validate()
        }
    }

    @Test fun rejectsBlankSteps() {
        assertThrows(IllegalArgumentException::class.java) {
            Sheet(listOf(wheel.copy(steps = listOf("corte", " "))), emptyList()).validate()
        }
    }
}
