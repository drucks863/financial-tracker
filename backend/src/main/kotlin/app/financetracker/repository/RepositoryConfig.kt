package app.financetracker.repository

import app.financetracker.model.FinanceData
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.Resource
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue

@ConfigurationProperties("finance")
data class FinanceProperties(
    /** JSON file (FinanceData shape) each user's in-memory data starts from. */
    val seed: Resource,
)

@Configuration
class RepositoryConfig {
    /** What a new user (and a reset) starts from. */
    @Bean
    fun seedData(financeProperties: FinanceProperties, jsonMapper: JsonMapper): SeedData =
        SeedData(normalize(financeProperties.seed.inputStream.use { stream -> jsonMapper.readValue<FinanceData>(stream) }))

    // Swap this bean for a DynamoDB-backed FinanceRepository when that exists.
    @Bean
    fun financeRepository(seedData: SeedData): FinanceRepository = InMemoryFinanceRepository { seedData.data }
}

class SeedData(val data: FinanceData)

/** Older data has subscriptions without ids; give them stable ones that don't clash with ids already there. */
fun normalize(data: FinanceData): FinanceData {
    val takenIds = data.subscriptions.map { it.id }.filter { it.isNotBlank() }.toMutableSet()
    var nextNumber = 1
    fun nextFreeId(): String {
        while ("s$nextNumber" in takenIds) nextNumber++
        return "s$nextNumber".also { takenIds += it }
    }
    return data.copy(
        version = FinanceData.VERSION,
        subscriptions = data.subscriptions.map { subscription ->
            if (subscription.id.isBlank()) subscription.copy(id = nextFreeId()) else subscription
        },
    )
}
