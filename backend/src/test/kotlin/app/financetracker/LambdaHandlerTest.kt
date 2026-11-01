package app.financetracker

import com.amazonaws.services.lambda.runtime.Context
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.ByteArrayOutputStream
import java.lang.reflect.Proxy
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Feeds the handler what a Lambda function URL sends (payload format 2.0), without AWS, including the
 * X-Forwarded-* headers function URLs and CloudFront add (these once turned every request into a 400).
 */
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
          "headers": {"host": "example.lambda-url.us-east-1.on.aws", "accept": "*/*", "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https", "x-forwarded-port": "443", "x-forwarded-host": "d111.cloudfront.net"},
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

    @Test
    fun `every cookie goes into the cookies array function URLs read`() {
        val containerResponse = jsonMapper.readTree(
            """
            {"statusCode": 302, "isBase64Encoded": false, "body": "",
             "headers": {"Location": "https://accounts.google.com/o/oauth2/v2/auth", "Set-Cookie": "XSRF-TOKEN=a; Path=/; Secure"},
             "multiValueHeaders": {
               "Location": ["https://accounts.google.com/o/oauth2/v2/auth"],
               "Set-Cookie": ["XSRF-TOKEN=a; Path=/; Secure", "SESSION=b; Path=/; Secure; HttpOnly; SameSite=Lax"],
               "Vary": ["Origin", "Accept"]
             }}
            """,
        )
        val functionUrlResponse = LambdaHandler.toFunctionUrlResponse(containerResponse)
        assertEquals<List<String>>(
            listOf("XSRF-TOKEN=a; Path=/; Secure", "SESSION=b; Path=/; Secure; HttpOnly; SameSite=Lax"),
            functionUrlResponse["cookies"].values().map { cookie -> cookie.asString() },
        )
        assertEquals(302, functionUrlResponse["statusCode"].asInt())
        assertEquals("https://accounts.google.com/o/oauth2/v2/auth", functionUrlResponse["headers"]["Location"].asString())
        assertEquals("Origin,Accept", functionUrlResponse["headers"]["Vary"].asString())
        assertTrue(functionUrlResponse["headers"]["Set-Cookie"] == null)
    }

    @Test
    fun `serves static files byte for byte, non-ASCII characters included`() {
        val expected = javaClass.getResource("/static/charset-check.js")!!.readBytes()
        val response = invoke("GET", "/charset-check.js")
        assertEquals(200, response["statusCode"].asInt())
        val body = response["body"].asString()
        val served = if (response["isBase64Encoded"].asBoolean()) java.util.Base64.getDecoder().decode(body) else body.toByteArray(Charsets.UTF_8)
        assertTrue(expected.contentEquals(served), "served: " + String(served, Charsets.UTF_8))
    }
}
