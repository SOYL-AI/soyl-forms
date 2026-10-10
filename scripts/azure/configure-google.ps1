$ErrorActionPreference = 'Stop'
$envPath = Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) '.env.azure.local'
$content = Get-Content -LiteralPath $envPath -Raw
function Read-LocalSetting([string]$Name) { [regex]::Match($content, "(?m)^$Name=([^\r\n]+)").Groups[1].Value.Trim() }
$tenant = Read-LocalSetting 'ENTRA_TENANT_ID'
$clientId = Read-LocalSetting 'GOOGLE_OAUTH_CLIENT_ID'
$clientSecret = Read-LocalSetting 'GOOGLE_OAUTH_CLIENT_SECRET'
if ($tenant -ne '47f0c7e0-77a5-4ae0-b3b4-b9b48269d014') { throw 'Expected the dedicated SOYL Forms tenant.' }
if (!$clientId.EndsWith('.apps.googleusercontent.com') -or !$clientSecret) { throw 'Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to ignored .env.azure.local first. Never put the secret in chat or Git.' }
$accessToken = az account get-access-token --tenant $tenant --resource https://graph.microsoft.com --query accessToken -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Dedicated tenant Azure sign-in is required.' }
$headers = @{ Authorization = "Bearer $accessToken" }
function Invoke-FormsGraph([string]$Method, [string]$Path, $Body = $null) {
  $options = @{ Method = $Method; Uri = "https://graph.microsoft.com/v1.0/$Path"; Headers = $headers; TimeoutSec = 30 }
  if ($null -ne $Body) { $options.Body = ConvertTo-Json -InputObject $Body -Depth 10 -Compress; $options.ContentType = 'application/json' }
  try { Invoke-RestMethod @options } catch { throw "Google federation configuration failed (HTTP $([int]$_.Exception.Response.StatusCode)); check the dedicated tenant without exposing credentials." }
}
try {
  $providers = (Invoke-FormsGraph 'GET' 'identity/identityProviders').value
  $google = $providers | Where-Object { $_.identityProviderType -eq 'Google' } | Select-Object -First 1
  $settings = @{ '@odata.type' = '#microsoft.graph.socialIdentityProvider'; displayName = 'Google'; identityProviderType = 'Google'; clientId = $clientId; clientSecret = $clientSecret }
  if ($google) { $null = Invoke-FormsGraph 'PATCH' "identity/identityProviders/$($google.id)" $settings } else { $google = Invoke-FormsGraph 'POST' 'identity/identityProviders' $settings }
  $flow = (Invoke-FormsGraph 'GET' 'identity/authenticationEventsFlows').value | Where-Object { $_.displayName -eq 'SOYL Forms Sign Up and Sign In' } | Select-Object -First 1
  if (!$flow) { throw 'SOYL Forms user flow is missing.' }
  $ids = @($flow.onAuthenticationMethodLoadStart.identityProviders.id) + @($google.id) | Select-Object -Unique
  $null = Invoke-FormsGraph 'PATCH' "identity/authenticationEventsFlows/$($flow.id)" @{
    '@odata.type' = '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow'
    onAuthenticationMethodLoadStart = @{
      '@odata.type' = '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp'
      identityProviders = @($ids | ForEach-Object { @{ id = $_ } })
    }
  }
  Write-Output 'Google federation is configured and attached to the Forms signup/login flow. Real Google web and Android sign-in still require acceptance testing.'
} finally { Remove-Variable accessToken,headers,content,clientSecret,settings -ErrorAction SilentlyContinue }
