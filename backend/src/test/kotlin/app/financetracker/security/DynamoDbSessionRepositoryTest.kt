package app.financetracker.security

import app.financetracker.repository.createTableIfMissing
import com.amazonaws.services.dynamodbv2.local.embedded.DynamoDBEmbedded
import com.amazonaws.services.dynamodbv2.local.shared.access.AmazonDynamoDBLocal
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class DynamoDbSessionRepositoryTest {
    private val sessionRepository = DynamoDbSessionRepository(dynamoDbLocal.dynamoDbClient(), TABLE_NAME, Duration.ofDays(30))

    @Test
    fun `a saved session comes back with its attributes`() {
        val session = sessionRepository.createSession()
        session.setAttribute("signedInAs", "google-subject-1")
        sessionRepository.save(session)
        val loaded = assertNotNull(sessionRepository.findById(session.id))
        assertEquals("google-subject-1", loaded.getAttribute<String>("signedInAs"))
        assertEquals(Duration.ofDays(30), loaded.maxInactiveInterval)
    }

    @Test
    fun `changing the id at sign-in drops the old item`() {
        val session = sessionRepository.createSession()
        sessionRepository.save(session)
        val loaded = sessionRepository.findById(session.id)!!
        val oldId = loaded.id
        loaded.changeSessionId()
        sessionRepository.save(loaded)
        assertNull(sessionRepository.findById(oldId))
        assertNotNull(sessionRepository.findById(loaded.id))
    }

    @Test
    fun `expired and deleted sessions are gone`() {
        val expired = sessionRepository.createSession().apply { lastAccessedTime = Instant.now().minus(Duration.ofDays(31)) }
        sessionRepository.save(expired)
        assertNull(sessionRepository.findById(expired.id))

        val signedOut = sessionRepository.createSession()
        sessionRepository.save(signedOut)
        sessionRepository.deleteById(signedOut.id)
        assertNull(sessionRepository.findById(signedOut.id))
        assertNull(sessionRepository.findById("never-existed"))
    }

    companion object {
        private const val TABLE_NAME = "financial-tracker-sessions-test"
        private lateinit var dynamoDbLocal: AmazonDynamoDBLocal

        @JvmStatic
        @BeforeAll
        fun startDynamoDbLocal() {
            dynamoDbLocal = DynamoDBEmbedded.create(true)
            createTableIfMissing(dynamoDbLocal.dynamoDbClient(), TABLE_NAME)
        }

        @JvmStatic
        @AfterAll
        fun stopDynamoDbLocal() {
            dynamoDbLocal.shutdownNow()
        }
    }
}
