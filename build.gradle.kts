plugins {
    kotlin("jvm") version "2.3.20"
    kotlin("plugin.spring") version "2.3.20"
    application
    jacoco
}

application { mainClass.set("erp.ApplicationKt") }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) } }
java { targetCompatibility = JavaVersion.VERSION_21 }
dependencyLocking { lockAllConfigurations() }
dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:4.0.10"))
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
    implementation("tools.jackson.module:jackson-module-kotlin")
    implementation(kotlin("reflect"))
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    runtimeOnly("org.flywaydb:flyway-mysql")
    runtimeOnly("org.mariadb.jdbc:mariadb-java-client")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("com.tngtech.archunit:archunit:1.4.1")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
val testSuite = providers.gradleProperty("testSuite").getOrElse("all")
tasks.test {
    useJUnitPlatform {
        when (testSuite) {
            "unit" -> includeTags("unit")
            "architecture" -> includeTags("architecture")
            "integration" -> excludeTags("unit", "architecture")
            "all" -> Unit
            else -> error("Unknown test suite: $testSuite")
        }
    }
}
jacoco { toolVersion = "0.8.14" }
tasks.jacocoTestReport {
    dependsOn(tasks.test)
    if (testSuite == "integration") {
        executionData(files("reports/unit.exec", "reports/architecture.exec"))
    }
    reports { xml.required.set(true); html.required.set(true) }
}
