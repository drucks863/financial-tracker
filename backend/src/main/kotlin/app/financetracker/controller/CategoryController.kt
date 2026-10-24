package app.financetracker.controller

import app.financetracker.model.Category
import app.financetracker.model.CategoryPatch
import app.financetracker.model.NameRequest
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
class CategoryController(private val financeService: FinanceService, private val currentUser: CurrentUser) {
    @GetMapping fun list() = financeService.categories(currentUser.id())

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody category: Category) = financeService.saveCategory(currentUser.id(), category.copy(id = newId("c")))

    @PutMapping("/{categoryId}") fun put(@PathVariable categoryId: String, @RequestBody category: Category) = financeService.saveCategory(currentUser.id(), category.copy(id = categoryId))
    @PatchMapping("/{categoryId}") fun patch(@PathVariable categoryId: String, @RequestBody patch: CategoryPatch) = financeService.patchCategory(currentUser.id(), categoryId, patch)

    @DeleteMapping("/{categoryId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable categoryId: String) = financeService.deleteCategory(currentUser.id(), categoryId)

    @PostMapping("/{categoryId}/subcategories")
    fun addSubcategory(@PathVariable categoryId: String, @RequestBody body: NameRequest) = financeService.addSubcategory(currentUser.id(), categoryId, body.name)

    // The subcategory goes in `?name=` rather than the path: names like "Hobby/Toys" would need an
    // encoded slash (%2F), which Tomcat rejects.
    @PutMapping("/{categoryId}/subcategories")
    fun renameSubcategory(@PathVariable categoryId: String, @RequestParam("name") subcategory: String, @RequestBody body: NameRequest) = financeService.renameSubcategory(currentUser.id(), categoryId, subcategory, body.name)

    @DeleteMapping("/{categoryId}/subcategories")
    fun removeSubcategory(@PathVariable categoryId: String, @RequestParam("name") subcategory: String) = financeService.removeSubcategory(currentUser.id(), categoryId, subcategory)
}
