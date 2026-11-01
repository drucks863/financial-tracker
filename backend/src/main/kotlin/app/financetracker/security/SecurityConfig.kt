package app.financetracker.security

import app.financetracker.service.CurrentUser
import app.financetracker.service.LocalUser
import app.financetracker.repository.FinanceProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.core.Ordered
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
import org.slf4j.LoggerFactory
import org.springframework.web.util.HtmlUtils
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import org.springframework.session.config.annotation.web.http.EnableSpringHttpSession
import org.springframework.session.web.http.CookieSerializer
import org.springframework.session.web.http.DefaultCookieSerializer
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import java.net.URI
import java.time.Duration

@ConfigurationProperties("finance.auth")
data class AuthProperties(
    val mode: AuthMode = AuthMode.NONE,
    /** Google accounts allowed in (google mode). Anyone else is turned away after signing in. */
    val allowedEmails: List<String> = emptyList(),
    /** Where sign-in sessions live: the servlet container's memory, or DynamoDB (needed on Lambda). */
    val sessionStore: SessionStore = SessionStore.CONTAINER,
    /** How long a sign-in lasts without use. */
    val sessionLength: Duration = Duration.ofDays(30),
    /** The public address when the app sits behind CloudFront (see [PublicUrlFilter]); unset locally. */
    val publicUrl: URI? = null,
)

enum class SessionStore { CONTAINER, DYNAMODB }

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
 * Google sign-in. The whole app sits behind it except the health check and the app icons: a browser is sent to Google,
 * and /api answers 401 so the UI can send the browser there itself when a session runs out.
 * The session is a server-side cookie; writes need the XSRF-TOKEN cookie echoed in X-XSRF-TOKEN.
 */
@Configuration
@ConditionalOnProperty("finance.auth.mode", havingValue = "google")
class GoogleSignInSecurityConfig(private val authProperties: AuthProperties) {
    private val logger = LoggerFactory.getLogger(GoogleSignInSecurityConfig::class.java)

    init {
        check(authProperties.allowedEmails.isNotEmpty()) { "finance.auth.allowed-emails must list who may sign in" }
    }

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { requests ->
            requests.requestMatchers("/actuator/health", "/actuator/health/**", "/error").permitAll()
            // App icons and the web app manifest: browsers fetch the manifest without cookies, and a phone
            // saving the site to its home screen may ask for the icons before anyone has signed in
            requests.requestMatchers(*PUBLIC_ICON_PATHS).permitAll()
            requests.anyRequest().authenticated()
        }
        .oauth2Login { login ->
            login.userInfoEndpoint { userInfo -> userInfo.oidcUserService(allowedGoogleUsers()) }
            // Always land on the app's home page. The UI routes with #hashes, so there's no deeper page
            // worth returning to, and Spring's "/?continue" return address got stuck on Lambda.
            login.defaultSuccessUrl("/", true)
            // Answer a failed sign-in with a page saying why. Redirecting anywhere protected would
            // send the browser straight back to Google, round and round.
            login.failureHandler { _, response, exception ->
                logger.warn("Google sign-in failed: {}", exception.message)
                response.status = HttpStatus.UNAUTHORIZED.value()
                response.contentType = "text/html;charset=UTF-8"
                response.writer.write(signInFailedPage(exception.message ?: "Unknown error"))
            }
        }
        .logout { logout -> logout.logoutSuccessUrl("/") }
        .exceptionHandling { exceptions ->
            exceptions.defaultAuthenticationEntryPointFor(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), PathPatternRequestMatcher.pathPattern("/api/**"))
            exceptions.defaultAuthenticationEntryPointFor(LoginUrlAuthenticationEntryPoint(GOOGLE_SIGN_IN_PATH), PathPatternRequestMatcher.pathPattern("/**"))
        }
        .csrf { csrf -> csrf.spa() }
        .build()

    @Bean
    fun currentUser(): CurrentUser = GoogleUser()

    /** Runs before Spring Security, so its redirects already see the public address. */
    @Bean
    fun publicUrlFilter(): FilterRegistrationBean<PublicUrlFilter>? = authProperties.publicUrl?.let { publicUrl ->
        FilterRegistrationBean(PublicUrlFilter(publicUrl)).apply { order = Ordered.HIGHEST_PRECEDENCE }
    }

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

        /** The files in frontend/public that a browser or phone needs before sign-in. */
        val PUBLIC_ICON_PATHS = arrayOf(
            "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png",
            "/icon-maskable-512.png", "/site.webmanifest",
        )

        fun signInFailedPage(reason: String) = """
            <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Sign-in didn't work</title></head>
            <body style="font-family:system-ui,sans-serif;background:#111;color:#eee;padding:24px;max-width:32rem;margin:auto">
            <h1 style="font-size:1.25rem">Sign-in didn't work</h1>
            <p>${HtmlUtils.htmlEscape(reason)}</p>
            <p><a style="color:#ccc" href="$GOOGLE_SIGN_IN_PATH">Try again</a></p>
            </body></html>
        """.trimIndent()
    }
}

/** Sessions in the DynamoDB table, so any Lambda instance can serve a signed-in request. */
@Configuration
@EnableSpringHttpSession
@ConditionalOnProperty("finance.auth.session-store", havingValue = "dynamodb")
class DynamoDbSessionConfig {
    @Bean
    fun sessionRepository(dynamoDbClient: DynamoDbClient, financeProperties: FinanceProperties, authProperties: AuthProperties) =
        DynamoDbSessionRepository(dynamoDbClient, financeProperties.dynamodb.tableName, authProperties.sessionLength)

    /** Stays signed in across browser restarts for as long as the session lasts. */
    @Bean
    fun cookieSerializer(authProperties: AuthProperties): CookieSerializer = DefaultCookieSerializer().apply {
        setSameSite("Lax")
        setUseSecureCookie(true)
        setCookieMaxAge(authProperties.sessionLength.seconds.toInt())
    }
}
