param([Parameter(Mandatory = $true)][string]$AppOrigin, [switch]$RegisterOnly)
$ErrorActionPreference = 'Stop'
$origin = [Uri]$AppOrigin
if (($origin.Scheme -ne 'https' -and !($origin.Scheme -eq 'http' -and $origin.IsLoopback)) -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo) { throw 'Use an HTTPS origin or HTTP localhost origin.' }
$AppOrigin = $origin.GetLeftPart([UriPartial]::Authority)
$envPath = Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) '.env.azure.local'
$content = Get-Content -LiteralPath $envPath -Raw
$tenant = [regex]::Match($content, '(?m)^ENTRA_TENANT_ID=([^\r\n]+)').Groups[1].Value
$appId = [regex]::Match($content, '(?m)^ENTRA_CLIENT_ID=([^\r\n]+)').Groups[1].Value
if ($tenant -ne '47f0c7e0-77a5-4ae0-b3b4-b9b48269d014' -or !$appId) { throw 'Expected the dedicated SOYL Forms tenant configuration.' }
$accessToken = az account get-access-token --tenant $tenant --resource https://graph.microsoft.com --query accessToken -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Dedicated tenant Azure sign-in is required.' }
$headers = @{ Authorization = "Bearer $accessToken" }
try {
  $apps = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/applications?`$filter=appId eq '$appId'" -Headers $headers -TimeoutSec 30
  $app = $apps.value[0]
  if ($app.displayName -ne 'SOYL Forms Web') { throw 'Application identity did not match.' }
  $uris = @($app.web.redirectUris) + @("$AppOrigin/auth/entra/callback", "$AppOrigin/auth/entra/proof") | Select-Object -Unique
  $body = @{ web = @{ redirectUris = @($uris) } } | ConvertTo-Json -Depth 4
  $null = Invoke-RestMethod -Method Patch -Uri "https://graph.microsoft.com/v1.0/applications/$($app.id)" -Headers $headers -ContentType application/json -Body $body -TimeoutSec 30
  if ($RegisterOnly) {
    Write-Output "Identity callbacks registered for $AppOrigin; local proof origin is unchanged."
  } else {
    [regex]::Replace($content, '(?m)^ENTRA_APP_ORIGIN=[^\r\n]+', "ENTRA_APP_ORIGIN=$AppOrigin") | Set-Content -LiteralPath $envPath -Encoding ascii -NoNewline
    Write-Output "Identity callbacks registered and local proof origin set to $AppOrigin. Restart the proof server."
  }
} finally { Remove-Variable accessToken,headers,content -ErrorAction SilentlyContinue }
