package app.financetracker.controller

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "finance.auth.mode=google",
        "finance.auth.allowed-emails=devin@example.com",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "spring.security.oauth2.client.registration.google.scope=openid,profile,email",
    ],
)
@AutoConfigureMockMvc
class GoogleSignInTest(@Autowired val mockMvc: MockMvc) {
    private fun signedInAs(subject: String) = oidcLogin().idToken { token ->
        token.subject(subject).claim("email", "devin@example.com").claim("name", "Devin").claim("picture", "https://example.com/photo.jpg")
    }

    private val entryBody = """{"id":"","date":"2026-03-04","type":"expense","category":"Food","subcategory":"Groceries","description":"Mine","amount":12.5}"""

    @Test
    fun `the API answers 401 before sign-in, and pages send the browser to Google`() {
        mockMvc.get("/api/data").andExpect { status { isUnauthorized() } }
        mockMvc.get("/").andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/oauth2/authorization/google")
        }
    }

    @Test
    fun `the health check stays open for Beanstalk`() {
        mockMvc.get("/actuator/health").andExpect { status { isOk() } }
    }

    @Test
    fun `shows who is signed in`() {
        mockMvc.get("/api/me") { with(signedInAs("google-subject-1")) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Devin") }
            jsonPath("$.email") { value("devin@example.com") }
            jsonPath("$.pictureUrl") { value("https://example.com/photo.jpg") }
            jsonPath("$.signInRequired") { value(true) }
        }
    }

    @Test
    fun `writes need the CSRF token`() {
        mockMvc.put("/api/entries/e-csrf") { with(signedInAs("google-subject-1")); contentType = MediaType.APPLICATION_JSON; content = entryBody }
            .andExpect { status { isForbidden() } }
        mockMvc.put("/api/entries/e-csrf") { with(signedInAs("google-subject-1")); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = entryBody }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `each Google account has its own data`() {
        mockMvc.put("/api/entries/e-private") { with(signedInAs("google-subject-a")); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = entryBody }
            .andExpect { status { isOk() } }
        mockMvc.get("/api/entries?year=2026&month=3") { with(signedInAs("google-subject-a")) }
            .andExpect { jsonPath("$[?(@.id == 'e-private')]") { isNotEmpty() } }
        mockMvc.get("/api/entries?year=2026&month=3") { with(signedInAs("google-subject-b")) }
            .andExpect { jsonPath("$[?(@.id == 'e-private')]") { isEmpty() } }
    }
}
