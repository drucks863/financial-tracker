package app.financetracker.controller

import app.financetracker.model.Plan
import app.financetracker.service.CurrentUser
import app.financetracker.service.FinanceService
import app.financetracker.service.LoanMath
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/** The budget setup and the figures derived from it. */
@RestController
@RequestMapping("/api/plan")
class PlanController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    @GetMapping fun get() = financeService.plan(currentUser.id())
    @PutMapping fun put(@RequestBody plan: Plan) = financeService.savePlan(currentUser.id(), plan)
    @GetMapping("/summary") fun summary() = financeService.planSummary(currentUser.id())

    @GetMapping("/loans/{loanId}/schedule")
    fun schedule(@PathVariable loanId: String) = financeService.plan(currentUser.id()).loans.find { it.id == loanId }?.let(LoanMath::summary)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No loan $loanId")
}
