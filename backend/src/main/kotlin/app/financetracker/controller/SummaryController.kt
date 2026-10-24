package app.financetracker.controller

import app.financetracker.service.CurrentUser
import app.financetracker.service.FinanceService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/summary")
class SummaryController(private val svc: FinanceService, private val user: CurrentUser) {
    /** Per-month income, expenses, essentials and net for a year, like the sheet's Summary tab. */
    @GetMapping("/months") fun months(@RequestParam year: Int) = svc.monthTotals(user.id(), year)
}
