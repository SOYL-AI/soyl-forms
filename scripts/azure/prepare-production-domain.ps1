param([switch]$Bind)
$ErrorActionPreference='Stop'
$group='soyl-forms-staging-rg'
$app='soyl-forms-web'
$domain='forms.soylai.com'
if ((az account show --query id -o tsv) -ne 'f51e344a-8bea-45cb-a18b-506a27c7a031') {throw 'Select the SOYL subscription first.'}
$expected=az containerapp show -g $group -n $app --query properties.configuration.ingress.fqdn -o tsv
if($LASTEXITCODE -ne 0) {throw 'Could not read the Azure app hostname.'}
$records=Resolve-DnsName $domain -Type CNAME -Server 1.1.1.1
$actual=($records | Where-Object Type -eq CNAME | Select-Object -First 1).NameHost.TrimEnd('.')
if($actual -ne $expected) {throw "Production still points to $actual. Apply the coordinated DNS cutover in docs/24 before binding."}
$verification=az containerapp show -g $group -n $app --query properties.customDomainVerificationId -o tsv
$txt=Resolve-DnsName "asuid.$domain" -Type TXT -Server 1.1.1.1
if(!($txt | Where-Object {($_.Strings -join '') -eq $verification})) {throw 'Azure ownership TXT record is missing or incorrect.'}
if(!$Bind) {Write-Output 'Public CNAME and ownership TXT match Azure. Use -Bind to provision the managed certificate.';exit 0}
az containerapp hostname add -g $group -n $app --hostname $domain --output none
if($LASTEXITCODE -ne 0) {throw 'Custom domain registration failed.'}
az containerapp hostname bind -g $group -n $app --hostname $domain --environment soyl-forms-env --validation-method CNAME --output none
if($LASTEXITCODE -ne 0) {throw 'Managed certificate binding failed. Check direct CNAME, CAA and DigiCert access.'}
$response=Invoke-WebRequest "https://$domain/api/health/ready" -UseBasicParsing -TimeoutSec 20
if($response.StatusCode -ne 200) {throw 'Production hostname readiness failed.'}
Write-Output 'Azure custom domain, certificate and readiness verified. Run the authorized Azure production release next.'
