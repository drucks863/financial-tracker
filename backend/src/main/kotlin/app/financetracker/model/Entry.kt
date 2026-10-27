package app.financetracker.model

// Income and expense entries.

data class Entry(
    val id: String,
    /** YYYY-MM-DD */
    val date: String,
    val type: EntryType,
    val category: String,
    val subcategory: String,
    val description: String,
    val amount: Double,
)

/** YYYY-MM (an extension so it stays out of the JSON) */
val Entry.month: String get() = date.take(7)

/** Entries from a file import. With [replaceMonths], entries of the same type already in those months are removed first. */
data class EntryImport(val entries: List<Entry>, val replaceMonths: Boolean = false)

data class ImportResult(val imported: Int)

data class MonthTotals(
    /** 0-based, like the frontend */
    val month: Int,
    val ym: String,
    val income: Double,
    val expense: Double,
    val essential: Double,
    val discretionary: Double,
    val count: Int,
    val net: Double,
    val savingsRate: Double?,
)
