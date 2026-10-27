package app.financetracker.model

import com.fasterxml.jackson.annotation.JsonValue

// Accounts, month-end snapshots, and the net worth series built from them.

enum class AccountGroup(@JsonValue val json: String) {
    CASH("Cash"), INVESTMENTS("Investments"), OTHER_ASSETS("Other assets"), DEBT("Debt")
}

data class Account(val id: String, val name: String, val group: AccountGroup)

data class Snapshot(
    /** month-end date, YYYY-MM-DD */
    val date: String,
    /** balance per account id */
    val values: Map<String, Double>,
)

data class NetWorth(val accounts: List<Account>, val snapshots: List<Snapshot>)

data class AccountImport(val name: String, val group: AccountGroup, val values: Map<String, Double>)

data class NetWorthPoint(
    val date: String,
    /** per group; Debt is the amount owed, as a positive number */
    val byGroup: Map<AccountGroup, Double>,
    val assets: Double,
    val debt: Double,
    /** loan balances that month, by loan id */
    val loans: Map<String, Double>,
    /** values of the properties behind loans that month, by loan id */
    val properties: Map<String, Double>,
    val total: Double,
    val values: Map<String, Double>,
)
