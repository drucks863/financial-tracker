package app.financetracker.repository

import app.financetracker.model.Account
import app.financetracker.model.Category
import app.financetracker.model.Entry
import app.financetracker.model.FinanceData
import app.financetracker.model.Plan
import app.financetracker.model.Snapshot
import app.financetracker.model.Subscription
import java.util.concurrent.ConcurrentHashMap

/**
 * Mock storage until DynamoDB: everything lives in memory and is lost on restart. Each user
 * starts from [seedData] (the sample data, or seed.local.json when running locally).
 */
class InMemoryFinanceRepository(private val seedData: () -> FinanceData) : FinanceRepository {

    private class UserStore(data: FinanceData) {
        var isSample = data.sample
        val categories = LinkedHashMap(data.categories.associateBy { it.id })
        val entries = LinkedHashMap(data.entries.associateBy { it.id })
        val accounts = LinkedHashMap(data.netWorth.accounts.associateBy { it.id })
        val snapshots = sortedMapOf<String, Snapshot>().apply { data.netWorth.snapshots.forEach { snapshot -> put(snapshot.date, snapshot) } }
        val subscriptions = LinkedHashMap(data.subscriptions.associateBy { it.id })
        var plan: Plan? = data.plan
    }

    private val storesByUserId = ConcurrentHashMap<String, UserStore>()

    private fun <T> withStore(userId: String, action: UserStore.() -> T): T {
        val store = storesByUserId.computeIfAbsent(userId) { UserStore(seedData()) }
        return synchronized(store) { store.action() }
    }

    override fun categories(userId: String) = withStore(userId) { categories.values.toList() }
    override fun saveCategory(userId: String, category: Category) = withStore(userId) { categories[category.id] = category }
    override fun deleteCategory(userId: String, categoryId: String) = withStore(userId) { categories.remove(categoryId); Unit }

    override fun entries(userId: String, from: String?, to: String?) = withStore(userId) {
        entries.values
            .filter { entry -> (from == null || entry.date >= from) && (to == null || entry.date <= to) }
            .sortedBy { it.date }
    }
    override fun saveEntries(userId: String, entries: Collection<Entry>) = withStore(userId) { entries.forEach { entry -> this.entries[entry.id] = entry } }
    override fun deleteEntries(userId: String, entryIds: Collection<String>) = withStore(userId) { entryIds.forEach { entryId -> entries.remove(entryId) } }

    override fun accounts(userId: String) = withStore(userId) { accounts.values.toList() }
    override fun saveAccount(userId: String, account: Account) = withStore(userId) { accounts[account.id] = account }
    override fun deleteAccount(userId: String, accountId: String) = withStore(userId) { accounts.remove(accountId); Unit }

    override fun snapshots(userId: String) = withStore(userId) { snapshots.values.toList() }
    override fun saveSnapshot(userId: String, snapshot: Snapshot) = withStore(userId) { snapshots[snapshot.date] = snapshot }
    override fun deleteSnapshot(userId: String, date: String) = withStore(userId) { snapshots.remove(date); Unit }

    override fun subscriptions(userId: String) = withStore(userId) { subscriptions.values.toList() }
    override fun saveSubscription(userId: String, subscription: Subscription) = withStore(userId) { subscriptions[subscription.id] = subscription }
    override fun deleteSubscription(userId: String, subscriptionId: String) = withStore(userId) { subscriptions.remove(subscriptionId); Unit }

    override fun plan(userId: String) = withStore(userId) { plan }
    override fun savePlan(userId: String, plan: Plan) = withStore(userId) { this.plan = plan }

    override fun isSample(userId: String) = withStore(userId) { isSample }

    override fun replaceAll(userId: String, data: FinanceData) {
        storesByUserId[userId] = UserStore(data)
    }
}
