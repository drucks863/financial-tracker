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
    private val seedData = FinanceData(
        categories = listOf(food),
        entries = listOf(
            Entry("e1", "2026-01-05", EntryType.EXPENSE, "Food", "Groceries", "Market", 80.0),
            Entry("e2", "2026-02-07", EntryType.EXPENSE, "Food", "Restaurants", "Tacos", 30.0),
        ),
        netWorth = NetWorth(listOf(Account("chk", "Checking", AccountGroup.CASH)), listOf(Snapshot("2026-01-31", mapOf("chk" to 1000.0)))),
    )
    private val financeService = FinanceService(InMemoryFinanceRepository { seedData }, SeedData(seedData))
    private val userId = "test"

    @Test
    fun `renaming a category moves its entries`() {
        financeService.patchCategory(userId, "food", CategoryPatch(name = "Food & drink"))
        assertTrue(financeService.entries(userId, null, null).all { it.category == "Food & drink" })
    }

    @Test
    fun `renaming a subcategory moves its entries`() {
        financeService.renameSubcategory(userId, "food", "Groceries", "Grocery store")
        assertEquals("Grocery store", financeService.entries(userId, null, null).first { it.id == "e1" }.subcategory)
        assertEquals(listOf("Grocery store", "Restaurants"), financeService.categories(userId).single().subcategories)
    }

    @Test
    fun `categories and subcategories in use can't be removed`() {
        assertThrows<ResponseStatusException> { financeService.deleteCategory(userId, "food") }
        assertThrows<ResponseStatusException> { financeService.removeSubcategory(userId, "food", "Groceries") }
        financeService.deleteEntry(userId, "e1")
        financeService.removeSubcategory(userId, "food", "Groceries")
    }

    @Test
    fun `saving an entry creates its category and subcategory`() {
        financeService.saveEntry(userId, Entry("", "2026-03-01", EntryType.EXPENSE, "Pets", "Vet", "Checkup", 120.0))
        financeService.saveEntry(userId, Entry("", "2026-03-02", EntryType.EXPENSE, "Food", "Snacks", "Chips", 4.0))
        val categoriesByName = financeService.categories(userId).associateBy { it.name }
        assertEquals(listOf("Vet"), categoriesByName.getValue("Pets").subcategories)
        assertEquals(false, categoriesByName.getValue("Pets").essential)
        assertTrue("Snacks" in categoriesByName.getValue("Food").subcategories)
    }

    @Test
    fun `entries filter by year and month`() {
        assertEquals(listOf("e2"), financeService.entries(userId, 2026, 2).map { it.id })
        assertEquals(2, financeService.entries(userId, 2026, null).size)
        assertEquals(0, financeService.entries(userId, 2025, null).size)
    }

    @Test
    fun `import can replace the months it covers`() {
        val importedCount = financeService.importEntries(userId, EntryImport(listOf(Entry("x", "2026-01-10", EntryType.EXPENSE, "Food", "Groceries", "Bulk", 200.0)), replaceMonths = true))
        assertEquals(1, importedCount)
        val january = financeService.entries(userId, 2026, 1)
        assertEquals(listOf(200.0), january.map { it.amount })
        assertEquals(1, financeService.entries(userId, 2026, 2).size)
    }

    @Test
    fun `snapshots only accept known accounts and deleting an account clears its balances`() {
        assertThrows<ResponseStatusException> { financeService.saveSnapshot(userId, Snapshot("2026-02-28", mapOf("nope" to 1.0))) }
        financeService.deleteAccount(userId, "chk")
        assertEquals(emptyMap(), financeService.netWorth(userId).snapshots.single().values)
    }

    @Test
    fun `net worth import matches accounts by name`() {
        financeService.importNetWorth(userId, listOf(AccountImport("checking", AccountGroup.CASH, mapOf("2026-02-28" to 1200.0)), AccountImport("Roth IRA", AccountGroup.INVESTMENTS, mapOf("2026-02-28" to 5000.0))))
        val netWorth = financeService.netWorth(userId)
        assertEquals(2, netWorth.accounts.size)
        val february = netWorth.snapshots.single { it.date == "2026-02-28" }
        assertEquals(1200.0, february.values["chk"])
        assertEquals(6200.0, february.values.values.sum())
    }

    @Test
    fun `month totals split essentials from discretionary`() {
        financeService.saveCategory(userId, Category("rent", EntryType.EXPENSE, "Rent/Mortgage", listOf("Rent"), true))
        financeService.saveEntry(userId, Entry("", "2026-01-01", EntryType.EXPENSE, "Rent/Mortgage", "Rent", "Jan", 1000.0))
        financeService.saveEntry(userId, Entry("", "2026-01-15", EntryType.INCOME, "Wages", "Paycheck", "Pay", 2000.0))
        val january = financeService.monthTotals(userId, 2026)[0]
        assertEquals(1080.0, january.expense)
        assertEquals(1000.0, january.essential)
        assertEquals(80.0, january.discretionary)
        assertEquals(920.0, january.net)
        assertEquals(0.46, january.savingsRate!!, 1e-9)
    }

    @Test
    fun `impossible dates are rejected`() {
        assertThrows<ResponseStatusException> { financeService.saveEntry(userId, Entry("", "2026-13-01", EntryType.EXPENSE, "Food", "Groceries", "x", 1.0)) }
        assertThrows<ResponseStatusException> { financeService.saveEntry(userId, Entry("", "2026-02-30", EntryType.EXPENSE, "Food", "Groceries", "x", 1.0)) }
    }

    @Test
    fun `net worth import with a bad date creates nothing`() {
        assertThrows<ResponseStatusException> { financeService.importNetWorth(userId, listOf(AccountImport("Brokerage", AccountGroup.INVESTMENTS, mapOf("2026-02-31" to 1.0)))) }
        assertEquals(1, financeService.netWorth(userId).accounts.size)
    }

    @Test
    fun `reset goes back to the seed`() {
        financeService.deleteEntry(userId, "e1")
        financeService.reset(userId)
        assertEquals(2, financeService.entries(userId, null, null).size)
    }

    @Test
    fun `users don't see each other's data`() {
        financeService.deleteEntry(userId, "e1")
        assertEquals(2, financeService.entries("someone-else", null, null).size)
    }
}
