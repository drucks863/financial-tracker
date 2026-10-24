package app.financetracker.user

import org.springframework.stereotype.Component

/**
 * Who the request is for. Every repository call is keyed by this id, so data is already
 * per person. Google SSO will replace [LocalUser] with an implementation that reads the
 * signed-in principal (its `sub` claim); nothing else should need to change.
 */
fun interface CurrentUser {
    fun id(): String
}

/** No login yet: everyone is the same local user. */
@Component
class LocalUser : CurrentUser {
    override fun id() = "local"
}
