package app.financetracker.service

import app.financetracker.model.UserProfile

/**
 * Who the request is for. Every repository call is keyed by [id], so data is already per person.
 * Which implementation runs depends on `finance.auth.mode` (see security/SecurityConfig):
 * [LocalUser] without a login, GoogleUser with Google sign-in.
 */
interface CurrentUser {
    fun id(): String
    fun profile(): UserProfile
}

/** No login (local runs, tests): everyone is the same local user. */
class LocalUser : CurrentUser {
    override fun id() = "local"
    override fun profile() = UserProfile(name = null, email = null, pictureUrl = null, signInRequired = false)
}
