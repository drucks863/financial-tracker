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
class NetWorthController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    @GetMapping fun get() = financeService.netWorth(currentUser.id())
    @GetMapping("/series") fun series() = financeService.netWorthSeries(currentUser.id())

    @PostMapping("/accounts") @ResponseStatus(HttpStatus.CREATED)
    fun createAccount(@RequestBody account: Account) = financeService.saveAccount(currentUser.id(), account.copy(id = ""))

    @PutMapping("/accounts/{accountId}") fun putAccount(@PathVariable accountId: String, @RequestBody account: Account) = financeService.saveAccount(currentUser.id(), account.copy(id = accountId))

    @DeleteMapping("/accounts/{accountId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteAccount(@PathVariable accountId: String) = financeService.deleteAccount(currentUser.id(), accountId)

    /** Upsert the month-end snapshot for `date` (YYYY-MM-DD). */
    @PutMapping("/snapshots/{date}")
    fun putSnapshot(@PathVariable date: String, @RequestBody balancesByAccountId: Map<String, Double>) =
        financeService.saveSnapshot(currentUser.id(), Snapshot(date, balancesByAccountId))

    @DeleteMapping("/snapshots/{date}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSnapshot(@PathVariable date: String) = financeService.deleteSnapshot(currentUser.id(), date)

    @PostMapping("/import")
    fun import(@RequestBody accountImports: List<AccountImport>) = financeService.importNetWorth(currentUser.id(), accountImports)
}
