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
class EntryController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    /** All entries, a year (`?year=2026`), or one month (`?year=2026&month=3`, 1–12). */
    @GetMapping
    fun list(@RequestParam year: Int?, @RequestParam month: Int?): List<Entry> {
        if (month != null && (year == null || month !in 1..12)) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "month needs a year and must be 1–12")
        return financeService.entries(currentUser.id(), year, month)
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody entry: Entry) = financeService.saveEntry(currentUser.id(), entry.copy(id = ""))

    @PutMapping("/{entryId}") fun put(@PathVariable entryId: String, @RequestBody entry: Entry) = financeService.saveEntry(currentUser.id(), entry.copy(id = entryId))

    @DeleteMapping("/{entryId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable entryId: String) = financeService.deleteEntry(currentUser.id(), entryId)

    @PostMapping("/import")
    fun import(@RequestBody entryImport: EntryImport) = ImportResult(financeService.importEntries(currentUser.id(), entryImport))
}
