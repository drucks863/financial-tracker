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
        val essentialCategoryNames = categories
            .filter { it.type == EntryType.EXPENSE && it.essential == true }
            .map { it.name }
            .toSet()
        val entriesByMonthIndex = entries
            .filter { it.date.take(4).toInt() == year }
            .groupBy { it.date.substring(5, 7).toInt() - 1 }
        return (0 until 12).map { monthIndex ->
            val monthEntries = entriesByMonthIndex[monthIndex].orEmpty()
            val income = monthEntries.filter { it.type == EntryType.INCOME }.sumOf { it.amount }
            val expenseEntries = monthEntries.filter { it.type == EntryType.EXPENSE }
            val expense = expenseEntries.sumOf { it.amount }
            val essential = expenseEntries.filter { it.category in essentialCategoryNames }.sumOf { it.amount }
            val net = income - expense
            MonthTotals(
                month = monthIndex,
                ym = "%d-%02d".format(year, monthIndex + 1),
                income = income,
                expense = expense,
                essential = essential,
                discretionary = expense - essential,
                count = monthEntries.size,
                net = net,
                savingsRate = if (income != 0.0) net / income else null,
            )
        }
    }

    /** Averages skip zero months, matching the sheet's Average column. */
    fun averageOfNonZero(values: List<Double>): Double =
        values.filter { abs(it) > 0.004 }.let { nonZero -> if (nonZero.isEmpty()) 0.0 else nonZero.average() }

    fun netWorthSeries(accounts: List<Account>, snapshots: List<Snapshot>, loans: List<Loan>): List<NetWorthPoint> {
        val schedulesByLoanId = loans.associate { loan -> loan.id to LoanMath.schedule(loan) }
        return snapshots.sortedBy { it.date }.map { snapshot ->
            val totalsByGroup = AccountGroup.entries.associateWith { 0.0 }.toMutableMap()
            // Debt balances count as amounts owed whichever sign they were entered with.
            for (account in accounts) {
                val balance = snapshot.values[account.id] ?: 0.0
                totalsByGroup.merge(account.group, if (account.group == AccountGroup.DEBT) abs(balance) else balance, Double::plus)
            }
            // Loans from the budget setup add their balance, and the property they bought counts under Other assets.
            val yearMonth = snapshot.date.take(7)
            val loanBalances = mutableMapOf<String, Double>()
            val propertyValues = mutableMapOf<String, Double>()
            for (loan in loans) {
                val loanBalance = LoanMath.balanceAt(loan, yearMonth, schedulesByLoanId.getValue(loan.id))
                if (loanBalance > 0) {
                    loanBalances[loan.id] = loanBalance
                    totalsByGroup.merge(AccountGroup.DEBT, loanBalance, Double::plus)
                }
                val propertyValue = LoanMath.propertyValueAt(loan, yearMonth)
                if (propertyValue > 0) {
                    propertyValues[loan.id] = propertyValue
                    totalsByGroup.merge(AccountGroup.OTHER_ASSETS, propertyValue, Double::plus)
                }
            }
            val assets = totalsByGroup.getValue(AccountGroup.CASH) +
                totalsByGroup.getValue(AccountGroup.INVESTMENTS) +
                totalsByGroup.getValue(AccountGroup.OTHER_ASSETS)
            val debt = totalsByGroup.getValue(AccountGroup.DEBT)
            NetWorthPoint(snapshot.date, totalsByGroup, assets, debt, loanBalances, propertyValues, assets - debt, snapshot.values)
        }
    }
}
