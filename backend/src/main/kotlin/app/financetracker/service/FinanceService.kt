package app.financetracker.service

import app.financetracker.domain.Account
import app.financetracker.domain.AccountGroup
import app.financetracker.domain.Category
import app.financetracker.domain.Entry
import app.financetracker.domain.EntryType
import app.financetracker.domain.FinanceData
import app.financetracker.domain.NetWorth
import app.financetracker.domain.Plan
import app.financetracker.domain.Snapshot
import app.financetracker.domain.Subscription
import app.financetracker.domain.month
import app.financetracker.repo.FinanceRepository
import app.financetracker.repo.SeedData
import app.financetracker.repo.normalize
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

fun newId(prefix: String) = prefix + UUID.randomUUID().toString().replace("-", "").take(12)

private fun conflict(msg: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, msg)
private fun notFound(msg: String): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND, msg)
private fun bad(msg: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, msg)

private val DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")

/** Partial update of a category; null fields are left as they are. */
data class CategoryPatch(val name: String? = null, val essential: Boolean? = null)

/** Entries from a file import. With [replaceMonths], entries already in those months are removed first. */
data class EntryImport(val entries: List<Entry>, val replaceMonths: Boolean = false)

/**
 * The rules the frontend store applies (cascading renames, no deleting categories in use,
 * entries create their category), kept server-side so every client gets them.
 */
@Service
class FinanceService(private val repo: FinanceRepository, private val seed: SeedData) {

    /* ---------- whole document ---------- */

    fun data(u: String) = FinanceData(
        sample = repo.isSample(u),
        categories = repo.categories(u),
        entries = repo.entries(u),
        netWorth = NetWorth(repo.accounts(u), repo.snapshots(u)),
        subscriptions = repo.subscriptions(u),
        plan = plan(u),
    )

    fun replaceAll(u: String, data: FinanceData): FinanceData {
        if (data.version != FinanceData.VERSION) bad("Data version ${data.version} isn't supported (expected ${FinanceData.VERSION})")
        data.entries.forEach(::validate)
        repo.replaceAll(u, normalize(data))
        return data(u)
    }

    fun reset(u: String): FinanceData {
        repo.replaceAll(u, seed.data)
        return data(u)
    }

    /* ---------- categories ---------- */

    fun categories(u: String) = repo.categories(u)

    private fun category(u: String, id: String) = repo.categories(u).find { it.id == id } ?: notFound("No category $id")
    private fun findCategory(u: String, type: EntryType, name: String) = repo.categories(u).find { it.type == type && it.name == name }

    /** Create or replace a category by id. A new one can't reuse a name; renames go through [patchCategory]. */
    fun saveCategory(u: String, c: Category): Category {
        val name = c.name.trim().ifEmpty { bad("Category needs a name") }
        val existing = repo.categories(u).find { it.id == c.id }
        if (existing != null && existing.name != name) bad("Rename ${existing.name} with PATCH so entries follow")
        if (existing == null && findCategory(u, c.type, name) != null) conflict("$name already exists")
        existing?.subcategories?.filter { it !in c.subcategories }?.forEach { requireUnused(u, existing, it) }
        val saved = c.copy(
            name = name,
            subcategories = c.subcategories.map(String::trim).filter(String::isNotEmpty).distinct().ifEmpty { listOf("Other") },
            essential = if (c.type == EntryType.EXPENSE) c.essential ?: false else null,
        )
        repo.saveCategory(u, saved)
        return saved
    }

    fun patchCategory(u: String, id: String, patch: CategoryPatch): Category {
        var cat = category(u, id)
        patch.name?.trim()?.takeIf { it.isNotEmpty() && it != cat.name }?.let { newName ->
            if (findCategory(u, cat.type, newName) != null) conflict("$newName already exists")
            val old = cat.name
            repo.saveEntries(u, repo.entries(u).filter { it.type == cat.type && it.category == old }.map { it.copy(category = newName) })
            cat = cat.copy(name = newName)
        }
        if (patch.essential != null && cat.type == EntryType.EXPENSE) cat = cat.copy(essential = patch.essential)
        repo.saveCategory(u, cat)
        return cat
    }

