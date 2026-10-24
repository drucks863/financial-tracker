package app.financetracker.service

import app.financetracker.model.Account
import app.financetracker.model.AccountImport
import app.financetracker.model.Category
import app.financetracker.model.CategoryPatch
import app.financetracker.model.Entry
import app.financetracker.model.EntryImport
import app.financetracker.model.EntryType
import app.financetracker.model.FinanceData
import app.financetracker.model.NetWorth
import app.financetracker.model.Plan
import app.financetracker.model.Snapshot
import app.financetracker.model.Subscription
import app.financetracker.model.month
import app.financetracker.repository.FinanceRepository
import app.financetracker.repository.SeedData
import app.financetracker.repository.normalize
import java.time.LocalDate
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

fun newId(prefix: String) = prefix + UUID.randomUUID().toString().replace("-", "").take(12)

private fun conflict(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
private fun notFound(message: String): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND, message)
private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

private val DATE_PATTERN = Regex("""^\d{4}-\d{2}-\d{2}$""")

/** YYYY-MM-DD and a real calendar date (no month 13 or February 30). */
private fun isValidDate(date: String) = DATE_PATTERN.matches(date) && runCatching { LocalDate.parse(date) }.isSuccess

/**
 * The rules the frontend store applies (cascading renames, no deleting categories in use,
 * entries create their category), kept server-side so every client gets them.
 */
@Service
class FinanceService(private val financeRepository: FinanceRepository, private val seedData: SeedData) {

    /* ---------- whole document ---------- */

    fun data(userId: String) = FinanceData(
        sample = financeRepository.isSample(userId),
        categories = financeRepository.categories(userId),
        entries = financeRepository.entries(userId),
        netWorth = NetWorth(financeRepository.accounts(userId), financeRepository.snapshots(userId)),
        subscriptions = financeRepository.subscriptions(userId),
        plan = plan(userId),
    )

    fun replaceAll(userId: String, data: FinanceData): FinanceData {
        if (data.version != FinanceData.VERSION) badRequest("Data version ${data.version} isn't supported (expected ${FinanceData.VERSION})")
        data.entries.forEach(::validate)
        financeRepository.replaceAll(userId, normalize(data))
        return data(userId)
    }

    fun reset(userId: String): FinanceData {
        financeRepository.replaceAll(userId, seedData.data)
        return data(userId)
    }

    /* ---------- categories ---------- */

    fun categories(userId: String) = financeRepository.categories(userId)

    private fun category(userId: String, categoryId: String) =
        financeRepository.categories(userId).find { it.id == categoryId } ?: notFound("No category $categoryId")

    private fun findCategory(userId: String, type: EntryType, name: String) =
        financeRepository.categories(userId).find { it.type == type && it.name == name }

    /** Create or replace a category by id. A new one can't reuse a name; renames go through [patchCategory]. */
    fun saveCategory(userId: String, category: Category): Category {
        val name = category.name.trim().ifEmpty { badRequest("Category needs a name") }
        val existing = financeRepository.categories(userId).find { it.id == category.id }
        if (existing != null && existing.type != category.type) badRequest("A category's type can't change")
        if (existing != null && existing.name != name) badRequest("Rename ${existing.name} with PATCH so entries follow")
        if (existing == null && findCategory(userId, category.type, name) != null) conflict("$name already exists")
        existing?.subcategories
            ?.filter { subcategory -> subcategory !in category.subcategories }
            ?.forEach { removedSubcategory -> requireUnused(userId, existing, removedSubcategory) }
        val savedCategory = category.copy(
            name = name,
            subcategories = category.subcategories.map(String::trim).filter(String::isNotEmpty).distinct().ifEmpty { listOf("Other") },
            essential = if (category.type == EntryType.EXPENSE) category.essential ?: false else null,
        )
        financeRepository.saveCategory(userId, savedCategory)
        return savedCategory
    }

    fun patchCategory(userId: String, categoryId: String, patch: CategoryPatch): Category {
        var category = category(userId, categoryId)
        patch.name?.trim()?.takeIf { it.isNotEmpty() && it != category.name }?.let { newName ->
            if (findCategory(userId, category.type, newName) != null) conflict("$newName already exists")
            val oldName = category.name
            val movedEntries = financeRepository.entries(userId)
                .filter { entry -> entry.type == category.type && entry.category == oldName }
                .map { entry -> entry.copy(category = newName) }
            financeRepository.saveEntries(userId, movedEntries)
            category = category.copy(name = newName)
        }
        if (patch.essential != null && category.type == EntryType.EXPENSE) category = category.copy(essential = patch.essential)
        financeRepository.saveCategory(userId, category)
        return category
    }

