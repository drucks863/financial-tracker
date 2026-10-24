package app.financetracker.controller

import app.financetracker.model.Account
import app.financetracker.model.AccountImport
import app.financetracker.model.Snapshot
import app.financetracker.service.CurrentUser
import app.financetracker.service.FinanceService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

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
