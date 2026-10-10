param(
  [string]$TenantId = '47f0c7e0-77a5-4ae0-b3b4-b9b48269d014',
  [string]$AppOrigin = 'http://localhost:3000'
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$secretPath = Join-Path $repoRoot '.env.azure.local'
if (Test-Path -LiteralPath $secretPath) { throw 'Local Azure secrets already exist; refusing to rotate or overwrite them.' }
$accessToken = az account get-access-token --tenant $TenantId --resource https://graph.microsoft.com --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or !$accessToken) { throw 'Sign in to the dedicated tenant with Azure CLI first.' }
$headers = @{ Authorization = "Bearer $accessToken" }
function Invoke-FormsGraph([string]$Method, [string]$Path, $Body = $null) {
  $options = @{ Method = $Method; Uri = "https://graph.microsoft.com/v1.0/$Path"; Headers = $headers; TimeoutSec = 30 }
  if ($null -ne $Body) { $options.Body = ConvertTo-Json -InputObject $Body -Depth 15 -Compress; $options.ContentType = 'application/json' }
  try { Invoke-RestMethod @options } catch { throw "Identity configuration failed at $Path (HTTP $([int]$_.Exception.Response.StatusCode)); inspect the dedicated tenant before rerunning." }
}
try {
  $org = (Invoke-FormsGraph 'GET' 'organization?$select=id,displayName,tenantType').value[0]
  if ($org.id -ne $TenantId -or $org.tenantType -ne 'CIAM' -or $org.displayName -ne 'SOYL Forms') { throw 'Refusing to change a tenant that is not the dedicated SOYL Forms customer tenant.' }
  $existing = (Invoke-FormsGraph 'GET' "applications?`$filter=displayName eq 'SOYL Forms Web'&`$select=id,appId").value
  $graphService = (Invoke-FormsGraph 'GET' "servicePrincipals?`$filter=appId eq '00000003-0000-0000-c000-000000000000'").value[0]
  if (!$graphService) { throw 'Microsoft Graph service principal is not available in this tenant.' }
  $permissions = @($graphService.oauth2PermissionScopes | Where-Object { $_.value -in @('openid', 'profile', 'email') } | ForEach-Object { @{ id = $_.id; type = 'Scope' } })
  if ($permissions.Count -ne 3) { throw 'Could not resolve the minimal OIDC permission scopes.' }
  if ($existing.Count -gt 1) { throw 'Multiple SOYL Forms applications found; select explicitly before proceeding.' }
  if ($existing.Count -eq 1) { $app = $existing[0] } else {
    $app = Invoke-FormsGraph 'POST' 'applications' @{
      displayName = 'SOYL Forms Web'; signInAudience = 'AzureADMyOrg'
      web = @{ redirectUris = @("$($AppOrigin.TrimEnd('/'))/auth/entra/callback", 'https://forms.soylai.com/auth/entra/callback') | Select-Object -Unique }
      requiredResourceAccess = @(@{ resourceAppId = $graphService.appId; resourceAccess = $permissions })
      optionalClaims = @{ idToken = @(@{ name = 'email'; essential = $false }) }
    }
  }
  $service = (Invoke-FormsGraph 'GET' "servicePrincipals?`$filter=appId eq '$($app.appId)'").value | Select-Object -First 1
  if (!$service) { $service = Invoke-FormsGraph 'POST' 'servicePrincipals' @{ appId = $app.appId } }
  $grant = (Invoke-FormsGraph 'GET' "oauth2PermissionGrants?`$filter=clientId eq '$($service.id)'").value | Where-Object { $_.resourceId -eq $graphService.id -and $_.consentType -eq 'AllPrincipals' } | Select-Object -First 1
  if (!$grant) {
    $null = Invoke-FormsGraph 'POST' 'oauth2PermissionGrants' @{ clientId = $service.id; consentType = 'AllPrincipals'; resourceId = $graphService.id; scope = 'openid profile email' }
  }
  $flows = (Invoke-FormsGraph 'GET' 'identity/authenticationEventsFlows').value | Where-Object { $_.displayName -eq 'SOYL Forms Sign Up and Sign In' }
  if (!$flows) {
    $flow = Invoke-FormsGraph 'POST' 'identity/authenticationEventsFlows' @{
      '@odata.type' = '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow'
      displayName = 'SOYL Forms Sign Up and Sign In'
      conditions = @{ applications = @{ includeApplications = @(@{ appId = $app.appId }) } }
      onAuthenticationMethodLoadStart = @{ '@odata.type' = '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp'; identityProviders = @(@{ id = 'EmailPassword-OAUTH' }) }
      onInteractiveAuthFlowStart = @{ '@odata.type' = '#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp'; isSignUpAllowed = $true }
      onAttributeCollection = @{
        '@odata.type' = '#microsoft.graph.onAttributeCollectionExternalUsersSelfServiceSignUp'
        attributes = @(
          @{ id = 'email'; displayName = 'Email Address'; description = 'Email address'; userFlowAttributeType = 'builtIn'; dataType = 'string' },
          @{ id = 'displayName'; displayName = 'Your name'; description = 'Display name'; userFlowAttributeType = 'builtIn'; dataType = 'string' }
        )
        attributeCollectionPage = @{ views = @(@{ inputs = @(
          @{ attribute = 'email'; label = 'Email address'; inputType = 'text'; hidden = $true; editable = $false; writeToDirectory = $true; required = $true },
          @{ attribute = 'displayName'; label = 'Your name'; inputType = 'text'; hidden = $false; editable = $true; writeToDirectory = $true; required = $false }
        ) }) }
      }
    }
  } else { $flow = $flows | Select-Object -First 1 }
  # Generate only after configuration succeeds. Never return these values to the terminal.
  $credential = Invoke-FormsGraph 'POST' "applications/$($app.id)/addPassword" @{ passwordCredential = @{ displayName = 'Local Azure auth proof'; endDateTime = [DateTime]::UtcNow.AddMonths(6).ToString('o') } }
  $secretBytes = New-Object byte[] 48
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $randomGenerator.GetBytes($secretBytes) } finally { $randomGenerator.Dispose() }
  $sessionSecret = [Convert]::ToBase64String($secretBytes)
  @(
    'ENTRA_AUTH_PROOF_ENABLED=true', "ENTRA_TENANT_ID=$TenantId", "ENTRA_CLIENT_ID=$($app.appId)",
    "ENTRA_CLIENT_SECRET=$($credential.secretText)", "AUTH_SESSION_SECRET=$sessionSecret", "ENTRA_APP_ORIGIN=$($AppOrigin.TrimEnd('/'))"
  ) | Set-Content -LiteralPath $secretPath -Encoding ascii
  Write-Output "Dedicated identity configured. App ID: $($app.appId). User flow: $($flow.id). Secrets saved in ignored .env.azure.local."
} finally {
  Remove-Variable accessToken,headers,credential,sessionSecret,secretBytes -ErrorAction SilentlyContinue
}
