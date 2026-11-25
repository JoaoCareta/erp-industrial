# Catálogo de versões

O Gradle valida as dependências resolvidas contra o lock durante o build. O npm instala o lockfile com `npm ci`. A distribuição do Gradle e as quatro imagens de serviço têm digest fixado. Este índice fica disponível offline no checkout.

| Componente | Versão | Consumidor e finalidade | Origem | Manual oficial | Versão publicada |
|---|---|---|---|---|---|
| org.springframework.boot:spring-boot-dependencies | 4.0.10 | Backend / spring-boot-dependencies | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-webmvc | 4.0.10 | Backend / spring-boot-starter-webmvc | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/web/) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-jdbc | 4.0.10 | Backend / spring-boot-starter-jdbc | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/data/sql.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-flyway | 4.0.10 | Backend / spring-boot-starter-flyway | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/data/sql.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-security-oauth2-resource-server | 4.0.10 | Backend / spring-boot-starter-security-oauth2-resource-server | gradle.lockfile | [API](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| tools.jackson.module:jackson-module-kotlin | 3.1.8 | Backend / jackson-module-kotlin | gradle.lockfile | [API](https://github.com/FasterXML/jackson-module-kotlin) | [Release](https://github.com/FasterXML/jackson-module-kotlin/tree/jackson-module-kotlin-3.1.8) |
| org.jetbrains.kotlin:kotlin-reflect | 2.3.20 | Backend / kotlin-reflect | gradle.lockfile | [API](https://kotlinlang.org/docs/reflection.html) | [Release](https://github.com/JetBrains/kotlin/tree/v2.3.20) |
| org.flywaydb:flyway-database-postgresql | 11.14.1 | Backend / flyway-database-postgresql | gradle.lockfile | [API](https://documentation.red-gate.com/flyway) | [Release](https://github.com/flyway/flyway/tree/flyway-11.14.1) |
| org.postgresql:postgresql | 42.7.14 | Backend / postgresql | gradle.lockfile | [API](https://jdbc.postgresql.org/documentation/) | [Release](https://github.com/pgjdbc/pgjdbc/tree/REL42.7.14) |
| org.springframework.boot:spring-boot-starter-webmvc-test | 4.0.10 | Backend / spring-boot-starter-webmvc-test | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/testing/) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.security:spring-security-test | 7.0.9 | Backend / spring-security-test | gradle.lockfile | [API](https://docs.spring.io/spring-security/reference/servlet/test/) | [Release](https://github.com/spring-projects/spring-security/tree/7.0.9) |
| com.tngtech.archunit:archunit | 1.4.1 | Backend / archunit | gradle.lockfile | [API](https://www.archunit.org/userguide/html/000_Index.html) | [Release](https://github.com/TNG/ArchUnit/tree/v1.4.1) |
| org.junit.platform:junit-platform-launcher | 6.0.3 | Backend / junit-platform-launcher | gradle.lockfile | [API](https://docs.junit.org/6.0.3/user-guide/) | [Release](https://github.com/junit-team/junit-framework/tree/r6.0.3) |
| org.jacoco:org.jacoco.agent | 0.8.14 | Backend / org.jacoco.agent | gradle.lockfile | [API](https://www.jacoco.org/jacoco/trunk/doc/) | [Release](https://github.com/jacoco/jacoco/tree/v0.8.14) |
| keycloak-js | 26.2.0 | Frontend / keycloak-js | frontend/package-lock.json | [API](https://www.keycloak.org/securing-apps/javascript-adapter) | [Release](https://www.npmjs.com/package/keycloak-js/v/26.2.0) |
| react | 19.2.4 | Frontend / react | frontend/package-lock.json | [API](https://react.dev/reference/react) | [Release](https://www.npmjs.com/package/react/v/19.2.4) |
| react-dom | 19.2.4 | Frontend / react-dom | frontend/package-lock.json | [API](https://react.dev/reference/react-dom) | [Release](https://www.npmjs.com/package/react-dom/v/19.2.4) |
| @playwright/test | 1.60.0 | Frontend / @playwright/test | frontend/package-lock.json | [API](https://playwright.dev/docs/intro) | [Release](https://www.npmjs.com/package/@playwright/test/v/1.60.0) |
| @testing-library/react | 16.3.2 | Frontend / @testing-library/react | frontend/package-lock.json | [API](https://testing-library.com/docs/react-testing-library/intro/) | [Release](https://www.npmjs.com/package/@testing-library/react/v/16.3.2) |
| @types/react | 19.2.14 | Frontend / @types/react | frontend/package-lock.json | [API](https://github.com/DefinitelyTyped/DefinitelyTyped) | [Release](https://www.npmjs.com/package/@types/react/v/19.2.14) |
| @types/react-dom | 19.2.3 | Frontend / @types/react-dom | frontend/package-lock.json | [API](https://github.com/DefinitelyTyped/DefinitelyTyped) | [Release](https://www.npmjs.com/package/@types/react-dom/v/19.2.3) |
| @vitest/coverage-v8 | 5.1.2 | Frontend / @vitest/coverage-v8 | frontend/package-lock.json | [API](https://vitest.dev/guide/coverage) | [Release](https://www.npmjs.com/package/@vitest/coverage-v8/v/5.1.2) |
| jsdom | 26.1.0 | Frontend / jsdom | frontend/package-lock.json | [API](https://github.com/jsdom/jsdom) | [Release](https://www.npmjs.com/package/jsdom/v/26.1.0) |
| typescript | 5.9.3 | Frontend / typescript | frontend/package-lock.json | [API](https://www.typescriptlang.org/docs/) | [Release](https://www.npmjs.com/package/typescript/v/5.9.3) |
| vite | 8.3.8 | Frontend / vite | frontend/package-lock.json | [API](https://vite.dev/guide/) | [Release](https://www.npmjs.com/package/vite/v/8.3.8) |
| vitest | 5.1.2 | Frontend / vitest | frontend/package-lock.json | [API](https://vitest.dev/guide/) | [Release](https://www.npmjs.com/package/vitest/v/5.1.2) |
| Gradle | 9.1.0 | Ambiente | gradle/wrapper/gradle-wrapper.properties | [API](https://docs.gradle.org/9.1.0/userguide/userguide.html) | [Release](https://docs.gradle.org/9.1.0/release-notes.html) |
| Kotlin | 2.3.20 | Ambiente | build.gradle.kts | [API](https://kotlinlang.org/docs/home.html) | [Release](https://github.com/JetBrains/kotlin/releases/tag/v2.3.20) |
| PostgreSQL | 17.9 | Ambiente | compose.yaml | [API](https://www.postgresql.org/docs/17/) | [Release](https://www.postgresql.org/docs/17/release-17-9.html) |
| Keycloak | 26.6.1 | Ambiente | compose.yaml | [API](https://www.keycloak.org/documentation) | [Release](https://github.com/keycloak/keycloak/releases/tag/26.6.1) |
| Node.js | 24.12.0 | Ambiente | .github/workflows/verify.yml | [API](https://nodejs.org/docs/latest-v24.x/api/) | [Release](https://nodejs.org/en/blog/release/v24.12.0) |
| JDK | 25 | Ambiente | .github/workflows/verify.yml | [API](https://docs.oracle.com/en/java/javase/25/) | [Release](https://openjdk.org/projects/jdk/25/) |
| nginx | 1.28 | Ambiente | compose.yaml | [API](https://nginx.org/en/docs/) | [Release](https://nginx.org/en/CHANGES-1.28) |
