param([string]$Base, [ValidateSet('All','Integration','E2E')][string]$Stage = 'All')
. "$PSScriptRoot/common.ps1"
$project = 'erp-check-' + [guid]::NewGuid().ToString('N')
$env:COMPOSE_FILE = 'compose.yaml' + [IO.Path]::PathSeparator + 'infra/compose.verify.yaml'
$env:ERP_VERIFY_PROJECT = $project
$env:DB_PORT = '55433'
$env:WEB_PORT = '18081'
$env:WEB_ORIGIN = 'http://localhost:18081'
$env:DB_URL = "jdbc:postgresql://localhost:$($env:DB_PORT)/erp"
$env:DB_USER = 'erp'
$env:DB_PASSWORD = 'local-demo'
$env:OIDC_ISSUER = "$env:WEB_ORIGIN/auth/realms/industrial"
$env:OIDC_JWKS = "$env:OIDC_ISSUER/protocol/openid-connect/certs"
$env:SPRING_FLYWAY_LOCATIONS = 'classpath:db/migration,classpath:db/demo'
try {
    New-Item -ItemType Directory -Force reports | Out-Null
    docker compose -p $project up -d --wait db
    if ($Stage -ne 'E2E') { & "$PSScriptRoot/upgrade.ps1" -Project $project }
    if ($Stage -eq 'Integration') {
        & $Gradle test --rerun jacocoTestReport '-PtestSuite=integration'
        return
    }
    if ($Stage -eq 'All') {
        & $Gradle test --rerun jacocoTestReport installDist
        Frontend @('run','build')
        Frontend @('test')
        Frontend @('audit','--audit-level=critical')
        python scripts/advisories.py
    }
    $env:PLAYWRIGHT_JUNIT_OUTPUT_NAME = '../reports/journeys.xml'
    Start-Erp $project 18081
    Frontend @('exec','--','playwright','install','chromium')
    Frontend @('run','e2e','--','access.spec.ts','engineering.spec.ts')
    docker compose -p $project restart api
    Wait-Endpoint 'http://localhost:18081/api/ready'
    $env:PLAYWRIGHT_JUNIT_OUTPUT_NAME = '../reports/history.xml'
    Frontend @('run','e2e','--','history.spec.ts')
    if ($Stage -eq 'E2E') { return }
    python scripts/acceptance.py
    python scripts/catalog.py
    python scripts/test_coverage.py
    if ($Base) { python scripts/coverage.py --base $Base } else { python scripts/coverage.py }
} finally {
    docker compose -p $project down -v --remove-orphans
}
