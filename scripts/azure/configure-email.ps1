param([switch]$UseCustomDomain)
$ErrorActionPreference='Stop'
$subscription='f51e344a-8bea-45cb-a18b-506a27c7a031'
$group='soyl-forms-staging-rg'
if ((az account show --query id -o tsv) -ne $subscription) {throw 'Select the SOYL subscription before configuring email.'}
if ($UseCustomDomain) {
  $domainId="/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.Communication/emailServices/soyl-forms-email/domains/mail.forms.soylai.com"
  $domain=az resource show --ids $domainId --api-version 2023-03-31 -o json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) {throw 'Cannot read the custom sender domain.'}
  foreach($kind in @('Domain','SPF','DKIM','DKIM2')) {
    if ($domain.properties.verificationStates.$kind.status -ne 'Verified') {throw "Custom sender verification incomplete: $kind"}
  }
}
$custom=if($UseCustomDomain){'true'}else{'false'}
$outputs=az deployment group create -g $group -n platform-email -f azure/platform-email.bicep --parameters "useCustomDomain=$custom" --query properties.outputs -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {throw 'Azure email provisioning failed.'}
az keyvault secret set --vault-name sfkvn4nsiocbpshei --name email-from --value $outputs.sender.value --output none
if ($LASTEXITCODE -ne 0) {throw 'Sender configuration could not be saved.'}
# Keep the ignored local parameter file consistent with the deployed sender.
# Otherwise a later secret deployment could restore the former Resend address.
$parametersPath=Join-Path (Get-Location) '.azure-migration/platform-secrets-parameters.json'
if(Test-Path -LiteralPath $parametersPath) {
  $parameters=Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json
  $parameters.parameters.settings.value.'email-from'.value=$outputs.sender.value
  [System.IO.File]::WriteAllText($parametersPath,($parameters | ConvertTo-Json -Depth 30),(New-Object System.Text.UTF8Encoding($false)))
}
az containerapp update -g $group -n soyl-forms-web --set-env-vars 'EMAIL_PROVIDER=azure' "AZURE_EMAIL_ENDPOINT=$($outputs.endpoint.value)" "AZURE_CLIENT_ID=$($outputs.runtimeClientId.value)" --output none
if ($LASTEXITCODE -ne 0) {throw 'Application email configuration failed.'}
@{provider='azure';endpoint=$outputs.endpoint.value;sender=$outputs.sender.value;customDomain=[bool]$UseCustomDomain} | ConvertTo-Json -Compress
