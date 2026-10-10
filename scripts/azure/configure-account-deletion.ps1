param([string]$TenantId='47f0c7e0-77a5-4ae0-b3b4-b9b48269d014',[string]$ClientId='bccc18ff-25c7-426e-827f-1ff928f98de9')
$ErrorActionPreference='Stop'
$formsToken=az account get-access-token --tenant $TenantId --resource https://graph.microsoft.com --query accessToken -o tsv
if($LASTEXITCODE -ne 0 -or !$formsToken) {throw 'Sign in to the dedicated customer tenant first.'}
$formsHeaders=@{Authorization="Bearer $formsToken"}
function Invoke-DeletionGraph([string]$Method,[string]$Path,$Body=$null) {
  $options=@{Method=$Method;Uri="https://graph.microsoft.com/v1.0/$Path";Headers=$formsHeaders;TimeoutSec=20}
  if($null -ne $Body) {$options.Body=ConvertTo-Json -InputObject $Body -Depth 15 -Compress;$options.ContentType='application/json'}
  try {Invoke-RestMethod @options} catch {throw "Account-deletion setup failed at $Path (HTTP $([int]$_.Exception.Response.StatusCode)). No credentials were printed."}
}
try {
  $org=(Invoke-DeletionGraph GET 'organization?$select=id,displayName,tenantType').value[0]
  if($org.id -ne $TenantId -or $org.displayName -ne 'SOYL Forms' -or $org.tenantType -ne 'CIAM') {throw 'Refusing to change any tenant except the dedicated SOYL Forms customer tenant.'}
  $app=(Invoke-DeletionGraph GET "applications?`$filter=appId eq '$ClientId'").value[0]
  $service=(Invoke-DeletionGraph GET "servicePrincipals?`$filter=appId eq '$ClientId'").value[0]
  $graph=(Invoke-DeletionGraph GET "servicePrincipals?`$filter=appId eq '00000003-0000-0000-c000-000000000000'").value[0]
  if(!$app -or !$service -or !$graph) {throw 'Expected application/service principals are missing.'}
  $permission=$graph.appRoles | Where-Object {$_.value -eq 'User.ReadWrite.All' -and $_.allowedMemberTypes -contains 'Application'} | Select-Object -First 1
  if(!$permission) {throw 'The documented user-deletion application permission is unavailable.'}
  $resources=@($app.requiredResourceAccess | ForEach-Object {
    $entries=@($_.resourceAccess | ForEach-Object {@{id=$_.id;type=$_.type}})
    if($_.resourceAppId -eq $graph.appId -and !($entries | Where-Object {$_.id -eq $permission.id})) {$entries+=@{id=$permission.id;type='Role'}}
    @{resourceAppId=$_.resourceAppId;resourceAccess=$entries}
  })
  if(!($resources | Where-Object {$_.resourceAppId -eq $graph.appId})) {$resources+=@{resourceAppId=$graph.appId;resourceAccess=@(@{id=$permission.id;type='Role'})}}
  $null=Invoke-DeletionGraph PATCH "applications/$($app.id)" @{requiredResourceAccess=$resources}
  $assigned=(Invoke-DeletionGraph GET "servicePrincipals/$($service.id)/appRoleAssignments").value
  if(!($assigned | Where-Object {$_.resourceId -eq $graph.id -and $_.appRoleId -eq $permission.id})) {
    $null=Invoke-DeletionGraph POST "servicePrincipals/$($service.id)/appRoleAssignments" @{principalId=$service.id;resourceId=$graph.id;appRoleId=$permission.id}
  }
  Write-Output 'Dedicated SOYL Forms application has customer account-deletion permission. No workforce tenant was changed.'
} finally {Remove-Variable formsToken,formsHeaders -ErrorAction SilentlyContinue}
