package app.financetracker.model

import com.fasterxml.jackson.annotation.JsonValue

// Categories entries are filed under, and the requests that change them.

enum class EntryType(@JsonValue val json: String) { INCOME("income"), EXPENSE("expense") }

data class Category(
    val id: String,
    val type: EntryType,
    val name: String,
    val subcategories: List<String>,
    /** expenses only: counts toward essentials (rent, utilities) instead of discretionary */
    val essential: Boolean? = null,
)

/** Partial update of a category; null fields are left as they are. */
data class CategoryPatch(val name: String? = null, val essential: Boolean? = null)

data class NameRequest(val name: String)
