package app.financetracker.service

import app.financetracker.model.HousingLine
import app.financetracker.model.LoanLine
import app.financetracker.model.Monthly
import app.financetracker.model.Paycheck
import app.financetracker.model.Plan
import app.financetracker.model.PlanSummary
import java.time.YearMonth
import kotlin.math.max

// The budget setup's derived figures. A port of `planned` in frontend/src/store/plan.ts.

object PlanCalculator {
    fun summarize(p: Plan, ym: String = YearMonth.now().toString()): PlanSummary {
        val perYear = p.payFrequency.perYear
        fun toMonthly(perPaycheck: Double) = perPaycheck * perYear / 12

        val gross = p.salary / perYear
        val k401 = gross * p.k401
        val match = gross * p.match
        val deductions = p.deductions.sumOf { it.perPaycheck }
        // Estimate: what's left after 401k and other deductions, taxed at the effective rate.
        val taxable = max(0.0, gross - k401 - deductions)
        val taxes = taxable * p.taxRate
        val estTakeHome = taxable - taxes
        val takeHome = p.takeHome ?: estTakeHome

        val housing = p.housing.map { HousingLine(it, it.monthly * it.share) }
        val loans = p.loans.map { LoanLine(it, LoanMath.summary(it, ym)) }
        val loanPayments = loans.filter { it.summary.balance > 0 }.sumOf { it.summary.payment }

        val takeHomeMonthly = toMonthly(takeHome)
        val housingMine = housing.sumOf { it.mine }
        val saved = toMonthly(k401 + match + deductions)
        return PlanSummary(
            perYear = perYear,
            paycheck = Paycheck(gross, k401, match, deductions, taxes, estTakeHome, takeHome),
            monthly = Monthly(
                gross = toMonthly(gross),
                k401 = toMonthly(k401),
                match = toMonthly(match),
                deductions = toMonthly(deductions),
                taxes = toMonthly(taxes),
                takeHome = takeHomeMonthly,
                housingTotal = p.housing.sumOf { it.monthly },
                housingMine = housingMine,
                loanPayments = loanPayments,
                afterHousing = takeHomeMonthly - housingMine - loanPayments,
                saved = saved,
            ),
            housing = housing,
            loans = loans,
            savedYearly = saved * 12,
            savedRate = if (p.salary != 0.0) saved * 12 / p.salary else null,
        )
    }
}
