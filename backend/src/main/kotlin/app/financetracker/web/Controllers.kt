package app.financetracker.web

import app.financetracker.domain.Account
import app.financetracker.domain.Category
import app.financetracker.domain.Entry
import app.financetracker.domain.FinanceData
import app.financetracker.domain.Plan
import app.financetracker.domain.Snapshot
import app.financetracker.domain.Subscription
import app.financetracker.service.AccountImport
import app.financetracker.service.CategoryPatch
import app.financetracker.service.EntryImport
import app.financetracker.service.FinanceService
import app.financetracker.service.LoanMath
import app.financetracker.service.newId
import app.financetracker.user.CurrentUser
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

// Thin REST layer over FinanceService. Every call is for CurrentUser; ids in paths are the
// same ids the frontend generates, so PUT is an upsert and the client can save optimistically.

/** The whole document: what the frontend loads at startup, plus full replace (import a backup) and reset. */
@RestController
@RequestMapping("/api/data")
class DataController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun get() = svc.data(user.id())
    @PutMapping fun replace(@RequestBody data: FinanceData) = svc.replaceAll(user.id(), data)
    @PostMapping("/reset") fun reset() = svc.reset(user.id())
}

data class NameBody(val name: String)

@RestController
@RequestMapping("/api/categories")
class CategoryController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun list() = svc.categories(user.id())

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody c: Category) = svc.saveCategory(user.id(), c.copy(id = newId("c")))

    @PutMapping("/{id}") fun put(@PathVariable id: String, @RequestBody c: Category) = svc.saveCategory(user.id(), c.copy(id = id))
    @PatchMapping("/{id}") fun patch(@PathVariable id: String, @RequestBody p: CategoryPatch) = svc.patchCategory(user.id(), id, p)

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: String) = svc.deleteCategory(user.id(), id)

    @PostMapping("/{id}/subcategories")
    fun addSub(@PathVariable id: String, @RequestBody b: NameBody) = svc.addSubcategory(user.id(), id, b.name)

    @PutMapping("/{id}/subcategories/{sub}")
    fun renameSub(@PathVariable id: String, @PathVariable sub: String, @RequestBody b: NameBody) = svc.renameSubcategory(user.id(), id, sub, b.name)

    @DeleteMapping("/{id}/subcategories/{sub}")
    fun removeSub(@PathVariable id: String, @PathVariable sub: String) = svc.removeSubcategory(user.id(), id, sub)
}

data class ImportResult(val imported: Int)

@RestController
@RequestMapping("/api/entries")
class EntryController(private val svc: FinanceService, private val user: CurrentUser) {
    /** All entries, a year (`?year=2026`), or one month (`?year=2026&month=3`, 1–12). */
    @GetMapping
    fun list(@RequestParam year: Int?, @RequestParam month: Int?): List<Entry> {
        if (month != null && (year == null || month !in 1..12)) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "month needs a year and must be 1–12")
        return svc.entries(user.id(), year, month)
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody e: Entry) = svc.saveEntry(user.id(), e.copy(id = ""))

    @PutMapping("/{id}") fun put(@PathVariable id: String, @RequestBody e: Entry) = svc.saveEntry(user.id(), e.copy(id = id))

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: String) = svc.deleteEntry(user.id(), id)

    @PostMapping("/import")
    fun import(@RequestBody imp: EntryImport) = ImportResult(svc.importEntries(user.id(), imp))
}

@RestController
@RequestMapping("/api/net-worth")
class NetWorthController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun get() = svc.netWorth(user.id())
    @GetMapping("/series") fun series() = svc.netWorthSeries(user.id())

    @PostMapping("/accounts") @ResponseStatus(HttpStatus.CREATED)
    fun createAccount(@RequestBody a: Account) = svc.saveAccount(user.id(), a.copy(id = ""))

    @PutMapping("/accounts/{id}") fun putAccount(@PathVariable id: String, @RequestBody a: Account) = svc.saveAccount(user.id(), a.copy(id = id))

    @DeleteMapping("/accounts/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteAccount(@PathVariable id: String) = svc.deleteAccount(user.id(), id)

    /** Upsert the month-end snapshot for `date` (YYYY-MM-DD). */
    @PutMapping("/snapshots/{date}")
    fun putSnapshot(@PathVariable date: String, @RequestBody values: Map<String, Double>) = svc.saveSnapshot(user.id(), Snapshot(date, values))

    @DeleteMapping("/snapshots/{date}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSnapshot(@PathVariable date: String) = svc.deleteSnapshot(user.id(), date)

    @PostMapping("/import")
    fun import(@RequestBody accounts: List<AccountImport>) = svc.importNetWorth(user.id(), accounts)
}

@RestController
@RequestMapping("/api/subscriptions")
class SubscriptionController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun list() = svc.subscriptions(user.id())

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody s: Subscription) = svc.saveSubscription(user.id(), s.copy(id = ""))

    @PutMapping("/{id}") fun put(@PathVariable id: String, @RequestBody s: Subscription) = svc.saveSubscription(user.id(), s.copy(id = id))

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: String) = svc.deleteSubscription(user.id(), id)
}

/** The budget setup and the figures derived from it. */
@RestController
@RequestMapping("/api/plan")
class PlanController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun get() = svc.plan(user.id())
    @PutMapping fun put(@RequestBody p: Plan) = svc.savePlan(user.id(), p)
    @GetMapping("/summary") fun summary() = svc.planSummary(user.id())

    @GetMapping("/loans/{id}/schedule")
    fun schedule(@PathVariable id: String) = svc.plan(user.id()).loans.find { it.id == id }?.let(LoanMath::summary)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No loan $id")
}

@RestController
@RequestMapping("/api/summary")
class SummaryController(private val svc: FinanceService, private val user: CurrentUser) {
    /** Per-month income, expenses, essentials and net for a year, like the sheet's Summary tab. */
    @GetMapping("/months") fun months(@RequestParam year: Int) = svc.monthTotals(user.id(), year)
}
