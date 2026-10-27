package app.financetracker.controller

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest
@AutoConfigureMockMvc
class ApiTest(@Autowired val mockMvc: MockMvc) {
    // Each test starts from the seed; resetting is much cheaper than a fresh Spring context per test.
    @BeforeEach
    fun reset() {
        mockMvc.post("/api/data/reset").andExpect { status { isOk() } }
    }

    @Test
    fun `serves the sample data in the frontend's shape`() {
        mockMvc.get("/api/data").andExpect {
            status { isOk() }
            jsonPath("$.version") { value(2) }
            jsonPath("$.sample") { value(true) }
            jsonPath("$.categories[0].type") { value("income") }
            jsonPath("$.netWorth.accounts[0].group") { value("Cash") }
            jsonPath("$.plan.payFrequency") { exists() }
            jsonPath("$.subscriptions[0].id") { exists() }
            jsonPath("$.entries[0].month") { doesNotExist() }
        }
    }

    @Test
    fun `upserts and deletes an entry by the client's id`() {
        val body = """{"id":"","date":"2026-03-04","type":"expense","category":"Food","subcategory":"Groceries","description":"Test","amount":12.5}"""
        mockMvc.put("/api/entries/e-test") { contentType = MediaType.APPLICATION_JSON; content = body }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("e-test") }
        }
        mockMvc.get("/api/entries?year=2026&month=3").andExpect { jsonPath("$[?(@.id == 'e-test')].amount") { value(12.5) } }
        mockMvc.delete("/api/entries/e-test").andExpect { status { isNoContent() } }
        mockMvc.get("/api/entries?year=2026&month=3").andExpect { jsonPath("$[?(@.id == 'e-test')]") { isEmpty() } }
    }

    @Test
    fun `rejects bad input with 400`() {
        val body = """{"id":"","date":"March 4","type":"expense","category":"Food","subcategory":"Groceries","description":"","amount":1}"""
        mockMvc.put("/api/entries/x") { contentType = MediaType.APPLICATION_JSON; content = body }.andExpect { status { isBadRequest() } }
        mockMvc.get("/api/entries?month=3").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `renames a subcategory whose name has a slash`() {
        val body = """{"name":"Hobbies/Toys"}"""
        mockMvc.put("/api/categories/exp-entertainment/subcategories?name={n}", "Hobby/Toys") { contentType = MediaType.APPLICATION_JSON; content = body }
            .andExpect { status { isOk() } }
        mockMvc.put("/api/categories/exp-entertainment/subcategories?name={n}", "Hobbies/Toys") { contentType = MediaType.APPLICATION_JSON; content = """{"name":"Spare/Unused"}""" }
            .andExpect { status { isOk() } }
        mockMvc.get("/api/categories").andExpect { jsonPath("$[?(@.id == 'exp-entertainment')].subcategories[*]") { value(org.hamcrest.Matchers.hasItem("Spare/Unused")) } }
    }

    @Test
    fun `refuses to delete a category with entries`() {
        mockMvc.delete("/api/categories/exp-food").andExpect { status { isConflict() } }
    }

    @Test
    fun `plan summary and loan schedule`() {
        mockMvc.get("/api/plan/summary").andExpect {
            status { isOk() }
            jsonPath("$.perYear") { value(26) }
            jsonPath("$.monthly.takeHome") { isNumber() }
        }
        mockMvc.get("/api/plan/loans/p5/schedule").andExpect {
            status { isOk() }
            jsonPath("$.rows.length()") { value(60) }
        }
        mockMvc.get("/api/plan/loans/nope/schedule").andExpect { status { isNotFound() } }
    }

    @Test
    fun `month totals and net worth series`() {
        mockMvc.get("/api/summary/months?year=2026").andExpect { jsonPath("$.length()") { value(12) } }
        mockMvc.get("/api/net-worth/series").andExpect { jsonPath("$[0].byGroup.Cash") { isNumber() } }
    }

    @Test
    fun `health check for the load balancer`() {
        mockMvc.get("/actuator/health").andExpect { jsonPath("$.status") { value("UP") } }
    }
}
