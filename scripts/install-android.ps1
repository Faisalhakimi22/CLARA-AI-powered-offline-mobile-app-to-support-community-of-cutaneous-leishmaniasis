<#
.SYNOPSIS
Installs the locally built CLARA research APK on one authorized Android device.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1 -DeviceSerial YOUR_SERIAL
#>
[CmdletBinding()]
param(
    [string]$DeviceSerial,
    [string]$ApkPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $projectRoot '.tooling/android-env.ps1'
if (Test-Path -LiteralPath $envFile) { . $envFile }

$adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
if (-not $adbCommand) {
    throw 'Android platform-tools are unavailable. Set ANDROID_HOME and add its platform-tools folder to PATH, or complete the local Android toolchain setup.'
}
$adb = $adbCommand.Source

if (-not $ApkPath) {
    $ApkPath = Join-Path $projectRoot 'artifacts/android/CLARA-research-arm64-v8a.apk'
}
if (-not (Test-Path -LiteralPath $ApkPath -PathType Leaf)) {
    throw "APK not found: $ApkPath. Run npm run build:android:local first, or pass -ApkPath."
}
$ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$appConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'app.json') -Raw | ConvertFrom-Json
$package = $appConfig.expo.android.package
if (-not $package) { throw 'app.json does not define expo.android.package.' }

$listing = @(& $adb devices -l)
if ($LASTEXITCODE -ne 0) { throw 'adb could not list devices. Check the USB connection and Android platform-tools.' }
$listing | ForEach-Object { Write-Host $_ }
$devices = @(
    foreach ($line in $listing) {
        if ($line -match '^(\S+)\s+(device|unauthorized|offline|recovery|sideload|bootloader|no permissions)\b') {
            [PSCustomObject]@{ Serial = $Matches[1]; State = $Matches[2] }
        }
    }
)
if ($DeviceSerial) {
    $selected = @($devices | Where-Object { $_.Serial -ceq $DeviceSerial })
    if ($selected.Count -ne 1) {
        throw "Device '$DeviceSerial' is not listed by adb. Connect it, enable USB debugging, and check adb devices -l."
    }
    $device = $selected[0]
} else {
    if ($devices.Count -eq 0) {
        throw 'No Android device is connected. Connect a phone by USB, enable USB debugging, unlock it, and accept the computer authorization prompt.'
    }
    if ($devices.Count -gt 1) {
        throw 'More than one Android device is listed. Run again with -DeviceSerial followed by the intended serial from the list above.'
    }
    $device = $devices[0]
}
if ($device.State -eq 'unauthorized') {
    throw "Device '$($device.Serial)' is unauthorized. Unlock the phone, accept the USB debugging authorization prompt, and run this script again."
}
if ($device.State -ne 'device') {
    throw "Device '$($device.Serial)' is $($device.State). Reconnect it and wait until adb devices reports 'device'."
}

$serial = $device.Serial
Write-Host "Installing $ApkPath on $serial. Existing CLARA data will be preserved."
& $adb -s $serial install -r $ApkPath
if ($LASTEXITCODE -ne 0) {
    throw 'APK installation failed. Review the adb error above. For a signing-key mismatch, rebuild with the original signing key; this script will not uninstall the existing app or erase its records.'
}

$resolved = @(& $adb -s $serial shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER $package)
if ($LASTEXITCODE -ne 0) { throw 'The APK was installed, but Android could not resolve its launch activity.' }
$activityPattern = '^' + [regex]::Escape($package) + '/\S+$'
$activity = @($resolved | ForEach-Object { $_.Trim() } | Where-Object { $_ -match $activityPattern }) | Select-Object -Last 1
if (-not $activity) { throw "The APK was installed, but no launcher activity was found for $package. Open CLARA on the phone and inspect the build configuration." }
$launch = @(& $adb -s $serial shell am start -W -n $activity)
$launchExitCode = $LASTEXITCODE
$launch | ForEach-Object { Write-Host $_ }
if ($launchExitCode -ne 0 -or ($launch -match '^\s*(Error:|Error type|Exception)')) {
    throw 'CLARA was installed but could not be launched. Review the Android activity error above.'
}
Write-Host 'CLARA is installed and launch was requested. Complete docs/ANDROID_TESTING.md on the phone; installation alone does not verify native model inference.'
