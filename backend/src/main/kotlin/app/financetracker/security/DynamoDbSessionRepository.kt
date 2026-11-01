package app.financetracker.security

import org.springframework.session.MapSession
import org.springframework.session.SessionRepository
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.ObjectInputStream
import java.io.ObjectOutputStream
import java.time.Duration
import java.util.Base64

/**
 * Sign-in sessions kept in the app's DynamoDB table instead of server memory: on Lambda, two requests
 * can land on different instances. Each session is one item, `pk` = `SESSION#<id>`, `sk` = `SESSION`,
 * holding the Java-serialized session (the Spring Security context in it is Serializable).
 * `expiresAt` (epoch seconds) lets DynamoDB's TTL clean out old sessions; expired ones are also
 * ignored on read, since TTL deletes lazily.
 */
class DynamoDbSessionRepository(
    private val dynamoDbClient: DynamoDbClient,
    private val tableName: String,
    private val maxInactiveInterval: Duration,
) : SessionRepository<MapSession> {

    override fun createSession(): MapSession = MapSession().apply { maxInactiveInterval = this@DynamoDbSessionRepository.maxInactiveInterval }

    override fun save(session: MapSession) {
        // The id changes at sign-in (session fixation protection); drop the item under the old one.
        if (session.id != session.originalId) deleteById(session.originalId)
        val expiresAt = session.lastAccessedTime.plus(session.maxInactiveInterval)
        dynamoDbClient.putItem { request ->
            request.tableName(tableName).item(
                keyOf(session.id) + mapOf(
                    BODY to AttributeValue.fromS(serialize(session)),
                    EXPIRES_AT to AttributeValue.fromN(expiresAt.epochSecond.toString()),
                ),
            )
        }
    }

    override fun findById(id: String): MapSession? {
        val response = dynamoDbClient.getItem { request -> request.tableName(tableName).key(keyOf(id)).consistentRead(true) }
        if (!response.hasItem()) return null
        val session = runCatching { deserialize(response.item().getValue(BODY).s()) }.getOrNull()
        if (session == null || session.isExpired) {
            deleteById(id)
            return null
        }
        // MapSession tracks the id it was loaded with, so save() can tell when it changed.
        return MapSession(session)
    }

    override fun deleteById(id: String) {
        dynamoDbClient.deleteItem { request -> request.tableName(tableName).key(keyOf(id)) }
    }

    private fun keyOf(id: String) = mapOf(
        "pk" to AttributeValue.fromS(SESSION_PREFIX + id),
        "sk" to AttributeValue.fromS(SESSION_SORT_KEY),
    )

    private fun serialize(session: MapSession): String {
        val bytes = ByteArrayOutputStream()
        ObjectOutputStream(bytes).use { stream -> stream.writeObject(session) }
        return Base64.getEncoder().encodeToString(bytes.toByteArray())
    }

    private fun deserialize(encoded: String): MapSession =
        ObjectInputStream(ByteArrayInputStream(Base64.getDecoder().decode(encoded))).use { stream -> stream.readObject() as MapSession }

    companion object {
        private const val SESSION_PREFIX = "SESSION#"
        private const val SESSION_SORT_KEY = "SESSION"
        private const val BODY = "body"
        /** The table's TTL attribute. */
        const val EXPIRES_AT = "expiresAt"
    }
}
