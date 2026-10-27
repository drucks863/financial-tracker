package app.financetracker.repository

import app.financetracker.model.Account
import app.financetracker.model.AccountGroup
import app.financetracker.model.Category
import app.financetracker.model.Entry
import app.financetracker.model.EntryType
import app.financetracker.model.FinanceData
import app.financetracker.model.NetWorth
import app.financetracker.model.Plan
import app.financetracker.model.Snapshot
import app.financetracker.model.Subscription
import com.amazonaws.services.dynamodbv2.local.embedded.DynamoDBEmbedded
import com.amazonaws.services.dynamodbv2.local.shared.access.AmazonDynamoDBLocal
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Runs against DynamoDB Local in-process, so it needs no AWS account and no network. */
class DynamoDbFinanceRepositoryTest {
    private val food = Category("food", EntryType.EXPENSE, "Food", listOf("Groceries"), false)
    private val seedData = FinanceData(
        sample = true,
        categories = listOf(food),
        entries = listOf(
            Entry("e1", "2026-01-05", EntryType.EXPENSE, "Food", "Groceries", "Market", 80.0),
            Entry("e2", "2026-02-07", EntryType.EXPENSE, "Food", "Groceries", "Market", 30.0),
        ),
        netWorth = NetWorth(listOf(Account("chk", "Checking", AccountGroup.CASH)), listOf(Snapshot("2026-01-31", mapOf("chk" to 1000.0)))),
        subscriptions = listOf(Subscription("s1", "Music", 11.99, "Discretionary", "Monthly", "5th", "Card")),
        plan = Plan(name = "Sample", salary = 90_000.0),
    )
    private val repository = DynamoDbFinanceRepository(dynamoDbLocal.dynamoDbClient(), TABLE_NAME, jsonMapper) { seedData }

    /** Every test gets its own user, so tests can't see each other's data. */
    private val userId = UUID.randomUUID().toString()

    @Test
    fun `a new user starts from the seed`() {
        assertTrue(repository.isSample(userId))
        assertEquals(listOf(food), repository.categories(userId))
        assertEquals(listOf("e1", "e2"), repository.entries(userId).map { it.id })
        assertEquals(seedData.netWorth.accounts, repository.accounts(userId))
        assertEquals(seedData.netWorth.snapshots, repository.snapshots(userId))
        assertEquals(seedData.subscriptions, repository.subscriptions(userId))
        assertEquals(seedData.plan, repository.plan(userId))
    }

    @Test
    fun `filters entries by date, oldest first`() {
        repository.saveEntries(userId, listOf(Entry("e0", "2025-12-31", EntryType.INCOME, "Wages", "Paycheck", "", 100.0)))
        assertEquals(listOf("e0", "e1", "e2"), repository.entries(userId).map { it.id })
        assertEquals(listOf("e1"), repository.entries(userId, "2026-01-01", "2026-01-31").map { it.id })
        assertEquals(listOf("e0"), repository.entries(userId, to = "2025-12-31").map { it.id })
    }

    @Test
    fun `saves and deletes each kind of item`() {
        repository.saveCategory(userId, food.copy(name = "Groceries & food"))
        assertEquals("Groceries & food", repository.categories(userId).single().name)
        repository.deleteCategory(userId, "food")
        assertTrue(repository.categories(userId).isEmpty())

        repository.deleteEntries(userId, listOf("e1"))
        assertEquals(listOf("e2"), repository.entries(userId).map { it.id })

        repository.saveSnapshot(userId, Snapshot("2025-12-31", mapOf("chk" to 900.0)))
        assertEquals(listOf("2025-12-31", "2026-01-31"), repository.snapshots(userId).map { it.date })
        repository.deleteSnapshot(userId, "2026-01-31")
        repository.deleteAccount(userId, "chk")
        assertEquals(listOf("2025-12-31"), repository.snapshots(userId).map { it.date })
        assertTrue(repository.accounts(userId).isEmpty())

        repository.saveSubscription(userId, seedData.subscriptions.single().copy(price = 12.99))
        assertEquals(12.99, repository.subscriptions(userId).single().price)
        repository.deleteSubscription(userId, "s1")
        assertTrue(repository.subscriptions(userId).isEmpty())

        repository.savePlan(userId, Plan(salary = 1.0))
        assertEquals(1.0, repository.plan(userId)?.salary)
    }

    @Test
    fun `replacing everything removes what the new data doesn't have`() {
        val manyEntries = (1..60).map { number -> Entry("n$number", "2026-03-%02d".format(number % 28 + 1), EntryType.EXPENSE, "Food", "Groceries", "", number.toDouble()) }
        repository.replaceAll(userId, FinanceData(sample = false, categories = listOf(food), entries = manyEntries))
        assertFalse(repository.isSample(userId))
        assertEquals(manyEntries.map { it.id }.toSet(), repository.entries(userId).map { it.id }.toSet())
        assertTrue(repository.accounts(userId).isEmpty())
        assertTrue(repository.snapshots(userId).isEmpty())
        assertTrue(repository.subscriptions(userId).isEmpty())
        assertEquals(Plan(), repository.plan(userId))
    }

    @Test
    fun `data survives a new repository instance, as it would a restart`() {
        repository.saveEntries(userId, listOf(Entry("kept", "2026-04-01", EntryType.EXPENSE, "Food", "Groceries", "", 5.0)))
        val afterRestart = DynamoDbFinanceRepository(dynamoDbLocal.dynamoDbClient(), TABLE_NAME, jsonMapper) { FinanceData() }
        assertTrue("kept" in afterRestart.entries(userId).map { it.id })
        assertNull(afterRestart.entries(userId).find { it.id == "missing" })
    }

    companion object {
        private const val TABLE_NAME = "financial-tracker-test"
        private val jsonMapper = JsonMapper.builder().addModule(kotlinModule()).build()
        private lateinit var dynamoDbLocal: AmazonDynamoDBLocal

        @JvmStatic
        @BeforeAll
        fun startDynamoDbLocal() {
            dynamoDbLocal = DynamoDBEmbedded.create(true)
            createTableIfMissing(dynamoDbLocal.dynamoDbClient(), TABLE_NAME)
        }

        @JvmStatic
        @AfterAll
        fun stopDynamoDbLocal() {
            dynamoDbLocal.shutdownNow()
        }
    }
}
