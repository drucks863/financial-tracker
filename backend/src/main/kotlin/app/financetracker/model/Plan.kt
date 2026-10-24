package app.financetracker.model

import com.fasterxml.jackson.annotation.JsonValue

// The budget setup and the figures derived from it.

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

data class Paycheck(
    val gross: Double,
    val k401: Double,
    val match: Double,
    val deductions: Double,
    val taxes: Double,
    val estTakeHome: Double,
    val takeHome: Double,
)

data class Monthly(
    val gross: Double,
    val k401: Double,
    val match: Double,
    val deductions: Double,
    val taxes: Double,
    val takeHome: Double,
    val housingTotal: Double,
    val housingMine: Double,
    val loanPayments: Double,
    /** take-home after my share of rent and bills, and loan payments */
    val afterHousing: Double,
    val saved: Double,
)

data class HousingLine(val item: SharedCost, val mine: Double)
data class LoanLine(val loan: Loan, val summary: LoanSummary)

data class PlanSummary(
    val perYear: Int,
    val paycheck: Paycheck,
    val monthly: Monthly,
    val housing: List<HousingLine>,
    val loans: List<LoanLine>,
    val savedYearly: Double,
    /** share of gross pay going to 401k (yours + company) and other deductions */
    val savedRate: Double?,
)
