$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location (Split-Path $PSScriptRoot)
$Gradle = if ($IsWindows) { '.\gradlew.bat' } else { './gradlew' }
$Npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }
function Frontend([string[]]$Arguments) {
    Push-Location frontend
    try { & $Npm @Arguments } finally { Pop-Location }
}
function Wait-Endpoint([string]$Url) {
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        try { Invoke-RestMethod -Uri $Url -TimeoutSec 4 | Out-Null; return }
        catch { Start-Sleep -Seconds 2 }
    }
    throw "Serviço indisponível em $Url"
}
function Build-Erp {
    & $Gradle installDist
    Frontend @('run','build')
}
function Start-Erp([string]$Project, [int]$Port) {
    docker compose -p $Project up -d api identity web
    docker compose -p $Project restart api
    Wait-Endpoint "http://localhost:$Port/api/ready"
    Wait-Endpoint "http://localhost:$Port/auth/realms/industrial/.well-known/openid-configuration"
}
