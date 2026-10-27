package app.financetracker.repository

import app.financetracker.model.Account
import app.financetracker.model.Category
import app.financetracker.model.Entry
import app.financetracker.model.FinanceData
import app.financetracker.model.Plan
import app.financetracker.model.Snapshot
import app.financetracker.model.Subscription
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.DeleteRequest
import software.amazon.awssdk.services.dynamodb.model.PutRequest
import software.amazon.awssdk.services.dynamodb.model.WriteRequest
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.util.concurrent.ConcurrentHashMap

/**
 * One DynamoDB table holds everyone's data. Every item has
 *
 * - `pk`: `USER#<user id>`
 * - `sk`: `<KIND>#<id>`, e.g. `ENTRY#e12`, `CATEGORY#food`, `SNAPSHOT#2026-01-31`, `PLAN`, `META`
 * - `body`: the model as JSON, the same JSON the API sends
 *
 * so a user's data of one kind is a single query on `pk` with `begins_with(sk, "<KIND>#")`.
 * Entries are filtered by date after the query: one person's entries are a few thousand items,
 * and keeping the id alone in the key means an entry can be deleted without knowing its date.
 *
 * A user with no `META` item has never been seen; their data starts from [seedData], like the
 * in-memory repository.
 */
class DynamoDbFinanceRepository(
    private val dynamoDbClient: DynamoDbClient,
    private val tableName: String,
    private val jsonMapper: JsonMapper,
    private val seedData: () -> FinanceData,
) : FinanceRepository {

    private enum class ItemKind(val sortKeyPrefix: String) {
        CATEGORY("CATEGORY#"), ENTRY("ENTRY#"), ACCOUNT("ACCOUNT#"), SNAPSHOT("SNAPSHOT#"), SUBSCRIPTION("SUBSCRIPTION#")
    }

    /** Users whose META item is known to exist, so the seeding check runs once per user per process. */
    private val seededUserIds = ConcurrentHashMap.newKeySet<String>()

    override fun categories(userId: String): List<Category> = queryBodies(userId, ItemKind.CATEGORY)
    override fun saveCategory(userId: String, category: Category) = putItem(userId, ItemKind.CATEGORY.sortKeyPrefix + category.id, category)
    override fun deleteCategory(userId: String, categoryId: String) = deleteItem(userId, ItemKind.CATEGORY.sortKeyPrefix + categoryId)

    override fun entries(userId: String, from: String?, to: String?): List<Entry> =
        queryBodies<Entry>(userId, ItemKind.ENTRY)
            .filter { entry -> (from == null || entry.date >= from) && (to == null || entry.date <= to) }
            .sortedBy { it.date }
    override fun saveEntries(userId: String, entries: Collection<Entry>) =
        batchWrite(entries.map { entry -> putRequest(userId, ItemKind.ENTRY.sortKeyPrefix + entry.id, entry) }, userId)
    override fun deleteEntries(userId: String, entryIds: Collection<String>) =
        batchWrite(entryIds.map { entryId -> deleteRequest(userId, ItemKind.ENTRY.sortKeyPrefix + entryId) }, userId)

    override fun accounts(userId: String): List<Account> = queryBodies(userId, ItemKind.ACCOUNT)
    override fun saveAccount(userId: String, account: Account) = putItem(userId, ItemKind.ACCOUNT.sortKeyPrefix + account.id, account)
    override fun deleteAccount(userId: String, accountId: String) = deleteItem(userId, ItemKind.ACCOUNT.sortKeyPrefix + accountId)

    // Snapshot keys are their dates, so the query already returns them oldest first.
    override fun snapshots(userId: String): List<Snapshot> = queryBodies(userId, ItemKind.SNAPSHOT)
    override fun saveSnapshot(userId: String, snapshot: Snapshot) = putItem(userId, ItemKind.SNAPSHOT.sortKeyPrefix + snapshot.date, snapshot)
    override fun deleteSnapshot(userId: String, date: String) = deleteItem(userId, ItemKind.SNAPSHOT.sortKeyPrefix + date)

    override fun subscriptions(userId: String): List<Subscription> = queryBodies(userId, ItemKind.SUBSCRIPTION)
    override fun saveSubscription(userId: String, subscription: Subscription) =
        putItem(userId, ItemKind.SUBSCRIPTION.sortKeyPrefix + subscription.id, subscription)
    override fun deleteSubscription(userId: String, subscriptionId: String) =
        deleteItem(userId, ItemKind.SUBSCRIPTION.sortKeyPrefix + subscriptionId)

    override fun plan(userId: String): Plan? = getBody(userId, PLAN_SORT_KEY)
    override fun savePlan(userId: String, plan: Plan) = putItem(userId, PLAN_SORT_KEY, plan)

    override fun isSample(userId: String): Boolean = getBody<Meta>(userId, META_SORT_KEY)?.sample ?: false

    override fun replaceAll(userId: String, data: FinanceData) {
        val existingKeys = queryItems(userId, sortKeyPrefix = null, keysOnly = true).map { item -> item.getValue(SORT_KEY).s() }
        val newItems = itemsOf(userId, data)
        val newSortKeys = newItems.map { (sortKey, _) -> sortKey }.toSet()
        // Delete what the new data doesn't overwrite, then write everything, META last: if seeding a new
        // user fails halfway, there is still no META and the next request seeds them again.
        batchWriteUnchecked(existingKeys.filter { it !in newSortKeys && it != META_SORT_KEY }.map { sortKey -> deleteRequest(userId, sortKey) })
        batchWriteUnchecked(newItems.filter { (sortKey, _) -> sortKey != META_SORT_KEY }.map { (sortKey, body) -> putRequest(userId, sortKey, body) })
        batchWriteUnchecked(listOf(putRequest(userId, META_SORT_KEY, Meta(data.sample))))
        seededUserIds += userId
    }

    /* ---------- items ---------- */

    /** Per-user facts that aren't one of the models. */
    data class Meta(val sample: Boolean)

    private fun itemsOf(userId: String, data: FinanceData): List<Pair<String, Any>> =
        data.categories.map { ItemKind.CATEGORY.sortKeyPrefix + it.id to it } +
            data.entries.map { ItemKind.ENTRY.sortKeyPrefix + it.id to it } +
            data.netWorth.accounts.map { ItemKind.ACCOUNT.sortKeyPrefix + it.id to it } +
            data.netWorth.snapshots.map { ItemKind.SNAPSHOT.sortKeyPrefix + it.date to it } +
            data.subscriptions.map { ItemKind.SUBSCRIPTION.sortKeyPrefix + it.id to it } +
            listOf(PLAN_SORT_KEY to data.plan, META_SORT_KEY to Meta(data.sample))

    /** Seeds a user seen for the first time. Every public method goes through this first. */
    private fun ensureSeeded(userId: String) {
        if (userId in seededUserIds) return
        val metaExists = dynamoDbClient.getItem { request -> request.tableName(tableName).key(keyOf(userId, META_SORT_KEY)).consistentRead(true) }.hasItem()
        if (!metaExists) replaceAll(userId, seedData())
        seededUserIds += userId
    }

    private fun keyOf(userId: String, sortKey: String) = mapOf(
        PARTITION_KEY to AttributeValue.fromS(USER_PREFIX + userId),
        SORT_KEY to AttributeValue.fromS(sortKey),
    )

    private fun itemOf(userId: String, sortKey: String, body: Any) =
        keyOf(userId, sortKey) + (BODY to AttributeValue.fromS(jsonMapper.writeValueAsString(body)))

    private inline fun <reified T> bodyOf(item: Map<String, AttributeValue>): T = jsonMapper.readValue(item.getValue(BODY).s())

    private inline fun <reified T> getBody(userId: String, sortKey: String): T? {
        ensureSeeded(userId)
        val response = dynamoDbClient.getItem { request -> request.tableName(tableName).key(keyOf(userId, sortKey)).consistentRead(true) }
        return if (response.hasItem()) bodyOf<T>(response.item()) else null
    }

    private inline fun <reified T> queryBodies(userId: String, kind: ItemKind): List<T> {
        ensureSeeded(userId)
        return queryItems(userId, kind.sortKeyPrefix, keysOnly = false).map { item -> bodyOf<T>(item) }
    }

    /** All of a user's items, or those whose sort key starts with [sortKeyPrefix], in sort key order. */
    private fun queryItems(userId: String, sortKeyPrefix: String?, keysOnly: Boolean): List<Map<String, AttributeValue>> {
        val expressionValues = mutableMapOf(":userKey" to AttributeValue.fromS(USER_PREFIX + userId))
        var keyCondition = "$PARTITION_KEY = :userKey"
        if (sortKeyPrefix != null) {
            expressionValues[":sortKeyPrefix"] = AttributeValue.fromS(sortKeyPrefix)
            keyCondition += " AND begins_with($SORT_KEY, :sortKeyPrefix)"
        }
        return dynamoDbClient.queryPaginator { request ->
            request.tableName(tableName)
                .keyConditionExpression(keyCondition)
                .expressionAttributeValues(expressionValues)
                .consistentRead(true)
            if (keysOnly) request.projectionExpression("$PARTITION_KEY, $SORT_KEY")
        }.items().toList()
    }

    private fun putItem(userId: String, sortKey: String, body: Any) {
        ensureSeeded(userId)
        dynamoDbClient.putItem { request -> request.tableName(tableName).item(itemOf(userId, sortKey, body)) }
    }

    private fun deleteItem(userId: String, sortKey: String) {
        ensureSeeded(userId)
        dynamoDbClient.deleteItem { request -> request.tableName(tableName).key(keyOf(userId, sortKey)) }
    }

    private fun putRequest(userId: String, sortKey: String, body: Any): WriteRequest =
        WriteRequest.builder().putRequest(PutRequest.builder().item(itemOf(userId, sortKey, body)).build()).build()

    private fun deleteRequest(userId: String, sortKey: String): WriteRequest =
        WriteRequest.builder().deleteRequest(DeleteRequest.builder().key(keyOf(userId, sortKey)).build()).build()

    private fun batchWrite(writeRequests: List<WriteRequest>, userId: String) {
        ensureSeeded(userId)
        batchWriteUnchecked(writeRequests)
    }

    /** BatchWriteItem takes 25 requests at a time and may hand some back unprocessed; retry those with backoff. */
    private fun batchWriteUnchecked(writeRequests: List<WriteRequest>) {
        // A batch can't hold two requests for the same key; the last one wins, as it would one by one.
        val lastRequestPerKey = writeRequests.associateBy { writeRequest ->
            (writeRequest.putRequest()?.item() ?: writeRequest.deleteRequest().key()).let { it[SORT_KEY]!!.s() }
        }.values
        for (batch in lastRequestPerKey.chunked(MAX_BATCH_SIZE)) {
            var pendingRequests: List<WriteRequest> = batch
            var attempt = 0
            while (pendingRequests.isNotEmpty()) {
                if (attempt > 0) Thread.sleep(minOf(50L shl attempt, 2_000L))
                val response = dynamoDbClient.batchWriteItem { request -> request.requestItems(mapOf(tableName to pendingRequests)) }
                pendingRequests = response.unprocessedItems()[tableName].orEmpty()
                check(++attempt <= MAX_BATCH_ATTEMPTS || pendingRequests.isEmpty()) { "DynamoDB kept throttling a batch write" }
            }
        }
    }

    companion object {
        const val PARTITION_KEY = "pk"
        const val SORT_KEY = "sk"
        private const val BODY = "body"
        private const val USER_PREFIX = "USER#"
        private const val PLAN_SORT_KEY = "PLAN"
        private const val META_SORT_KEY = "META"
        private const val MAX_BATCH_SIZE = 25
        private const val MAX_BATCH_ATTEMPTS = 8
    }
}
