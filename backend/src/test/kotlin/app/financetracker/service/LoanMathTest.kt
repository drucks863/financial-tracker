package app.financetracker.service

import app.financetracker.model.Loan
import app.financetracker.model.LoanProperty
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LoanMathTest {
    private val car = Loan(id = "l1", name = "Car", amount = 24_000.0, rate = 0.059, termYears = 5.0, start = "2024-06")

    @Test
    fun `monthly payment matches the standard formula`() {
        assertEquals(462.88, LoanMath.payment(car), 0.01)
    }

    @Test
    fun `zero rate splits the amount evenly`() {
        assertEquals(400.0, LoanMath.payment(car.copy(rate = 0.0)), 1e-9)
    }

    @Test
    fun `schedule pays the loan off on the last month`() {
        val rows = LoanMath.schedule(car)
        assertEquals(60, rows.size)
        assertEquals("2024-06", rows.first().ym)
        assertEquals("2029-05", rows.last().ym)
        assertEquals(0.0, rows.last().balance, 0.01)
        assertEquals(24_000.0, rows.sumOf { it.principal }, 0.01)
    }

    @Test
    fun `extra principal shortens the loan`() {
        val rows = LoanMath.schedule(car.copy(extraMonthly = 200.0))
        assert(rows.size < 60) { "expected an early payoff, got ${rows.size} months" }
    }

    @Test
    fun `balance is the full amount the month before the first payment and zero before that`() {
        assertEquals(0.0, LoanMath.balanceAt(car, "2024-04"))
        assertEquals(24_000.0, LoanMath.balanceAt(car, "2024-05"))
        assertEquals(LoanMath.schedule(car)[0].balance, LoanMath.balanceAt(car, "2024-06"))
        assertEquals(0.0, LoanMath.balanceAt(car, "2030-01"))
    }

    @Test
    fun `property value grows from its valuation month and is zero before the loan closed`() {
        val home = car.copy(property = LoanProperty("House", 300_000.0, "2025-01", 0.02))
        assertEquals(300_000.0, LoanMath.propertyValueAt(home, "2025-01"), 1e-6)
        assertEquals(306_000.0, LoanMath.propertyValueAt(home, "2026-01"), 1e-6)
        assertEquals(0.0, LoanMath.propertyValueAt(home, "2024-01"))
    }

    @Test
    fun `summary splits interest and principal paid so far`() {
        val s = LoanMath.summary(car, "2024-08")
        val rows = LoanMath.schedule(car).take(3)
        assertEquals(rows.sumOf { it.interest }, s.interestPaid, 1e-9)
        assertEquals(rows.sumOf { it.principal }, s.principalPaid, 1e-9)
        assertEquals("2029-05", s.payoff)
        assertNull(s.equity)
    }
}
