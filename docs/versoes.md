# Catálogo de versões

O Gradle valida as dependências resolvidas contra o lock durante o build. O npm instala o lockfile com `npm ci`. A distribuição do Gradle, as quatro imagens do ERP e a imagem PostgreSQL do ensaio de migração têm digest fixado. Este índice fica disponível offline no checkout.

| Componente | Versão | Consumidor e finalidade | Origem | Manual oficial | Versão publicada |
|---|---|---|---|---|---|
| org.springframework.boot:spring-boot-dependencies | 4.0.10 | Backend / spring-boot-dependencies | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-webmvc | 4.0.10 | Backend / spring-boot-starter-webmvc | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/web/) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-jdbc | 4.0.10 | Backend / spring-boot-starter-jdbc | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/data/sql.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-flyway | 4.0.10 | Backend / spring-boot-starter-flyway | gradle.lockfile | [API](https://docs.spring.io/spring-boot/4.0/reference/data/sql.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| org.springframework.boot:spring-boot-starter-security-oauth2-resource-server | 4.0.10 | Backend / spring-boot-starter-security-oauth2-resource-server | gradle.lockfile | [API](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) | [Release](https://github.com/spring-projects/spring-boot/tree/v4.0.10) |
| tools.jackson.module:jackson-module-kotlin | 3.1.8 | Backend / jackson-module-kotlin | gradle.lockfile | [API](https://github.com/FasterXML/jackson-module-kotlin) | [Release](https://github.com/FasterXML/jackson-module-kotlin/tree/jackson-module-kotlin-3.1.8) |
| org.jetbrains.kotlin:kotlin-reflect | 2.3.20 | Backend / kotlin-reflect | gradle.lockfile | [API](https://kotlinlang.org/docs/reflection.html) | [Release](https://github.com/JetBrains/kotlin/tree/v2.3.20) |
| org.flywaydb:flyway-mysql | 11.14.1 | Backend / migrações MariaDB | gradle.lockfile | [API](https://documentation.red-gate.com/flyway/reference/database-driver-reference/mariadb) | [Release](https://github.com/flyway/flyway/tree/flyway-11.14.1) |
| org.mariadb.jdbc:mariadb-java-client | 3.5.11 | Backend / MariaDB Connector/J | gradle.lockfile | [API](https://mariadb.com/docs/connectors/mariadb-connector-j/about-mariadb-connector-j) | [Release](https://github.com/mariadb-corporation/mariadb-connector-j/releases/tag/3.5.11) |
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
| MariaDB | 11.4.13 | Banco do ERP | compose.yaml | [API](https://mariadb.com/docs/server) | [Release](https://mariadb.com/docs/release-notes/community-server/11.4/11.4.13) |
| PostgreSQL | 17.9 | Origem descartável no ensaio de migração | infra/compose.migration-source.yaml | [API](https://www.postgresql.org/docs/17/) | [Release](https://www.postgresql.org/docs/17/release-17-9.html) |
| psycopg[binary] | 3.2.13 | Migração / leitura do PostgreSQL | scripts/migration-requirements.txt | [API](https://www.psycopg.org/psycopg3/docs/) | [Release](https://pypi.org/project/psycopg/3.2.13/) |
| PyMySQL | 1.1.2 | Migração / escrita no MariaDB | scripts/migration-requirements.txt | [API](https://pymysql.readthedocs.io/en/latest/) | [Release](https://pypi.org/project/PyMySQL/1.1.2/) |
| Keycloak | 26.6.1 | Ambiente | compose.yaml | [API](https://www.keycloak.org/documentation) | [Release](https://github.com/keycloak/keycloak/releases/tag/26.6.1) |
| Node.js | 24.12.0 | Ambiente | .github/workflows/verify.yml | [API](https://nodejs.org/docs/latest-v24.x/api/) | [Release](https://nodejs.org/en/blog/release/v24.12.0) |
| JDK | 25 | Ambiente | .github/workflows/verify.yml | [API](https://docs.oracle.com/en/java/javase/25/) | [Release](https://openjdk.org/projects/jdk/25/) |
| GitHub REST API | 2022-11-28 | Consulta ao PR que introduziu o commit de produção | scripts/merged_release.py | [API](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-pull-requests-associated-with-a-commit) | [Release](https://docs.github.com/en/rest/about-the-rest-api/api-versions) |
| nginx | 1.28 | Ambiente | compose.yaml | [API](https://nginx.org/en/docs/) | [Release](https://nginx.org/en/CHANGES-1.28) |
