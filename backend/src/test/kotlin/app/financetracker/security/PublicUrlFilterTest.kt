package app.financetracker.security

import jakarta.servlet.http.HttpServletRequest
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.net.URI
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PublicUrlFilterTest {
    @Test
    fun `requests look like they reached the public address`() {
        val lambdaRequest = MockHttpServletRequest("GET", "/api/data").apply {
            scheme = "http"
            serverName = "abc.lambda-url.us-east-1.on.aws"
            serverPort = 8080
        }
        val filterChain = MockFilterChain()
        PublicUrlFilter(URI("https://d111.cloudfront.net")).doFilter(lambdaRequest, MockHttpServletResponse(), filterChain)
        val seenByApp = filterChain.request as HttpServletRequest

        // what Spring Security saves as "the page you asked for" and returns to after sign-in
        assertEquals("https://d111.cloudfront.net/api/data", seenByApp.requestURL.toString())
        assertEquals("d111.cloudfront.net", seenByApp.serverName)
        assertEquals(443, seenByApp.serverPort)
        assertTrue(seenByApp.isSecure)
    }
}
