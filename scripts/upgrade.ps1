# Rehearse both engine upgrades inside verify.ps1's disposable projects.
param([Parameter(Mandatory)][string]$Project)
. "$PSScriptRoot/common.ps1"
if ($Project -notmatch '^erp-check-[0-9a-f]{32}$') { throw 'Use verify.ps1' }

$workspace = (New-Item -ItemType Directory -Force "build/upgrade/$Project").FullName
$postgresProject = "$Project-source"
$postgresCompose = @('compose', '-p', $postgresProject, '-f', 'infra/compose.migration-source.yaml')
$originalUrl = $env:DB_URL
$catalogGroup = $env:ERP_LEGACY_CATALOG_GROUP
$reference = $env:ERP_REFERENCE
$fixtureHistory = $env:ERP_FIXTURE_HISTORY
$locations = $env:SPRING_FLYWAY_LOCATIONS
$sourcePassword = $env:ERP_SOURCE_PASSWORD
$targetPassword = $env:ERP_TARGET_PASSWORD

function Export-Revision([string]$Revision, [string]$Directory) {
    git archive --format=zip --output="$workspace/$Directory.zip" $Revision
    Expand-Archive "$workspace/$Directory.zip" "$workspace/$Directory"
}

function Test-Transfer([string]$History, [string]$SourceDatabase, [string]$TargetDatabase) {
    # A rolled-back batch may leave the source sequence ahead of any stored row.
    docker @postgresCompose exec -T postgres-source psql -U erp -d $SourceDatabase -v ON_ERROR_STOP=1 -c "select setval('access_audit_id_seq',2000000)"
    $grant = "CREATE DATABASE $TargetDatabase; GRANT ALL ON $TargetDatabase.* TO 'erp'@'%';"
    $grant | docker compose -p $Project exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -u root'
    $env:DB_URL = $originalUrl -replace '/erp$', "/$TargetDatabase"
    $env:SPRING_FLYWAY_LOCATIONS = 'classpath:db/migration'
    & $Gradle test --rerun --tests erp.UpgradeTargetTest

    $connection = @('--source-host', '127.0.0.1', '--source-port', $sourcePort, '--source-user', 'erp', '--source-database', $SourceDatabase,
        '--target-host', '127.0.0.1', '--target-port', $env:DB_PORT, '--target-user', 'erp', '--target-database', $TargetDatabase)
    if ($History -eq 'scoped') { & $python scripts/upgrade/check_transfer.py @connection }
    & $python scripts/migrate_database.py @connection
    & $python scripts/migrate_database.py @connection
    & $Gradle test --rerun --tests erp.UpgradeTest
    if ($History -eq 'legacy') { & $Gradle test --rerun --tests erp.UpgradeTest }
    Copy-Item build/test-results/test/TEST-erp.UpgradeTest.xml "reports/upgrade-$History.xml"
}

try {
    docker @postgresCompose up -d --wait postgres-source
    $sourcePort = ([uri]("tcp://" + (docker @postgresCompose port postgres-source 5432))).Port
    $venv = 'build/upgrade/venv'
    $python = if ($IsWindows) { "$venv/Scripts/python.exe" } else { "$venv/bin/python" }
    if (!(Test-Path -LiteralPath $python)) { python -m venv $venv }
    & $python -m pip install --disable-pip-version-check -r scripts/migration-requirements.txt
    $env:ERP_SOURCE_PASSWORD = $env:DB_PASSWORD
    $env:ERP_TARGET_PASSWORD = $env:DB_PASSWORD

    $env:DB_URL = "jdbc:postgresql://127.0.0.1:${sourcePort}/erp"
    $env:ERP_REFERENCE = "$workspace/reference.json"
    $env:ERP_FIXTURE_HISTORY = 'legacy'
    Export-Revision '2f8fd855f0ade5337af387ed33d7168b3265e7af' 'unscoped'
    Copy-Item scripts/upgrade/LegacyFixtureTest.kt "$workspace/unscoped/src/test/kotlin/erp/"
    & $Gradle -p "$workspace/unscoped" test --tests erp.LegacyFixtureTest

    # Apply the original PostgreSQL migrations, including their ownership checks,
    # before invoking the exact same transfer tool used for a scoped installation.
    Export-Revision 'b1749ffcc515dc4e70f5c90e5deeecebdd3ba446' 'scoped'
    $env:SPRING_FLYWAY_LOCATIONS = 'classpath:db/legacy,classpath:db/legacy-demo'
    $env:ERP_LEGACY_CATALOG_GROUP = 'mundo-eduk'
    & $Gradle -p "$workspace/scoped" test --tests erp.UpgradeTest
    Test-Transfer 'legacy' 'erp' 'erp_upgrade_legacy'

    docker @postgresCompose exec -T postgres-source createdb -U erp erp_scoped
    $env:DB_URL = "jdbc:postgresql://127.0.0.1:${sourcePort}/erp_scoped"
    $env:SPRING_FLYWAY_LOCATIONS = 'classpath:db/migration,classpath:db/demo'
    $env:ERP_FIXTURE_HISTORY = 'scoped'
    $env:ERP_REFERENCE = "$workspace/scoped-reference.json"
    Copy-Item scripts/upgrade/LegacyFixtureTest.kt "$workspace/scoped/src/test/kotlin/erp/"
    & $Gradle -p "$workspace/scoped" test --tests erp.LegacyFixtureTest
    Test-Transfer 'scoped' 'erp_scoped' 'erp_upgrade_scoped'
} finally {
    $env:DB_URL = $originalUrl
    $env:SPRING_FLYWAY_LOCATIONS = $locations
    $env:ERP_LEGACY_CATALOG_GROUP = $catalogGroup
    $env:ERP_REFERENCE = $reference
    $env:ERP_FIXTURE_HISTORY = $fixtureHistory
    $env:ERP_SOURCE_PASSWORD = $sourcePassword
    $env:ERP_TARGET_PASSWORD = $targetPassword
    docker @postgresCompose down -v
}
