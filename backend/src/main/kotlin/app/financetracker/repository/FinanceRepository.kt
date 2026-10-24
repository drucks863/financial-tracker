package app.financetracker.repository

import app.financetracker.model.Account
import app.financetracker.model.Category
import app.financetracker.model.Entry
import app.financetracker.model.FinanceData
import app.financetracker.model.Plan
import app.financetracker.model.Snapshot
import app.financetracker.model.Subscription

/**
 * Storage for one person's data, keyed by user id. Plain reads and writes only: rules such as
 * cascading a category rename live in FinanceService, so a DynamoDB implementation only has to
 * store items. The methods map onto a single-table design (PK = user, SK = kind#id).
 */
interface FinanceRepository {
    fun categories(userId: String): List<Category>
    fun saveCategory(userId: String, category: Category)
    fun deleteCategory(userId: String, id: String)

    /** Entries with `from <= date <= to` (YYYY-MM-DD, either bound optional), oldest first. */
    fun entries(userId: String, from: String? = null, to: String? = null): List<Entry>
    fun saveEntries(userId: String, entries: Collection<Entry>)
    fun deleteEntries(userId: String, ids: Collection<String>)

    fun accounts(userId: String): List<Account>
    fun saveAccount(userId: String, account: Account)
    fun deleteAccount(userId: String, id: String)

    /** Oldest first. */
    fun snapshots(userId: String): List<Snapshot>
    fun saveSnapshot(userId: String, snapshot: Snapshot)
    fun deleteSnapshot(userId: String, date: String)

    fun subscriptions(userId: String): List<Subscription>
    fun saveSubscription(userId: String, subscription: Subscription)
    fun deleteSubscription(userId: String, id: String)

    fun plan(userId: String): Plan?
    fun savePlan(userId: String, plan: Plan)

    /** Whether the stored data is generated sample data. */
    fun isSample(userId: String): Boolean

    /** Replace everything the user has (import of a full backup, reset). */
    fun replaceAll(userId: String, data: FinanceData)
}
