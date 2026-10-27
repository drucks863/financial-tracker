package app.financetracker.security

import app.financetracker.model.UserProfile
import app.financetracker.service.CurrentUser
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.oidc.user.OidcUser

/** The person signed in with Google. Their data is keyed by Google's `sub`, which never changes for an account. */
class GoogleUser : CurrentUser {
    private fun googleUser(): OidcUser =
        SecurityContextHolder.getContext().authentication?.principal as? OidcUser
            ?: error("No Google user signed in; the security filter chain should have stopped this request")

    override fun id(): String = googleUser().subject ?: error("Google sent no subject")

    override fun profile(): UserProfile = googleUser().let { googleUser ->
        UserProfile(name = googleUser.fullName, email = googleUser.email, pictureUrl = googleUser.picture, signInRequired = true)
    }
}
