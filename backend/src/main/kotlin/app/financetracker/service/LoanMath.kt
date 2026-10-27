package app.financetracker.service

import app.financetracker.model.Loan
import app.financetracker.model.LoanRow
import app.financetracker.model.LoanSummary
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// Standard amortization, month by month. A port of frontend/src/lib/loan.ts; keep the two in step.

object LoanMath {
    private val YEAR_MONTH_PATTERN = Regex("""^\d{4}-\d{2}$""")

    fun isYearMonth(value: String) = YEAR_MONTH_PATTERN.matches(value)

    fun monthsBetween(fromYearMonth: String, toYearMonth: String): Int {
        val from = YearMonth.parse(fromYearMonth)
        val to = YearMonth.parse(toYearMonth)
        return (to.year - from.year) * 12 + (to.monthValue - from.monthValue)
    }

    /** Required monthly payment (principal + interest), before any extra. */
    fun payment(loan: Loan): Double {
        val paymentCount = (loan.termYears * 12).roundToInt()
        if (loan.amount == 0.0 || paymentCount <= 0) return 0.0
        val monthlyRate = loan.rate / 12
        return if (monthlyRate != 0.0) {
            loan.amount * monthlyRate / (1 - (1 + monthlyRate).pow(-paymentCount))
        } else {
            loan.amount / paymentCount
        }
    }

    fun schedule(loan: Loan): List<LoanRow> {
        val requiredPayment = payment(loan)
        if (!isYearMonth(loan.start) || requiredPayment <= 0) return emptyList()
        val monthlyRate = loan.rate / 12
        val firstMonth = YearMonth.parse(loan.start)
        val maxPayments = (loan.termYears * 12).roundToInt()
        var balance = loan.amount
        val rows = mutableListOf<LoanRow>()
        var paymentIndex = 0
        while (paymentIndex < maxPayments && balance > 0.005) {
            val interest = balance * monthlyRate
            val principal = min(balance, requiredPayment - interest + loan.extraMonthly)
            balance -= principal
            val month = firstMonth.plusMonths(paymentIndex.toLong()).toString()
            rows += LoanRow(month, interest + principal, interest, principal, max(0.0, balance))
            paymentIndex++
        }
        return rows
    }

    /**
     * Balance owed at the end of [yearMonth]. The month before the first payment (when the loan
     * closed) owes the full amount; earlier than that the loan didn't exist yet.
     */
    fun balanceAt(loan: Loan, yearMonth: String, schedule: List<LoanRow> = schedule(loan)): Double {
        if (!isYearMonth(loan.start) || loan.amount == 0.0) return 0.0
        val paymentIndex = monthsBetween(loan.start, yearMonth)
        return when {
            paymentIndex < -1 -> 0.0
            paymentIndex == -1 -> loan.amount
            paymentIndex < schedule.size -> schedule[paymentIndex].balance
            else -> 0.0
        }
    }

    /**
     * Value of the loan's property at the end of [yearMonth]: the conservative value grown (or shrunk)
     * by its yearly change from the valuation month. Zero before the loan closed.
     */
    fun propertyValueAt(loan: Loan, yearMonth: String): Double {
        val property = loan.property ?: return 0.0
        if (property.value == 0.0 || !isYearMonth(property.valuedOn)) return 0.0
        if (isYearMonth(loan.start) && monthsBetween(loan.start, yearMonth) < -1) return 0.0
        val monthsSinceValuation = monthsBetween(property.valuedOn, yearMonth)
        return max(0.0, property.value * (1 + property.yearlyChange).pow(monthsSinceValuation / 12.0))
    }

    fun summary(loan: Loan, yearMonth: String = YearMonth.now().toString()): LoanSummary {
        val schedule = schedule(loan)
        val paidSoFar = schedule.filter { row -> row.ym <= yearMonth }
        val balance = balanceAt(loan, yearMonth, schedule)
        val propertyValue = propertyValueAt(loan, yearMonth)
        return LoanSummary(
            payment = payment(loan) + loan.extraMonthly,
            balance = balance,
            value = propertyValue,
            equity = if (abs(propertyValue) > 0) propertyValue - balance else null,
            payoff = schedule.lastOrNull()?.ym,
            interestPaid = paidSoFar.sumOf { it.interest },
            principalPaid = paidSoFar.sumOf { it.principal },
            interestTotal = schedule.sumOf { it.interest },
            rows = schedule,
        )
    }
}
