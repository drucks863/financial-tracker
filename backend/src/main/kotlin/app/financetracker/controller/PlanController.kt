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
class PlanController(private val svc: FinanceService, private val user: CurrentUser) {
    @GetMapping fun get() = svc.plan(user.id())
    @PutMapping fun put(@RequestBody p: Plan) = svc.savePlan(user.id(), p)
    @GetMapping("/summary") fun summary() = svc.planSummary(user.id())

    @GetMapping("/loans/{id}/schedule")
    fun schedule(@PathVariable id: String) = svc.plan(user.id()).loans.find { it.id == id }?.let(LoanMath::summary)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No loan $id")
}
