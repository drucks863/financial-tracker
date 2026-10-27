package app.financetracker.security

import app.financetracker.service.CurrentUser
import app.financetracker.service.LocalUser
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher

@ConfigurationProperties("finance.auth")
data class AuthProperties(
    val mode: AuthMode = AuthMode.NONE,
    /** Google accounts allowed in (google mode). Anyone else is turned away after signing in. */
    val allowedEmails: List<String> = emptyList(),
)

enum class AuthMode {
    /** No login: everyone is the local user. For local runs and tests only. */
    NONE,

    /** Google sign-in (OIDC). Needs the Google client id and secret; see docs/deploy.md. */
    GOOGLE,
}

/** No login, as before Google sign-in existed. */
@Configuration
@ConditionalOnProperty("finance.auth.mode", havingValue = "none", matchIfMissing = true)
class NoLoginSecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { requests -> requests.anyRequest().permitAll() }
        .csrf { csrf -> csrf.disable() }
        .build()

    @Bean
    fun currentUser(): CurrentUser = LocalUser()
}

/**
 * Google sign-in. The whole app sits behind it except the health check: a browser is sent to Google,
 * and /api answers 401 so the UI can send the browser there itself when a session runs out.
 * The session is a server-side cookie; writes need the XSRF-TOKEN cookie echoed in X-XSRF-TOKEN.
 */
@Configuration
@ConditionalOnProperty("finance.auth.mode", havingValue = "google")
class GoogleSignInSecurityConfig(private val authProperties: AuthProperties) {
    init {
        check(authProperties.allowedEmails.isNotEmpty()) { "finance.auth.allowed-emails must list who may sign in" }
    }

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { requests ->
            requests.requestMatchers("/actuator/health", "/actuator/health/**", "/error").permitAll()
            requests.anyRequest().authenticated()
        }
        .oauth2Login { login -> login.userInfoEndpoint { userInfo -> userInfo.oidcUserService(allowedGoogleUsers()) } }
        .logout { logout -> logout.logoutSuccessUrl("/") }
        .exceptionHandling { exceptions ->
            exceptions.defaultAuthenticationEntryPointFor(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), PathPatternRequestMatcher.pathPattern("/api/**"))
            exceptions.defaultAuthenticationEntryPointFor(LoginUrlAuthenticationEntryPoint(GOOGLE_SIGN_IN_PATH), PathPatternRequestMatcher.pathPattern("/**"))
        }
        .csrf { csrf -> csrf.spa() }
        .build()

    @Bean
    fun currentUser(): CurrentUser = GoogleUser()

    /** Google's user, turned away unless their verified email is on the allowed list. */
    private fun allowedGoogleUsers(): OAuth2UserService<OidcUserRequest, OidcUser> {
        val allowedEmails = authProperties.allowedEmails.map { it.trim().lowercase() }.toSet()
        val googleUserService = OidcUserService()
        return OAuth2UserService { userRequest ->
            val googleUser = googleUserService.loadUser(userRequest)
            val email = googleUser.email?.lowercase()
            if (googleUser.emailVerified != true || email !in allowedEmails) {
                throw OAuth2AuthenticationException(OAuth2Error("access_denied", "This Google account isn't allowed in", null))
            }
            googleUser
        }
    }

    companion object {
        const val GOOGLE_SIGN_IN_PATH = "/oauth2/authorization/google"
    }
}
