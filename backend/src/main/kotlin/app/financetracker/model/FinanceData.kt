package app.financetracker.model

// The models in this package mirror frontend/src/types.ts field for field, so the JSON the API sends is
// exactly what the Vue store already works with. They are also the shape of the future DynamoDB items.

/** Everything one person has, in the shape the frontend loads at startup. */
data class FinanceData(
    val version: Int = VERSION,
    /** true when this is generated sample data rather than real figures */
    val sample: Boolean = false,
    val categories: List<Category> = emptyList(),
    val entries: List<Entry> = emptyList(),
    val netWorth: NetWorth = NetWorth(emptyList(), emptyList()),
    val subscriptions: List<Subscription> = emptyList(),
    val plan: Plan = Plan(),
) {
    companion object {
        /** matches the frontend's data version; bump both together */
        const val VERSION = 2
    }
}
