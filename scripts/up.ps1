. "$PSScriptRoot/common.ps1"
$env:DB_PORT = '55432'
$env:WEB_PORT = '18080'
Build-Erp
Start-Erp 'erp-industrial-dev' 18080
Write-Host 'ERP Industrial disponível em http://localhost:18080'
