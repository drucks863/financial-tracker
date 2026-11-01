package app.financetracker.service

import app.financetracker.model.Account
import app.financetracker.model.AccountGroup
import app.financetracker.model.Loan
import app.financetracker.model.LoanProperty
import app.financetracker.model.Snapshot
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class SummariesTest {
    private val mortgage = Loan(
        id = "home", name = "Mortgage", amount = 300_000.0, rate = 0.065, termYears = 30.0, start = "2026-01",
        property = LoanProperty(name = "House", value = 350_000.0, valuedOn = "2026-01", yearlyChange = 0.02),
    )
    private val checking = Account("checking", "Checking", AccountGroup.CASH)

    @Test
    fun `accounts that repeat a budget setup loan or its property aren't counted twice`() {
        val copies = listOf(Account("debt", "Home mortgage", AccountGroup.DEBT), Account("house", "House", AccountGroup.OTHER_ASSETS))
        val snapshot = Snapshot("2026-10-31", mapOf("checking" to 1_000.0, "debt" to 298_900.0, "house" to 350_000.0))

        val withCopies = Summaries.netWorthSeries(listOf(checking) + copies, listOf(snapshot), listOf(mortgage)).single()
        val withoutCopies = Summaries.netWorthSeries(listOf(checking), listOf(snapshot), listOf(mortgage)).single()

        assertEquals(withoutCopies.total, withCopies.total, 0.001)
        assertEquals(1_000.0 + withoutCopies.properties.getValue("home") - withoutCopies.loans.getValue("home"), withCopies.total, 0.001)
    }

    @Test
    fun `only a debt named like the loan or an asset named like its property is a copy`() {
        assertNull(Summaries.profileCopyOf(Account("card", "Credit card", AccountGroup.DEBT), listOf(mortgage)))
        assertNull(Summaries.profileCopyOf(Account("m", "Mortgage", AccountGroup.CASH), listOf(mortgage)))
        val carLoan = mortgage.copy(id = "car", name = "Car loan", property = null)
        assertNull(Summaries.profileCopyOf(Account("car", "Car", AccountGroup.OTHER_ASSETS), listOf(carLoan)))
        assertEquals("car", Summaries.profileCopyOf(Account("c", "Car loan", AccountGroup.DEBT), listOf(carLoan))?.id)
    }
}
