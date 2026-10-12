param()
$ErrorActionPreference='Stop'
$group='soyl-forms-staging-rg'
$subscription='f51e344a-8bea-45cb-a18b-506a27c7a031'
$vault='sfkvn4nsiocbpshei'
$appName='soyl-forms-web'
if((az account show --query id -o tsv) -ne $subscription) {throw 'Select the SOYL subscription first.'}
$app=az containerapp show -g $group -n $appName -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0) {throw 'Cannot read the production application.'}
$origins=@($app.properties.template.containers[0].env | Where-Object {$_.name -in @('APP_ORIGIN','ENTRA_APP_ORIGIN')})
if($origins.Count -ne 2 -or @($origins | Where-Object {$_.value -ne 'https://forms.soylai.com'}).Count) {throw 'The expected production application origin is required.'}
node --env-file=.env.azure.payments.local scripts/azure/configure-live-billing.mjs --prepare
if($LASTEXITCODE -ne 0) {throw 'Live provider plan/configuration validation failed.'}
$settings=(Get-Content -LiteralPath .azure-migration/live-payment-settings.json -Raw | ConvertFrom-Json).parameters.settings.value
$names=@($settings.PSObject.Properties.Name)
if($names.Count -ne 7) {throw 'Expected only the seven payment settings.'}
$identity="/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.ManagedIdentity/userAssignedIdentities/soyl-forms-runtime"
function Get-PaymentReferences {
  foreach($name in $names) {
    $version=az keyvault secret show --vault-name $vault --name $name --query id -o tsv
    if($LASTEXITCODE -ne 0 -or !$version.StartsWith("https://$vault.vault.azure.net/secrets/$name/")) {throw 'Payment secret version lookup failed.'}
    "$name=keyvaultref:$version,identityref:$identity"
  }
}
# Keep the old revision consistently on its current values during the seven-secret update.
$previousReferences=@(Get-PaymentReferences)
az containerapp secret set -g $group -n $appName --secrets $previousReferences --output none
if($LASTEXITCODE -ne 0) {throw 'Could not pin the previous payment configuration.'}
$state=az deployment group create -g $group -n platform-live-billing -f azure/platform-secrets.bicep --parameters '@.azure-migration/live-payment-settings.json' --query properties.provisioningState -o tsv
if($LASTEXITCODE -ne 0 -or $state -ne 'Succeeded') {throw 'Payment secrets deployment did not succeed; do not roll the app.'}
$newReferences=@(Get-PaymentReferences)
az containerapp secret set -g $group -n $appName --secrets $newReferences --output none
if($LASTEXITCODE -ne 0) {throw 'New payment secret references could not be configured.'}
# Preserve all unrelated settings and keep future infrastructure deployment input consistent.
node --input-type=module -e "import {readFileSync,writeFileSync} from 'node:fs'; const path='.azure-migration/platform-secrets-parameters.json';const old=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));const payment=JSON.parse(readFileSync('.azure-migration/live-payment-settings.json','utf8'));for(const [key,value] of Object.entries(payment.parameters.settings.value))old.parameters.settings.value[key]=value;writeFileSync(path,JSON.stringify(old,null,2));"
if($LASTEXITCODE -ne 0) {throw 'Could not synchronize ignored infrastructure input.'}
$suffix='billing-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
az containerapp update -g $group -n $appName --revision-suffix $suffix --output none
if($LASTEXITCODE -ne 0) {throw 'Payment configuration revision failed.'}
$evidence=@{event='live_payment_configuration_rolled';mode='live';revisionSuffix=$suffix;previousReferences=$previousReferences;currentReferences=$newReferences;configuredAt=[DateTime]::UtcNow.ToString('o');readinessVerificationRequired=$true}
[IO.File]::WriteAllText((Join-Path (Get-Location) '.azure-migration/live-payment-deployment.json'),($evidence | ConvertTo-Json -Depth 5),(New-Object System.Text.UTF8Encoding($false)))
@{event=$evidence.event;mode='live';revisionSuffix=$suffix;readinessVerificationRequired=$true} | ConvertTo-Json -Compress
