package app.financetracker.model

/** The signed-in person, for the avatar. All null when there's no login. */
data class UserProfile(
    val name: String?,
    val email: String?,
    val pictureUrl: String?,
    /** true when the app is behind Google sign-in, so the UI can offer to sign out */
    val signInRequired: Boolean,
)
