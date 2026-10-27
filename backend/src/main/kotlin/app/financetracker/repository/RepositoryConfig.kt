package app.financetracker.repository

import app.financetracker.model.FinanceData
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.Resource
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition
import software.amazon.awssdk.services.dynamodb.model.BillingMode
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement
import software.amazon.awssdk.services.dynamodb.model.KeyType
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.net.URI

@ConfigurationProperties("finance")
data class FinanceProperties(
    /** JSON file (FinanceData shape) a new user's data starts from. */
    val seed: Resource,
    /** Where data is kept. */
    val storage: StorageKind = StorageKind.MEMORY,
    val dynamodb: DynamoDbProperties = DynamoDbProperties(),
)

enum class StorageKind { MEMORY, DYNAMODB }

data class DynamoDbProperties(
    val tableName: String = "financial-tracker",
    /** Leave empty on AWS (the SDK finds the region itself); set it for DynamoDB Local. */
    val region: String? = null,
    /**
     * Set to DynamoDB Local's URL (e.g. http://localhost:8000) to develop offline. With an endpoint set the
     * app uses dummy credentials, so it can never reach a real AWS account, and creates the table if it's missing.
     */
    val endpoint: URI? = null,
)

@Configuration
class RepositoryConfig {
    /** What a new user (and a reset) starts from. */
    @Bean
    fun seedData(financeProperties: FinanceProperties, jsonMapper: JsonMapper): SeedData =
        SeedData(normalize(financeProperties.seed.inputStream.use { stream -> jsonMapper.readValue<FinanceData>(stream) }))

    @Bean
    fun financeRepository(financeProperties: FinanceProperties, seedData: SeedData, jsonMapper: JsonMapper): FinanceRepository =
        when (financeProperties.storage) {
            StorageKind.MEMORY -> InMemoryFinanceRepository { seedData.data }
            StorageKind.DYNAMODB -> {
                val dynamoDbProperties = financeProperties.dynamodb
                val dynamoDbClient = dynamoDbClient(dynamoDbProperties)
                if (dynamoDbProperties.endpoint != null) createTableIfMissing(dynamoDbClient, dynamoDbProperties.tableName)
                DynamoDbFinanceRepository(dynamoDbClient, dynamoDbProperties.tableName, jsonMapper) { seedData.data }
            }
        }

    private fun dynamoDbClient(dynamoDbProperties: DynamoDbProperties): DynamoDbClient {
        val builder = DynamoDbClient.builder()
        dynamoDbProperties.region?.let { region -> builder.region(Region.of(region)) }
        dynamoDbProperties.endpoint?.let { localEndpoint ->
            builder.endpointOverride(localEndpoint)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("local", "local")))
            if (dynamoDbProperties.region == null) builder.region(Region.US_EAST_1)
        }
        return builder.build()
    }
}

/** The table's shape (see [DynamoDbFinanceRepository]). On AWS it's created by hand once; see docs/deploy.md. */
fun createTableIfMissing(dynamoDbClient: DynamoDbClient, tableName: String) {
    if (dynamoDbClient.listTables().tableNames().contains(tableName)) return
    dynamoDbClient.createTable { request ->
        request.tableName(tableName)
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .attributeDefinitions(
                AttributeDefinition.builder().attributeName(DynamoDbFinanceRepository.PARTITION_KEY).attributeType(ScalarAttributeType.S).build(),
                AttributeDefinition.builder().attributeName(DynamoDbFinanceRepository.SORT_KEY).attributeType(ScalarAttributeType.S).build(),
            )
            .keySchema(
                KeySchemaElement.builder().attributeName(DynamoDbFinanceRepository.PARTITION_KEY).keyType(KeyType.HASH).build(),
                KeySchemaElement.builder().attributeName(DynamoDbFinanceRepository.SORT_KEY).keyType(KeyType.RANGE).build(),
            )
    }
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
