package app.financetracker.controller

import app.financetracker.model.FinanceData
import app.financetracker.service.CurrentUser
import app.financetracker.service.FinanceService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

// The controllers are a thin REST layer over FinanceService. Every call is for CurrentUser; ids in
// paths are the same ids the frontend generates, so PUT is an upsert and the client can save optimistically.

/** The whole document: what the frontend loads at startup, plus full replace (import a backup) and reset. */
@RestController
@RequestMapping("/api/data")
class DataController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    @GetMapping fun get() = financeService.data(currentUser.id())
    @PutMapping fun replace(@RequestBody data: FinanceData) = financeService.replaceAll(currentUser.id(), data)
    @PostMapping("/reset") fun reset() = financeService.reset(currentUser.id())
}
