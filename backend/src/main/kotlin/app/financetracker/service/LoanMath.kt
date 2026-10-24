package app.financetracker.service

import app.financetracker.domain.Loan
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// Standard amortization, month by month. A port of frontend/src/lib/loan.ts; keep the two in step.

data class LoanRow(
    /** YYYY-MM */
    val ym: String,
    val payment: Double,
    val interest: Double,
    val principal: Double,
    /** balance after this payment */
    val balance: Double,
)

data class LoanSummary(
    val payment: Double,
    val balance: Double,
    val value: Double,
    /** what you own of the property: its value minus what's still owed */
    val equity: Double?,
    val payoff: String?,
    val interestPaid: Double,
    val principalPaid: Double,
    val interestTotal: Double,
    val rows: List<LoanRow>,
)

object LoanMath {
    private val YM = Regex("""^\d{4}-\d{2}$""")

    fun isYm(s: String) = YM.matches(s)
    private fun ym(s: String): YearMonth = YearMonth.parse(s)
    fun monthsBetween(a: String, b: String): Int = ((ym(b).year - ym(a).year) * 12 + (ym(b).monthValue - ym(a).monthValue))

    /** Required monthly payment (principal + interest), before any extra. */
    fun payment(l: Loan): Double {
        val n = (l.termYears * 12).roundToInt()
        if (l.amount == 0.0 || n <= 0) return 0.0
        val r = l.rate / 12
        return if (r != 0.0) l.amount * r / (1 - (1 + r).pow(-n)) else l.amount / n
    }

    fun schedule(l: Loan): List<LoanRow> {
        val base = payment(l)
        if (!isYm(l.start) || base <= 0) return emptyList()
        val r = l.rate / 12
        val start = ym(l.start)
        var bal = l.amount
        val rows = mutableListOf<LoanRow>()
        val max = (l.termYears * 12).roundToInt()
        var i = 0
        while (i < max && bal > 0.005) {
            val interest = bal * r
            val principal = min(bal, base - interest + l.extraMonthly)
            bal -= principal
            rows += LoanRow(start.plusMonths(i.toLong()).toString(), interest + principal, interest, principal, max(0.0, bal))
            i++
        }
        return rows
    }

    /**
     * Balance owed at the end of month [ym]. The month before the first payment (when the loan
     * closed) owes the full amount; earlier than that the loan didn't exist yet.
     */
    fun balanceAt(l: Loan, ym: String, rows: List<LoanRow> = schedule(l)): Double {
        if (!isYm(l.start) || l.amount == 0.0) return 0.0
        val i = monthsBetween(l.start, ym)
        return when {
            i < -1 -> 0.0
            i == -1 -> l.amount
            i < rows.size -> rows[i].balance
            else -> 0.0
        }
    }

    /**
     * Value of the loan's property at the end of [ym]: the conservative value grown (or shrunk) by
     * its yearly change from the valuation month. Zero before the loan closed.
     */
    fun propertyValueAt(l: Loan, ym: String): Double {
        val p = l.property ?: return 0.0
        if (p.value == 0.0 || !isYm(p.valuedOn)) return 0.0
        if (isYm(l.start) && monthsBetween(l.start, ym) < -1) return 0.0
        val months = monthsBetween(p.valuedOn, ym)
        return max(0.0, p.value * (1 + p.yearlyChange).pow(months / 12.0))
    }

    fun summary(l: Loan, ym: String = YearMonth.now().toString()): LoanSummary {
        val rows = schedule(l)
        val done = rows.filter { it.ym <= ym }
        val balance = balanceAt(l, ym, rows)
        val value = propertyValueAt(l, ym)
        return LoanSummary(
            payment = payment(l) + l.extraMonthly,
            balance = balance,
            value = value,
            equity = if (abs(value) > 0) value - balance else null,
            payoff = rows.lastOrNull()?.ym,
            interestPaid = done.sumOf { it.interest },
            principalPaid = done.sumOf { it.principal },
            interestTotal = rows.sumOf { it.interest },
            rows = rows,
        )
    }
}
