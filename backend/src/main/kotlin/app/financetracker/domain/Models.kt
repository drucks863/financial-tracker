package app.financetracker.domain

import com.fasterxml.jackson.annotation.JsonValue

// Domain types. These mirror frontend/src/types.ts field for field, so the JSON the API sends is
// exactly what the Vue store already works with. They are also the shape of the future DynamoDB items.

enum class EntryType(@JsonValue val json: String) { INCOME("income"), EXPENSE("expense") }

data class Category(
    val id: String,
    val type: EntryType,
    val name: String,
    val subcategories: List<String>,
    /** expenses only: counts toward essentials (rent, utilities) instead of discretionary */
    val essential: Boolean? = null,
)

data class Entry(
    val id: String,
    /** YYYY-MM-DD */
    val date: String,
    val type: EntryType,
    val category: String,
    val subcategory: String,
    val description: String,
    val amount: Double,
)

/** YYYY-MM (an extension so it stays out of the JSON) */
val Entry.month: String get() = date.take(7)

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

data class Subscription(
    /** older data has none; the service assigns one */
    val id: String = "",
    val service: String,
    val price: Double?,
    val category: String,
    val frequency: String,
    val `when`: String,
    val from: String,
)

enum class PayFrequency(@JsonValue val json: String, val perYear: Int) {
    WEEKLY("weekly", 52), BIWEEKLY("biweekly", 26), SEMIMONTHLY("semimonthly", 24), MONTHLY("monthly", 12)
}

/** Something taken out of each paycheck (HSA...), as an amount per paycheck. */
data class PayDeduction(val id: String, val name: String, val perPaycheck: Double)

/** A housing cost (rent, water, electric...) and the share of it I pay. */
data class SharedCost(
    val id: String,
    val name: String,
    /** full monthly cost */
    val monthly: Double,
    /** my share, 0–1 (1 when living solo) */
    val share: Double,
)

/** An amortizing loan. Net worth derives its balance from this. */
data class Loan(
    val id: String,
    val name: String,
    /** original amount borrowed */
    val amount: Double,
    /** yearly interest rate, 0–1 */
    val rate: Double,
    val termYears: Double,
    /** first payment month, YYYY-MM */
    val start: String,
    /** extra principal paid each month */
    val extraMonthly: Double = 0.0,
    /** what the loan bought, counted as an asset on Net worth */
    val property: LoanProperty? = null,
)

/** The asset behind a loan, valued conservatively by the person. */
data class LoanProperty(
    val name: String,
    /** conservative market value as of `valuedOn` */
    val value: Double,
    /** YYYY-MM */
    val valuedOn: String,
    /** yearly change in value, e.g. 0.02 for +2% (negative for a car) */
    val yearlyChange: Double,
)

/** The budget setup: steady-state pay, contributions, taxes, housing and loans. */
data class Plan(
    /** display name for the avatar (until there's a login) */
    val name: String? = null,
    /** gross yearly salary */
    val salary: Double = 0.0,
    val payFrequency: PayFrequency = PayFrequency.BIWEEKLY,
    /** effective tax rate, 0–1 */
    val taxRate: Double = 0.22,
    /** actual take-home per paycheck; when null the estimate is used */
    val takeHome: Double? = null,
    /** my 401k contribution, share of salary 0–1 */
    val k401: Double = 0.0,
    /** company 401k contribution, share of salary 0–1 */
    val match: Double = 0.0,
    val deductions: List<PayDeduction> = emptyList(),
    val housing: List<SharedCost> = emptyList(),
    val loans: List<Loan> = emptyList(),
)

data class NetWorth(val accounts: List<Account>, val snapshots: List<Snapshot>)

/** Everything one person has, in the shape the frontend loads at startup. */
data class FinanceData(
    val version: Int = VERSION,
    /** true when this is generated sample data rather than real figures */
    val sample: Boolean = false,
    val categories: List<Category> = emptyList(),
    val entries: List<Entry> = emptyList(),
    val netWorth: NetWorth = NetWorth(emptyList(), emptyList()),
    val subscriptions: List<Subscription> = emptyList(),
    val plan: Plan = Plan(),
) {
    companion object {
        /** matches the frontend's data version; bump both together */
        const val VERSION = 2
    }
}
