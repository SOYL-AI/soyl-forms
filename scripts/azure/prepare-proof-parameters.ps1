$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputDirectory = Join-Path $repoRoot '.azure-migration'
$parameterPath = Join-Path $outputDirectory 'proof-parameters.json'
if (Test-Path -LiteralPath $parameterPath) { throw 'Proof deployment parameters already exist; refusing to rotate database credentials.' }
$content = Get-Content -LiteralPath (Join-Path $repoRoot '.env.azure.local') -Raw
function Read-LocalSetting([string]$Name) { [regex]::Match($content, "(?m)^$Name=([^\r\n]+)").Groups[1].Value.Trim() }
if ((Read-LocalSetting 'ENTRA_TENANT_ID') -ne '47f0c7e0-77a5-4ae0-b3b4-b9b48269d014') { throw 'Expected the dedicated Forms customer tenant.' }
$clientSecret = Read-LocalSetting 'ENTRA_CLIENT_SECRET'
if (!$clientSecret) { throw 'Entra client secret is missing.' }
function New-ProofSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return 'Aa9' + [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$operatorId = az ad signed-in-user show --query id -o tsv
if ($LASTEXITCODE -ne 0 -or !$operatorId) { throw 'Azure operator identity is unavailable.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
@{
  '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
  contentVersion = '1.0.0.0'
  parameters = @{
    operatorObjectId = @{ value = $operatorId }
    databaseOwnerPassword = @{ value = (New-ProofSecret) }
    databaseRuntimePassword = @{ value = (New-ProofSecret) }
    entraClientSecret = @{ value = $clientSecret }
    sessionSecret = @{ value = (New-ProofSecret) }
  }
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $parameterPath -Encoding ascii
Remove-Variable content,clientSecret -ErrorAction SilentlyContinue
Write-Output 'Secure deployment parameters saved under ignored .azure-migration; no credentials were printed.'
