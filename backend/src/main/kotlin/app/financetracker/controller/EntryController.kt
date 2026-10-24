package app.financetracker.controller

import app.financetracker.model.Entry
import app.financetracker.model.EntryImport
import app.financetracker.model.ImportResult
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
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

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
