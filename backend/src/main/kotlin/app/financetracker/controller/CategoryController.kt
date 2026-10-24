package app.financetracker.controller

import app.financetracker.model.Category
import app.financetracker.model.CategoryPatch
import app.financetracker.model.NameBody
import app.financetracker.service.CurrentUser
import app.financetracker.service.FinanceService
import app.financetracker.service.newId
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

    // The subcategory goes in `?name=` rather than the path: names like "Hobby/Toys" would need an
    // encoded slash (%2F), which Tomcat rejects.
    @PutMapping("/{id}/subcategories")
    fun renameSub(@PathVariable id: String, @RequestParam name: String, @RequestBody b: NameBody) = svc.renameSubcategory(user.id(), id, name, b.name)

    @DeleteMapping("/{id}/subcategories")
    fun removeSub(@PathVariable id: String, @RequestParam name: String) = svc.removeSubcategory(user.id(), id, name)
}
