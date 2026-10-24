package app.financetracker.service

import app.financetracker.model.Account
import app.financetracker.model.AccountImport
import app.financetracker.model.AccountGroup
import app.financetracker.model.Category
import app.financetracker.model.CategoryPatch
import app.financetracker.model.Entry
import app.financetracker.model.EntryImport
import app.financetracker.model.EntryType
import app.financetracker.model.FinanceData
import app.financetracker.model.NetWorth
import app.financetracker.model.Snapshot
import app.financetracker.repository.InMemoryFinanceRepository
import app.financetracker.repository.SeedData
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.server.ResponseStatusException
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FinanceServiceTest {
    private val food = Category("food", EntryType.EXPENSE, "Food", listOf("Groceries", "Restaurants"), false)
    private val seed = FinanceData(
        categories = listOf(food),
        entries = listOf(
            Entry("e1", "2026-01-05", EntryType.EXPENSE, "Food", "Groceries", "Market", 80.0),
            Entry("e2", "2026-02-07", EntryType.EXPENSE, "Food", "Restaurants", "Tacos", 30.0),
        ),
        netWorth = NetWorth(listOf(Account("chk", "Checking", AccountGroup.CASH)), listOf(Snapshot("2026-01-31", mapOf("chk" to 1000.0)))),
    )
    private val svc = FinanceService(InMemoryFinanceRepository { seed }, SeedData(seed))
    private val u = "test"

    @Test
    fun `renaming a category moves its entries`() {
        svc.patchCategory(u, "food", CategoryPatch(name = "Food & drink"))
        assertTrue(svc.entries(u, null, null).all { it.category == "Food & drink" })
    }

    @Test
    fun `renaming a subcategory moves its entries`() {
        svc.renameSubcategory(u, "food", "Groceries", "Grocery store")
        assertEquals("Grocery store", svc.entries(u, null, null).first { it.id == "e1" }.subcategory)
        assertEquals(listOf("Grocery store", "Restaurants"), svc.categories(u).single().subcategories)
    }

    @Test
    fun `categories and subcategories in use can't be removed`() {
        assertThrows<ResponseStatusException> { svc.deleteCategory(u, "food") }
        assertThrows<ResponseStatusException> { svc.removeSubcategory(u, "food", "Groceries") }
        svc.deleteEntry(u, "e1")
        svc.removeSubcategory(u, "food", "Groceries")
    }

    @Test
    fun `saving an entry creates its category and subcategory`() {
        svc.saveEntry(u, Entry("", "2026-03-01", EntryType.EXPENSE, "Pets", "Vet", "Checkup", 120.0))
        svc.saveEntry(u, Entry("", "2026-03-02", EntryType.EXPENSE, "Food", "Snacks", "Chips", 4.0))
        val cats = svc.categories(u).associateBy { it.name }
        assertEquals(listOf("Vet"), cats.getValue("Pets").subcategories)
        assertEquals(false, cats.getValue("Pets").essential)
        assertTrue("Snacks" in cats.getValue("Food").subcategories)
    }

    @Test
    fun `entries filter by year and month`() {
        assertEquals(listOf("e2"), svc.entries(u, 2026, 2).map { it.id })
        assertEquals(2, svc.entries(u, 2026, null).size)
        assertEquals(0, svc.entries(u, 2025, null).size)
    }

    @Test
    fun `import can replace the months it covers`() {
        val n = svc.importEntries(u, EntryImport(listOf(Entry("x", "2026-01-10", EntryType.EXPENSE, "Food", "Groceries", "Bulk", 200.0)), replaceMonths = true))
        assertEquals(1, n)
        val jan = svc.entries(u, 2026, 1)
        assertEquals(listOf(200.0), jan.map { it.amount })
        assertEquals(1, svc.entries(u, 2026, 2).size)
    }

    @Test
    fun `snapshots only accept known accounts and deleting an account clears its balances`() {
        assertThrows<ResponseStatusException> { svc.saveSnapshot(u, Snapshot("2026-02-28", mapOf("nope" to 1.0))) }
        svc.deleteAccount(u, "chk")
        assertEquals(emptyMap(), svc.netWorth(u).snapshots.single().values)
    }

    @Test
    fun `net worth import matches accounts by name`() {
        svc.importNetWorth(u, listOf(AccountImport("checking", AccountGroup.CASH, mapOf("2026-02-28" to 1200.0)), AccountImport("Roth IRA", AccountGroup.INVESTMENTS, mapOf("2026-02-28" to 5000.0))))
        val nw = svc.netWorth(u)
        assertEquals(2, nw.accounts.size)
        val feb = nw.snapshots.single { it.date == "2026-02-28" }
        assertEquals(1200.0, feb.values["chk"])
        assertEquals(6200.0, feb.values.values.sum())
    }

    @Test
    fun `month totals split essentials from discretionary`() {
        svc.saveCategory(u, Category("rent", EntryType.EXPENSE, "Rent/Mortgage", listOf("Rent"), true))
        svc.saveEntry(u, Entry("", "2026-01-01", EntryType.EXPENSE, "Rent/Mortgage", "Rent", "Jan", 1000.0))
        svc.saveEntry(u, Entry("", "2026-01-15", EntryType.INCOME, "Wages", "Paycheck", "Pay", 2000.0))
        val jan = svc.monthTotals(u, 2026)[0]
        assertEquals(1080.0, jan.expense)
        assertEquals(1000.0, jan.essential)
        assertEquals(80.0, jan.discretionary)
        assertEquals(920.0, jan.net)
        assertEquals(0.46, jan.savingsRate!!, 1e-9)
    }

    @Test
    fun `impossible dates are rejected`() {
        assertThrows<ResponseStatusException> { svc.saveEntry(u, Entry("", "2026-13-01", EntryType.EXPENSE, "Food", "Groceries", "x", 1.0)) }
        assertThrows<ResponseStatusException> { svc.saveEntry(u, Entry("", "2026-02-30", EntryType.EXPENSE, "Food", "Groceries", "x", 1.0)) }
    }

    @Test
    fun `net worth import with a bad date creates nothing`() {
        assertThrows<ResponseStatusException> { svc.importNetWorth(u, listOf(AccountImport("Brokerage", AccountGroup.INVESTMENTS, mapOf("2026-02-31" to 1.0)))) }
        assertEquals(1, svc.netWorth(u).accounts.size)
    }

    @Test
    fun `reset goes back to the seed`() {
        svc.deleteEntry(u, "e1")
        svc.reset(u)
        assertEquals(2, svc.entries(u, null, null).size)
    }

    @Test
    fun `users don't see each other's data`() {
        svc.deleteEntry(u, "e1")
        assertEquals(2, svc.entries("someone-else", null, null).size)
    }
}
