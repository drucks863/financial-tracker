package app.financetracker.repo

import app.financetracker.domain.Account
import app.financetracker.domain.Category
import app.financetracker.domain.Entry
import app.financetracker.domain.FinanceData
import app.financetracker.domain.Plan
import app.financetracker.domain.Snapshot
import app.financetracker.domain.Subscription
import java.util.concurrent.ConcurrentHashMap

/**
 * Mock storage until DynamoDB: everything lives in memory and is lost on restart. Each user
 * starts from [seed] (the sample data, or seed.local.json when running locally).
 */
class InMemoryFinanceRepository(private val seed: () -> FinanceData) : FinanceRepository {

    private class Store(data: FinanceData) {
        var sample = data.sample
        val categories = LinkedHashMap(data.categories.associateBy { it.id })
        val entries = LinkedHashMap(data.entries.associateBy { it.id })
        val accounts = LinkedHashMap(data.netWorth.accounts.associateBy { it.id })
        val snapshots = sortedMapOf<String, Snapshot>().apply { data.netWorth.snapshots.forEach { put(it.date, it) } }
        val subscriptions = LinkedHashMap(data.subscriptions.associateBy { it.id })
        var plan: Plan? = data.plan
    }

    private val users = ConcurrentHashMap<String, Store>()

    private fun <T> with(userId: String, f: Store.() -> T): T {
        val store = users.computeIfAbsent(userId) { Store(seed()) }
        return synchronized(store) { store.f() }
    }

    override fun categories(userId: String) = with(userId) { categories.values.toList() }
    override fun saveCategory(userId: String, category: Category) = with(userId) { categories[category.id] = category }
    override fun deleteCategory(userId: String, id: String) = with(userId) { categories.remove(id); Unit }

    override fun entries(userId: String, from: String?, to: String?) = with(userId) {
        entries.values
            .filter { (from == null || it.date >= from) && (to == null || it.date <= to) }
            .sortedBy { it.date }
    }
    override fun saveEntries(userId: String, entries: Collection<Entry>) = with(userId) { entries.forEach { this.entries[it.id] = it } }
    override fun deleteEntries(userId: String, ids: Collection<String>) = with(userId) { ids.forEach { entries.remove(it) } }

    override fun accounts(userId: String) = with(userId) { accounts.values.toList() }
    override fun saveAccount(userId: String, account: Account) = with(userId) { accounts[account.id] = account }
    override fun deleteAccount(userId: String, id: String) = with(userId) { accounts.remove(id); Unit }

    override fun snapshots(userId: String) = with(userId) { snapshots.values.toList() }
    override fun saveSnapshot(userId: String, snapshot: Snapshot) = with(userId) { snapshots[snapshot.date] = snapshot }
    override fun deleteSnapshot(userId: String, date: String) = with(userId) { snapshots.remove(date); Unit }

    override fun subscriptions(userId: String) = with(userId) { subscriptions.values.toList() }
    override fun saveSubscription(userId: String, subscription: Subscription) = with(userId) { subscriptions[subscription.id] = subscription }
    override fun deleteSubscription(userId: String, id: String) = with(userId) { subscriptions.remove(id); Unit }

    override fun plan(userId: String) = with(userId) { plan }
    override fun savePlan(userId: String, plan: Plan) = with(userId) { this.plan = plan }

    override fun isSample(userId: String) = with(userId) { sample }

    override fun replaceAll(userId: String, data: FinanceData) {
        users[userId] = Store(data)
    }
}
