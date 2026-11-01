package app.financetracker

import com.amazonaws.services.lambda.runtime.Context
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.ByteArrayOutputStream
import java.lang.reflect.Proxy
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Feeds the handler what a Lambda function URL sends (payload format 2.0), without AWS. */
class LambdaHandlerTest {
    private val jsonMapper = JsonMapper.builder().build()
    private val lambdaHandler = LambdaHandler()

    /** The handler never calls the context beyond logging; a proxy that returns nulls is enough. */
    private val lambdaContext = Proxy.newProxyInstance(javaClass.classLoader, arrayOf(Context::class.java)) { _, _, _ -> null } as Context

    private fun functionUrlEvent(method: String, path: String, query: String = "") = """
        {
          "version": "2.0",
          "routeKey": "${'$'}default",
          "rawPath": "$path",
          "rawQueryString": "$query",
          "headers": {"host": "example.lambda-url.us-east-1.on.aws", "accept": "*/*"},
          "requestContext": {
            "accountId": "anonymous", "apiId": "example", "domainName": "example.lambda-url.us-east-1.on.aws",
            "domainPrefix": "example", "requestId": "test", "routeKey": "${'$'}default", "stage": "${'$'}default",
            "time": "01/Nov/2026:00:00:00 +0000", "timeEpoch": 1793491200000,
            "http": {"method": "$method", "path": "$path", "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "test"}
          },
          "isBase64Encoded": false
        }
    """.trimIndent()

    private fun invoke(method: String, path: String, query: String = ""): JsonNode {
        val output = ByteArrayOutputStream()
        lambdaHandler.handleRequest(functionUrlEvent(method, path, query).byteInputStream(), output, lambdaContext)
        return jsonMapper.readTree(output.toByteArray())
    }

    @Test
    fun `answers the health check and the API through a function URL event`() {
        val health = invoke("GET", "/actuator/health")
        assertEquals(200, health["statusCode"].asInt())
        assertTrue("UP" in health["body"].asString())

        val summary = invoke("GET", "/api/summary/months", "year=2026")
        assertEquals(200, summary["statusCode"].asInt())
        assertEquals(12, jsonMapper.readTree(summary["body"].asString()).size())
    }
}
