package app.financetracker.service

import app.financetracker.model.Account
import app.financetracker.model.AccountGroup
import app.financetracker.model.Category
import app.financetracker.model.Entry
import app.financetracker.model.EntryType
import app.financetracker.model.Loan
import app.financetracker.model.MonthTotals
import app.financetracker.model.NetWorthPoint
import app.financetracker.model.Snapshot
import kotlin.math.abs

// Aggregates the screens show. Ports of monthTotals / netWorthSeries in frontend/src/store/finance.ts.

object Summaries {
    /** Per-month totals for one year, like the sheet's Summary tab: net = income - expenses. */
    fun monthTotals(year: Int, entries: List<Entry>, categories: List<Category>): List<MonthTotals> {
        val essential = categories.filter { it.type == EntryType.EXPENSE && it.essential == true }.map { it.name }.toSet()
        val byMonth = entries.filter { it.date.take(4).toInt() == year }.groupBy { it.date.substring(5, 7).toInt() - 1 }
        return (0 until 12).map { m ->
            val es = byMonth[m].orEmpty()
            val income = es.filter { it.type == EntryType.INCOME }.sumOf { it.amount }
            val expenses = es.filter { it.type == EntryType.EXPENSE }
            val expense = expenses.sumOf { it.amount }
            val ess = expenses.filter { it.category in essential }.sumOf { it.amount }
            val net = income - expense
            MonthTotals(m, "%d-%02d".format(year, m + 1), income, expense, ess, expense - ess, es.size, net, if (income != 0.0) net / income else null)
        }
    }

    /** Averages skip zero months, matching the sheet's Average column. */
    fun avgNonZero(values: List<Double>): Double = values.filter { abs(it) > 0.004 }.let { if (it.isEmpty()) 0.0 else it.average() }

    fun netWorthSeries(accounts: List<Account>, snapshots: List<Snapshot>, loans: List<Loan>): List<NetWorthPoint> {
        val schedules = loans.associate { it.id to LoanMath.schedule(it) }
        return snapshots.sortedBy { it.date }.map { s ->
            val byGroup = AccountGroup.entries.associateWith { 0.0 }.toMutableMap()
            // Debt balances count as amounts owed whichever sign they were entered with.
            for (a in accounts) {
                val v = s.values[a.id] ?: 0.0
                byGroup.merge(a.group, if (a.group == AccountGroup.DEBT) abs(v) else v, Double::plus)
            }
            // Loans from the budget setup add their balance, and the property they bought counts under Other assets.
            val ym = s.date.take(7)
            val loanBalances = mutableMapOf<String, Double>()
            val properties = mutableMapOf<String, Double>()
            for (l in loans) {
                val b = LoanMath.balanceAt(l, ym, schedules.getValue(l.id))
                if (b > 0) { loanBalances[l.id] = b; byGroup.merge(AccountGroup.DEBT, b, Double::plus) }
                val v = LoanMath.propertyValueAt(l, ym)
                if (v > 0) { properties[l.id] = v; byGroup.merge(AccountGroup.OTHER_ASSETS, v, Double::plus) }
            }
            val assets = byGroup.getValue(AccountGroup.CASH) + byGroup.getValue(AccountGroup.INVESTMENTS) + byGroup.getValue(AccountGroup.OTHER_ASSETS)
            val debt = byGroup.getValue(AccountGroup.DEBT)
            NetWorthPoint(s.date, byGroup, assets, debt, loanBalances, properties, assets - debt, s.values)
        }
    }
}
