package erp

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.bind.annotation.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus

@SpringBootApplication
class Application {
    @Bean fun security(http: HttpSecurity): SecurityFilterChain = http
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests { it.requestMatchers("/api/ready").permitAll().anyRequest().authenticated() }
        .oauth2ResourceServer { it.jwt(Customizer.withDefaults()) }.build()
}
fun main(args: Array<String>) { runApplication<Application>(*args) }

@RestController
class Readiness(private val db: JdbcTemplate) {
    @GetMapping("/api/ready") fun ready() = mapOf("migrations" to db.queryForObject(
        "select count(*) from flyway_schema_history where success", Long::class.java))
}

@RestControllerAdvice
class Errors {
    @ExceptionHandler(IllegalArgumentException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun invalid(error: IllegalArgumentException) = mapOf("error" to error.message)
    @ExceptionHandler(DuplicateKeyException::class)
    @ResponseStatus(HttpStatus.CONFLICT)
    fun duplicate() = mapOf("error" to "Código já cadastrado")
}
