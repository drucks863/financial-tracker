package app.financetracker.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI

/**
 * Makes every request look like it arrived at [publicUrl] (the CloudFront https address), so the
 * redirects Spring Security builds (to sign-in, back to the page you asked for) point there and not
 * at the Lambda function URL behind it. Used instead of X-Forwarded-* handling: Spring's forwarded
 * header filter rejects the requests aws-serverless-java-container builds, and Lambda function URLs
 * add those headers to every request.
 */
class PublicUrlFilter(publicUrl: URI) : OncePerRequestFilter() {
    // named apart from the request's own scheme/serverName/serverPort, which the wrapper overrides
    private val publicScheme = publicUrl.scheme
    private val publicHost = publicUrl.host
    private val publicPort = if (publicUrl.port != -1) publicUrl.port else if (publicScheme == "https") 443 else 80

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        filterChain.doFilter(PublicUrlRequest(request), response)
    }

    private inner class PublicUrlRequest(request: HttpServletRequest) : HttpServletRequestWrapper(request) {
        override fun getScheme(): String = publicScheme
        override fun getServerName(): String = publicHost
        override fun getServerPort(): Int = publicPort
        override fun isSecure(): Boolean = publicScheme == "https"
        override fun getRequestURL(): StringBuffer {
            val defaultPort = (publicScheme == "https" && publicPort == 443) || (publicScheme == "http" && publicPort == 80)
            return StringBuffer("$publicScheme://$publicHost").apply {
                if (!defaultPort) append(":").append(publicPort)
                append(requestURI)
            }
        }
    }
}
