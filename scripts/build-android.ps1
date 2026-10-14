param([string]$Architecture = 'arm64-v8a', [switch]$BuildDetails)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot '.tooling'
$envFile = Join-Path $toolsRoot 'android-env.ps1'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Run python scripts/setup_android.py and install the SDK packages first.' }
. $envFile
$passwordPath = Join-Path $toolsRoot 'research-signing-password.txt'
$keystorePath = Join-Path $toolsRoot 'clara-research.p12'
if (-not (Test-Path -LiteralPath $passwordPath)) {
    if (Test-Path -LiteralPath $keystorePath) { throw 'Existing signing key has no password file. Restore the password backup before proceeding.' }
    $randomBytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($randomBytes)
    $generator.Dispose()
    [IO.File]::WriteAllText($passwordPath, [Convert]::ToBase64String($randomBytes))
}
if (-not (Test-Path -LiteralPath $keystorePath)) {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $keystorePath -storetype PKCS12 -alias clara-research -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=CLARA Research, OU=Internal Testing' -storepass:file $passwordPath -keypass:file $passwordPath
    if ($LASTEXITCODE -ne 0) { throw 'Research signing key generation failed.' }
}
$env:CLARA_RELEASE_STORE_FILE = $keystorePath
$env:CLARA_RELEASE_STORE_PASSWORD = [IO.File]::ReadAllText($passwordPath).Trim()
$env:NODE_ENV = 'production'
try {
    Push-Location (Join-Path $projectRoot 'android')
    # Limit parallelism to keep this four-core, 8GB machine responsive.
    $gradleOptions = @(':app:assembleRelease', "-PreactNativeArchitectures=$Architecture", '--max-workers=2', '--no-daemon', '--no-parallel', '--console=plain', '-I', (Join-Path $PSScriptRoot 'research-signing.init.gradle'))
    if ($BuildDetails) { $gradleOptions += '--info' }
    & .\gradlew.bat @gradleOptions
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed. See the Gradle error above.' }
    $artifactDir = Join-Path $projectRoot 'artifacts/android'
    New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
    $apk = Join-Path $artifactDir "CLARA-research-$Architecture.apk"
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk') -Destination $apk
    Write-Output "Signed research APK: $apk"
    & "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    & "$env:ANDROID_HOME/build-tools/36.0.0/zipalign.exe" -c -P 16 4 $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK alignment verification failed.' }
    if ($Architecture -eq 'arm64-v8a') {
        & python (Join-Path $PSScriptRoot 'verify-android-apk.py') $apk --output (Join-Path $artifactDir 'apk-verification.json')
        if ($LASTEXITCODE -ne 0) { throw 'Bundled model or native-library verification failed.' }
    }
    (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash | Set-Content -LiteralPath "$apk.sha256" -Encoding ascii
} finally {
    Pop-Location
    Remove-Item Env:CLARA_RELEASE_STORE_PASSWORD -ErrorAction SilentlyContinue
}
