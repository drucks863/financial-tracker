package app.financetracker.repo

import app.financetracker.domain.FinanceData
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
    fun seedData(props: FinanceProperties, mapper: JsonMapper): SeedData =
        SeedData(normalize(props.seed.inputStream.use { mapper.readValue<FinanceData>(it) }))

    // Swap this bean for a DynamoDB-backed FinanceRepository when that exists.
    @Bean
    fun financeRepository(seed: SeedData): FinanceRepository = InMemoryFinanceRepository { seed.data }
}

class SeedData(val data: FinanceData)

/** Older data has subscriptions without ids; give them stable ones. */
fun normalize(data: FinanceData): FinanceData = data.copy(
    version = FinanceData.VERSION,
    subscriptions = data.subscriptions.mapIndexed { i, s -> if (s.id.isBlank()) s.copy(id = "s${i + 1}") else s },
)
