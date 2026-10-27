package app.financetracker.model

// Loans on the budget setup, the property behind them, and their amortization.

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
