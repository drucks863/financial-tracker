package app.financetracker.web

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ApiTest(@Autowired val mvc: MockMvc) {

    @Test
    fun `serves the sample data in the frontend's shape`() {
        mvc.get("/api/data").andExpect {
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
        mvc.put("/api/entries/e-test") { contentType = MediaType.APPLICATION_JSON; content = body }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("e-test") }
        }
        mvc.get("/api/entries?year=2026&month=3").andExpect { jsonPath("$[?(@.id == 'e-test')].amount") { value(12.5) } }
        mvc.delete("/api/entries/e-test").andExpect { status { isNoContent() } }
        mvc.get("/api/entries?year=2026&month=3").andExpect { jsonPath("$[?(@.id == 'e-test')]") { isEmpty() } }
    }

    @Test
    fun `rejects bad input with 400`() {
        val body = """{"id":"","date":"March 4","type":"expense","category":"Food","subcategory":"Groceries","description":"","amount":1}"""
        mvc.put("/api/entries/x") { contentType = MediaType.APPLICATION_JSON; content = body }.andExpect { status { isBadRequest() } }
        mvc.get("/api/entries?month=3").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `refuses to delete a category with entries`() {
        mvc.delete("/api/categories/exp-food").andExpect { status { isConflict() } }
    }

    @Test
    fun `plan summary and loan schedule`() {
        mvc.get("/api/plan/summary").andExpect {
            status { isOk() }
            jsonPath("$.perYear") { value(26) }
            jsonPath("$.monthly.takeHome") { isNumber() }
        }
        mvc.get("/api/plan/loans/p5/schedule").andExpect {
            status { isOk() }
            jsonPath("$.rows.length()") { value(60) }
        }
        mvc.get("/api/plan/loans/nope/schedule").andExpect { status { isNotFound() } }
    }

    @Test
    fun `month totals and net worth series`() {
        mvc.get("/api/summary/months?year=2026").andExpect { jsonPath("$.length()") { value(12) } }
        mvc.get("/api/net-worth/series").andExpect { jsonPath("$[0].byGroup.Cash") { isNumber() } }
    }

    @Test
    fun `health check for the load balancer`() {
        mvc.get("/actuator/health").andExpect { jsonPath("$.status") { value("UP") } }
    }
}