    fun deleteCategory(userId: String, categoryId: String) {
        val category = category(userId, categoryId)
        val entryCount = entriesUsing(userId, category)
        if (entryCount > 0) conflict("${category.name} still has $entryCount entries")
        financeRepository.deleteCategory(userId, categoryId)
    }

    fun addSubcategory(userId: String, categoryId: String, name: String): Category {
        val category = category(userId, categoryId)
        val subcategory = name.trim().ifEmpty { badRequest("Subcategory needs a name") }
        if (subcategory in category.subcategories) conflict("$subcategory already exists")
        return category.copy(subcategories = category.subcategories + subcategory)
            .also { financeRepository.saveCategory(userId, it) }
    }

    fun renameSubcategory(userId: String, categoryId: String, oldName: String, newName: String): Category {
        val category = category(userId, categoryId)
        val trimmedName = newName.trim().ifEmpty { badRequest("Subcategory needs a name") }
        if (oldName !in category.subcategories) notFound("No subcategory $oldName")
        if (trimmedName in category.subcategories) conflict("$trimmedName already exists")
        financeRepository.saveEntries(userId, entriesOf(userId, category, oldName).map { entry -> entry.copy(subcategory = trimmedName) })
        return category.copy(subcategories = category.subcategories.map { if (it == oldName) trimmedName else it })
            .also { financeRepository.saveCategory(userId, it) }
    }

    fun removeSubcategory(userId: String, categoryId: String, subcategory: String): Category {
        val category = category(userId, categoryId)
        requireUnused(userId, category, subcategory)
        return category.copy(subcategories = category.subcategories - subcategory)
            .also { financeRepository.saveCategory(userId, it) }
    }

    private fun entriesOf(userId: String, category: Category, subcategory: String? = null) =
        financeRepository.entries(userId).filter { entry ->
            entry.type == category.type && entry.category == category.name && (subcategory == null || entry.subcategory == subcategory)
        }

    fun entriesUsing(userId: String, category: Category, subcategory: String? = null) = entriesOf(userId, category, subcategory).size

    private fun requireUnused(userId: String, category: Category, subcategory: String) {
        val entryCount = entriesUsing(userId, category, subcategory)
        if (entryCount > 0) conflict("$subcategory still has $entryCount entries")
    }

    /** Makes sure a category/subcategory pair exists (new entries and imports create them). */
    private fun ensureCategory(userId: String, type: EntryType, categoryName: String, subcategory: String) {
        val category = findCategory(userId, type, categoryName)
        if (category == null) {
            val essential = if (type == EntryType.EXPENSE) false else null
            financeRepository.saveCategory(userId, Category(newId("c"), type, categoryName, listOf(subcategory.ifBlank { "Other" }), essential))
        } else if (subcategory.isNotBlank() && subcategory !in category.subcategories) {
            financeRepository.saveCategory(userId, category.copy(subcategories = category.subcategories + subcategory))
        }
    }

    /* ---------- entries ---------- */

    /** Entries for a year, or one month of it (1–12). */
    fun entries(userId: String, year: Int?, month: Int?): List<Entry> = when {
        year == null -> financeRepository.entries(userId)
        month == null -> financeRepository.entries(userId, "$year-01-01", "$year-12-31")
        else -> "%d-%02d".format(year, month).let { yearMonth -> financeRepository.entries(userId, "$yearMonth-01", "$yearMonth-31") }
    }

    private fun validate(entry: Entry) {
        if (!isValidDate(entry.date)) badRequest("Date must be YYYY-MM-DD, got ${entry.date}")
        if (!entry.amount.isFinite()) badRequest("Amount must be a number")
        if (entry.category.isBlank()) badRequest("Entry needs a category")
    }

    private fun trimmed(entry: Entry) =
        entry.copy(category = entry.category.trim(), subcategory = entry.subcategory.trim(), description = entry.description.trim())

    /** Create (blank id) or replace an entry. */
    fun saveEntry(userId: String, entry: Entry): Entry {
        val savedEntry = trimmed(entry).copy(id = entry.id.ifBlank { newId("e") })
        validate(savedEntry)
        ensureCategory(userId, savedEntry.type, savedEntry.category, savedEntry.subcategory)
        financeRepository.saveEntries(userId, listOf(savedEntry))
        return savedEntry
    }

    fun deleteEntry(userId: String, entryId: String) = financeRepository.deleteEntries(userId, listOf(entryId))

