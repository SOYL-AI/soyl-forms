param([string]$PreviewOrigin = 'https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io', [string]$JdkHome)
$ErrorActionPreference = 'Stop'
$preview = [Uri]$PreviewOrigin
if ($preview.Scheme -ne 'https' -or !$preview.Host.EndsWith('.centralindia.azurecontainerapps.io') -or $preview.UserInfo -or $preview.Query -or $preview.Fragment) { throw 'Use the isolated Azure HTTPS preview origin.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$previousServerUrl = $env:CAP_SERVER_URL
$previousJavaHome = $env:JAVA_HOME
if (!$JdkHome) {
  $portableJava = Get-ChildItem -LiteralPath (Join-Path $repoRoot '.azure-migration/toolchains') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($portableJava) { $JdkHome = $portableJava.FullName }
}
if ($JdkHome -and !(Test-Path -LiteralPath (Join-Path $JdkHome 'bin/java.exe'))) { throw 'The selected Java 21 toolchain is invalid.' }
Push-Location $repoRoot
try {
  $env:CAP_SERVER_URL = $preview.GetLeftPart([UriPartial]::Authority)
  if ($JdkHome) { $env:JAVA_HOME = $JdkHome }
  npm run cap:sync
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor proof sync failed.' }
  Push-Location android
  try {
    ./gradlew.bat assembleAuthProof --no-daemon --max-workers=2
    if ($LASTEXITCODE -ne 0) { throw 'Android auth proof build failed.' }
  } finally { Pop-Location }
  $outputDirectory = Join-Path $repoRoot '.azure-migration'
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/authProof/app-authProof.apk' -Destination (Join-Path $outputDirectory 'soyl-forms-auth-preview.apk')
  Write-Output 'Auth preview APK created under ignored .azure-migration, using separate package com.soylai.forms.authproof.'
} finally {
  if ($null -eq $previousServerUrl) { Remove-Item Env:CAP_SERVER_URL -ErrorAction SilentlyContinue } else { $env:CAP_SERVER_URL = $previousServerUrl }
  if ($null -eq $previousJavaHome) { Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue } else { $env:JAVA_HOME = $previousJavaHome }
  # Restore generated assets/config so a later release build uses the normal site.
  npm run cap:sync
  Pop-Location
}
