# Runs against an extra database inside verify.ps1's disposable PostgreSQL project.
param([Parameter(Mandatory)][string]$Project)
. "$PSScriptRoot/common.ps1"
if ($Project -notmatch '^erp-check-[0-9a-f]{32}$') { throw 'Use verify.ps1' }
$revision = '2f8fd855f0ade5337af387ed33d7168b3265e7af'
$source = (New-Item -ItemType Directory -Force "build/upgrade/$Project").FullName
$originalUrl = $env:DB_URL
$catalogGroup = $env:ERP_LEGACY_CATALOG_GROUP
$reference = $env:ERP_REFERENCE
$locations = $env:SPRING_FLYWAY_LOCATIONS
try {
    git archive --format=zip --output="$source/base.zip" $revision
    Expand-Archive "$source/base.zip" "$source/base"
    Copy-Item scripts/upgrade/LegacyFixtureTest.kt "$source/base/src/test/kotlin/erp/"
    docker compose -p $Project exec -T db createdb -U erp erp_upgrade
    $env:DB_URL = $originalUrl -replace '/erp$', '/erp_upgrade'
    $env:ERP_REFERENCE = "$source/reference.json"
    & $Gradle -p "$source/base" test --tests erp.LegacyFixtureTest
    $env:SPRING_FLYWAY_LOCATIONS = "classpath:db/legacy,classpath:db/legacy-demo"
    $env:ERP_LEGACY_CATALOG_GROUP = "mundo-eduk"
    & $Gradle test --tests erp.UpgradeTest --rerun
    & $Gradle test --tests erp.UpgradeTest --rerun
    Copy-Item build/test-results/test/TEST-erp.UpgradeTest.xml reports/upgrade.xml
} finally {
    $env:DB_URL = $originalUrl
    $env:SPRING_FLYWAY_LOCATIONS = $locations
    $env:ERP_LEGACY_CATALOG_GROUP = $catalogGroup
    $env:ERP_REFERENCE = $reference
}
