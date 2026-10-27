package app.financetracker.controller

import app.financetracker.service.CurrentUser
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/me")
class UserController(private val currentUser: CurrentUser) {
    /** Name, email and photo of whoever is signed in. */
    @GetMapping fun profile() = currentUser.profile()
}
