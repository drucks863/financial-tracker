package app.financetracker.controller

import app.financetracker.model.Subscription
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
@RequestMapping("/api/subscriptions")
class SubscriptionController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    @GetMapping fun list() = financeService.subscriptions(currentUser.id())

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody subscription: Subscription) = financeService.saveSubscription(currentUser.id(), subscription.copy(id = ""))

    @PutMapping("/{subscriptionId}") fun put(@PathVariable subscriptionId: String, @RequestBody subscription: Subscription) = financeService.saveSubscription(currentUser.id(), subscription.copy(id = subscriptionId))

    @DeleteMapping("/{subscriptionId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable subscriptionId: String) = financeService.deleteSubscription(currentUser.id(), subscriptionId)
}