    fun deleteCategory(u: String, id: String) {
        val cat = category(u, id)
        val n = entriesUsing(u, cat)
        if (n > 0) conflict("${cat.name} still has $n entries")
        repo.deleteCategory(u, id)
    }

    fun addSubcategory(u: String, id: String, name: String): Category {
        val cat = category(u, id)
        val sub = name.trim().ifEmpty { bad("Subcategory needs a name") }
        if (sub in cat.subcategories) conflict("$sub already exists")
        return cat.copy(subcategories = cat.subcategories + sub).also { repo.saveCategory(u, it) }
    }

    fun renameSubcategory(u: String, id: String, from: String, to: String): Category {
        val cat = category(u, id)
        val newName = to.trim().ifEmpty { bad("Subcategory needs a name") }
        if (from !in cat.subcategories) notFound("No subcategory $from")
        if (newName in cat.subcategories) conflict("$newName already exists")
        repo.saveEntries(u, entriesOf(u, cat, from).map { it.copy(subcategory = newName) })
        return cat.copy(subcategories = cat.subcategories.map { if (it == from) newName else it }).also { repo.saveCategory(u, it) }
    }

    fun removeSubcategory(u: String, id: String, sub: String): Category {
        val cat = category(u, id)
        requireUnused(u, cat, sub)
        return cat.copy(subcategories = cat.subcategories - sub).also { repo.saveCategory(u, it) }
    }

    private fun entriesOf(u: String, cat: Category, sub: String? = null) =
        repo.entries(u).filter { it.type == cat.type && it.category == cat.name && (sub == null || it.subcategory == sub) }

    fun entriesUsing(u: String, cat: Category, sub: String? = null) = entriesOf(u, cat, sub).size

    private fun requireUnused(u: String, cat: Category, sub: String) {
        val n = entriesUsing(u, cat, sub)
        if (n > 0) conflict("$sub still has $n entries")
    }

    /** Makes sure a category/subcategory pair exists (new entries and imports create them). */
    private fun ensureCategory(u: String, type: EntryType, name: String, sub: String) {
        val cat = findCategory(u, type, name)
        if (cat == null) {
            repo.saveCategory(u, Category(newId("c"), type, name, listOf(sub.ifBlank { "Other" }), if (type == EntryType.EXPENSE) false else null))
        } else if (sub.isNotBlank() && sub !in cat.subcategories) {
            repo.saveCategory(u, cat.copy(subcategories = cat.subcategories + sub))
        }
    }

    /* ---------- entries ---------- */

    /** Entries for a year, or one month of it (1–12). */
    fun entries(u: String, year: Int?, month: Int?): List<Entry> = when {
        year == null -> repo.entries(u)
        month == null -> repo.entries(u, "$year-01-01", "$year-12-31")
        else -> "%d-%02d".format(year, month).let { repo.entries(u, "$it-01", "$it-31") }
    }

    private fun validate(e: Entry) {
        if (!DATE.matches(e.date)) bad("Date must be YYYY-MM-DD, got ${e.date}")
        if (!e.amount.isFinite()) bad("Amount must be a number")
        if (e.category.isBlank()) bad("Entry needs a category")
    }

    /** Create (blank id) or replace an entry. */
    fun saveEntry(u: String, e: Entry): Entry {
        val entry = e.copy(id = e.id.ifBlank { newId("e") }, category = e.category.trim(), subcategory = e.subcategory.trim(), description = e.description.trim())
        validate(entry)
        ensureCategory(u, entry.type, entry.category, entry.subcategory)
        repo.saveEntries(u, listOf(entry))
        return entry
    }

    fun deleteEntry(u: String, id: String) = repo.deleteEntries(u, listOf(id))