    fun importEntries(userId: String, entryImport: EntryImport): Int {
        entryImport.entries.forEach(::validate)
        if (entryImport.replaceMonths) {
            val importedMonths = entryImport.entries.map { it.month }.toSet()
            val replacedEntryIds = financeRepository.entries(userId).filter { it.month in importedMonths }.map { it.id }
            financeRepository.deleteEntries(userId, replacedEntryIds)
        }
        val newEntries = entryImport.entries.map { entry -> trimmed(entry).copy(id = newId("e")) }
        newEntries.forEach { entry -> ensureCategory(userId, entry.type, entry.category, entry.subcategory) }
        financeRepository.saveEntries(userId, newEntries)
        return newEntries.size
    }

    /* ---------- net worth ---------- */

    fun netWorth(userId: String) = NetWorth(financeRepository.accounts(userId), financeRepository.snapshots(userId))

    fun saveAccount(userId: String, account: Account): Account {
        val savedAccount = account.copy(
            id = account.id.ifBlank { newId("a") },
            name = account.name.trim().ifEmpty { badRequest("Account needs a name") },
        )
        financeRepository.saveAccount(userId, savedAccount)
        return savedAccount
    }

    /** Removes the account and its balances from every snapshot. */
    fun deleteAccount(userId: String, accountId: String) {
        financeRepository.snapshots(userId)
            .filter { snapshot -> accountId in snapshot.values }
            .forEach { snapshot -> financeRepository.saveSnapshot(userId, snapshot.copy(values = snapshot.values - accountId)) }
        financeRepository.deleteAccount(userId, accountId)
    }

    fun saveSnapshot(userId: String, snapshot: Snapshot): Snapshot {
        if (!isValidDate(snapshot.date)) badRequest("Date must be YYYY-MM-DD, got ${snapshot.date}")
        val knownAccountIds = financeRepository.accounts(userId).map { it.id }.toSet()
        val unknownAccountIds = snapshot.values.keys - knownAccountIds
        if (unknownAccountIds.isNotEmpty()) badRequest("Unknown accounts: ${unknownAccountIds.joinToString()}")
        financeRepository.saveSnapshot(userId, snapshot)
        return snapshot
    }

    fun deleteSnapshot(userId: String, date: String) = financeRepository.deleteSnapshot(userId, date)

    /** Accounts matched by name (case-insensitive), created when new, and their month-end balances merged in. */
    fun importNetWorth(userId: String, accountImports: List<AccountImport>): NetWorth {
        // check every date first so a bad one doesn't leave half-created accounts behind
        accountImports.flatMap { it.values.keys }.find { !isValidDate(it) }?.let { badRequest("Date must be YYYY-MM-DD, got $it") }
        val accounts = financeRepository.accounts(userId).toMutableList()
        val snapshotsByDate = financeRepository.snapshots(userId).associateBy { it.date }.toMutableMap()
        for (accountImport in accountImports) {
            val account = accounts.find { it.name.equals(accountImport.name.trim(), ignoreCase = true) }
                ?: saveAccount(userId, Account("", accountImport.name, accountImport.group)).also { accounts += it }
            for ((date, balance) in accountImport.values) {
                val snapshot = snapshotsByDate[date] ?: Snapshot(date, emptyMap())
                snapshotsByDate[date] = snapshot.copy(values = snapshot.values + (account.id to balance))
            }
        }
        snapshotsByDate.values.forEach { snapshot -> saveSnapshot(userId, snapshot) }
        return netWorth(userId)
    }

    /* ---------- subscriptions ---------- */

    fun subscriptions(userId: String) = financeRepository.subscriptions(userId)

    fun saveSubscription(userId: String, subscription: Subscription): Subscription {
        val savedSubscription = subscription.copy(
            id = subscription.id.ifBlank { newId("s") },
            service = subscription.service.trim().ifEmpty { badRequest("Subscription needs a service name") },
        )
        financeRepository.saveSubscription(userId, savedSubscription)
        return savedSubscription
    }

    fun deleteSubscription(userId: String, subscriptionId: String) = financeRepository.deleteSubscription(userId, subscriptionId)

    /* ---------- plan ---------- */

    fun plan(userId: String): Plan = financeRepository.plan(userId) ?: Plan()

    fun savePlan(userId: String, plan: Plan): Plan {
        val rates = listOf(plan.taxRate, plan.k401, plan.match)
        if (rates.any { it !in 0.0..1.0 }) badRequest("Rates are shares from 0 to 1")
        financeRepository.savePlan(userId, plan)
        return plan
    }

    /* ---------- summaries ---------- */

    fun monthTotals(userId: String, year: Int) =
        Summaries.monthTotals(year, entries(userId, year, null), financeRepository.categories(userId))

    fun netWorthSeries(userId: String) =
        Summaries.netWorthSeries(financeRepository.accounts(userId), financeRepository.snapshots(userId), plan(userId).loans)

    fun planSummary(userId: String) = PlanCalculator.summarize(plan(userId))
}
