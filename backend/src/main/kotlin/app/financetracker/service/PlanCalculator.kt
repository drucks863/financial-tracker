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
    fun summarize(plan: Plan, yearMonth: String = YearMonth.now().toString()): PlanSummary {
        val paychecksPerYear = plan.payFrequency.perYear
        fun toMonthly(perPaycheck: Double) = perPaycheck * paychecksPerYear / 12

        val grossPay = plan.salary / paychecksPerYear
        val your401k = grossPay * plan.k401
        val company401k = grossPay * plan.match
        val otherDeductions = plan.deductions.sumOf { it.perPaycheck }
        // Estimate: what's left after 401k and other deductions, taxed at the effective rate.
        val taxablePay = max(0.0, grossPay - your401k - otherDeductions)
        val taxes = taxablePay * plan.taxRate
        val estimatedTakeHome = taxablePay - taxes
        val takeHome = plan.takeHome ?: estimatedTakeHome

        val housingLines = plan.housing.map { cost -> HousingLine(cost, cost.monthly * cost.share) }
        val loanLines = plan.loans.map { loan -> LoanLine(loan, LoanMath.summary(loan, yearMonth)) }
        val loanPayments = loanLines.filter { it.summary.balance > 0 }.sumOf { it.summary.payment }

        val monthlyTakeHome = toMonthly(takeHome)
        val myMonthlyHousing = housingLines.sumOf { it.mine }
        val savedMonthly = toMonthly(your401k + company401k + otherDeductions)
        return PlanSummary(
            perYear = paychecksPerYear,
            paycheck = Paycheck(grossPay, your401k, company401k, otherDeductions, taxes, estimatedTakeHome, takeHome),
            monthly = Monthly(
                gross = toMonthly(grossPay),
                k401 = toMonthly(your401k),
                match = toMonthly(company401k),
                deductions = toMonthly(otherDeductions),
                taxes = toMonthly(taxes),
                takeHome = monthlyTakeHome,
                housingTotal = plan.housing.sumOf { it.monthly },
                housingMine = myMonthlyHousing,
                loanPayments = loanPayments,
                afterHousing = monthlyTakeHome - myMonthlyHousing - loanPayments,
                saved = savedMonthly,
            ),
            housing = housingLines,
            loans = loanLines,
            savedYearly = savedMonthly * 12,
            savedRate = if (plan.salary != 0.0) savedMonthly * 12 / plan.salary else null,
        )
    }
}