    fun importEntries(u: String, imp: EntryImport): Int {
        imp.entries.forEach(::validate)
        if (imp.replaceMonths) {
            val months = imp.entries.map { it.month }.toSet()
            repo.deleteEntries(u, repo.entries(u).filter { it.month in months }.map { it.id })
        }
        val entries = imp.entries.map { it.copy(id = newId("e")) }
        entries.forEach { ensureCategory(u, it.type, it.category, it.subcategory) }
        repo.saveEntries(u, entries)
        return entries.size
    }

    /* ---------- net worth ---------- */

    fun netWorth(u: String) = NetWorth(repo.accounts(u), repo.snapshots(u))

    fun saveAccount(u: String, a: Account): Account {
        val account = a.copy(id = a.id.ifBlank { newId("a") }, name = a.name.trim().ifEmpty { bad("Account needs a name") })
        repo.saveAccount(u, account)
        return account
    }

    /** Removes the account and its balances from every snapshot. */
    fun deleteAccount(u: String, id: String) {
        repo.snapshots(u).filter { id in it.values }.forEach { repo.saveSnapshot(u, it.copy(values = it.values - id)) }
        repo.deleteAccount(u, id)
    }

    fun saveSnapshot(u: String, s: Snapshot): Snapshot {
        if (!DATE.matches(s.date)) bad("Date must be YYYY-MM-DD, got ${s.date}")
        val known = repo.accounts(u).map { it.id }.toSet()
        val unknown = s.values.keys - known
        if (unknown.isNotEmpty()) bad("Unknown accounts: ${unknown.joinToString()}")
        repo.saveSnapshot(u, s)
        return s
    }

    fun deleteSnapshot(u: String, date: String) = repo.deleteSnapshot(u, date)

    /** Accounts matched by name (case-insensitive), created when new, and their month-end balances merged in. */
    fun importNetWorth(u: String, accounts: List<AccountImport>): NetWorth {
        val existing = repo.accounts(u)
        val snapshots = repo.snapshots(u).associateBy { it.date }.toMutableMap()
        for (a in accounts) {
            val acct = existing.find { it.name.equals(a.name, ignoreCase = true) } ?: saveAccount(u, Account("", a.name, a.group))
            for ((date, v) in a.values) {
                val s = snapshots[date] ?: Snapshot(date, emptyMap())
                snapshots[date] = s.copy(values = s.values + (acct.id to v))
            }
        }
        snapshots.values.forEach { saveSnapshot(u, it) }
        return netWorth(u)
    }

    /* ---------- subscriptions ---------- */

    fun subscriptions(u: String) = repo.subscriptions(u)

    fun saveSubscription(u: String, s: Subscription): Subscription {
        val sub = s.copy(id = s.id.ifBlank { newId("s") }, service = s.service.trim().ifEmpty { bad("Subscription needs a service name") })
        repo.saveSubscription(u, sub)
        return sub
    }

    fun deleteSubscription(u: String, id: String) = repo.deleteSubscription(u, id)

    /* ---------- plan ---------- */

    fun plan(u: String): Plan = repo.plan(u) ?: Plan()

    fun savePlan(u: String, p: Plan): Plan {
        if (p.taxRate !in 0.0..1.0 || p.k401 !in 0.0..1.0 || p.match !in 0.0..1.0) bad("Rates are shares from 0 to 1")
        repo.savePlan(u, p)
        return p
    }

    /* ---------- summaries ---------- */

    fun monthTotals(u: String, year: Int) = Summaries.monthTotals(year, entries(u, year, null), repo.categories(u))

    fun netWorthSeries(u: String) = Summaries.netWorthSeries(repo.accounts(u), repo.snapshots(u), plan(u).loans)

    fun planSummary(u: String) = PlanCalculator.summarize(plan(u))
}

data class AccountImport(val name: String, val group: AccountGroup, val values: Map<String, Double>)
