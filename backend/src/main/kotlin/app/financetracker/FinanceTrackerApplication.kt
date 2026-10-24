package app.financetracker

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class FinanceTrackerApplication

fun main(args: Array<String>) {
    runApplication<FinanceTrackerApplication>(*args)
}
