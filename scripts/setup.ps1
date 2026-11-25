. "$PSScriptRoot/common.ps1"
docker info --format '{{.ServerVersion}}'
try { & $Gradle --version } catch {
    python scripts/cache_wrapper.py
    & $Gradle --version
}
Frontend @('ci','--no-audit')
& $Gradle testClasses
