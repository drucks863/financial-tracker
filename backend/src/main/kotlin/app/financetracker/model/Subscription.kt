package app.financetracker.model

data class Subscription(
    /** older data has none; the service assigns one */
    val id: String = "",
    val service: String,
    val price: Double?,
    val category: String,
    val frequency: String,
    val `when`: String,
    val from: String,
)
