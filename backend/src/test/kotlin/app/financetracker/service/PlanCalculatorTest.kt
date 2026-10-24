package app.financetracker.service

import app.financetracker.model.PayDeduction
import app.financetracker.model.PayFrequency
import app.financetracker.model.Plan
import app.financetracker.model.SharedCost
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class PlanCalculatorTest {
    private val plan = Plan(
        salary = 78_000.0,
        payFrequency = PayFrequency.BIWEEKLY,
        taxRate = 0.2,
        k401 = 0.1,
        match = 0.05,
        deductions = listOf(PayDeduction("d", "HSA", 100.0)),
        housing = listOf(SharedCost("r", "Rent", 2000.0, 0.5), SharedCost("w", "Water", 100.0, 1.0)),
    )

    @Test
    fun `paycheck math`() {
        val paycheck = PlanCalculator.summarize(plan).paycheck
        assertEquals(3000.0, paycheck.gross, 1e-9)
        assertEquals(300.0, paycheck.k401, 1e-9)
        assertEquals(150.0, paycheck.match, 1e-9)
        assertEquals(100.0, paycheck.deductions, 1e-9)
        // taxable = 3000 - 300 - 100 = 2600; taxes 20%
        assertEquals(520.0, paycheck.taxes, 1e-9)
        assertEquals(2080.0, paycheck.takeHome, 1e-9)
    }

    @Test
    fun `actual take-home overrides the estimate`() {
        assertEquals(2200.0, PlanCalculator.summarize(plan.copy(takeHome = 2200.0)).paycheck.takeHome)
    }

    @Test
    fun `monthly figures use paychecks per year and my share of housing`() {
        val monthly = PlanCalculator.summarize(plan).monthly
        assertEquals(2080.0 * 26 / 12, monthly.takeHome, 1e-9)
        assertEquals(2100.0, monthly.housingTotal, 1e-9)
        assertEquals(1100.0, monthly.housingMine, 1e-9)
        assertEquals(monthly.takeHome - 1100.0, monthly.afterHousing, 1e-9)
        assertEquals(550.0 * 26 / 12, monthly.saved, 1e-9)
    }

    @Test
    fun `saved rate is share of gross salary`() {
        assertEquals(550.0 * 26 / 78_000.0, PlanCalculator.summarize(plan).savedRate!!, 1e-9)
    }
}
