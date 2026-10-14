# CLARA Android device checks

This procedure verifies the installed research app and its local model runtime. It does not establish clinical performance. No phone checks are claimed by this document: record actual results below. Use synthetic case details and authorized, de-identified test photographs.

## Install

Use an Android 7.0 (API 24) or newer phone. The default APK requires a 64-bit ARM device. Enable Developer options and USB debugging, connect it to this computer, unlock it, and accept the USB debugging authorization prompt. Copy the authorized test photographs to the phone first. Then enable airplane mode and turn Wi-Fi off **before running the install helper**, because the helper launches CLARA immediately after installation. USB debugging still works offline.

From the project root in PowerShell:

```powershell
# Build first if the APK has not been produced.
npm run build:android:local
python scripts/verify-android-apk.py artifacts/android/CLARA-research-arm64-v8a.apk --output artifacts/android/apk-verification.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
# If more than one device is listed:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1 -DeviceSerial YOUR_SERIAL
```

The helper installs with `adb install -r`, preserves existing app data, and launches the app. A custom path can be supplied with `-ApkPath`. A signing-key mismatch must be resolved with the original signing key; the helper does not uninstall the old app. This APK runs independently of Expo Go and Metro.

The Python verifier reads the APK without extraction. It checks that the bundled model bytes match `assets/models/manifest.json`, a JavaScript/Hermes bundle and required native libraries are present, and every arm64 shared library has compatible 16 KB ELF load-segment alignment. Pass a different manifest with `--manifest` when checking an archived build. Keep its JSON report together with the build's `apksigner` and `zipalign` results. These static checks do not prove that native inference works on a phone.

For the remaining commands, initialize a terminal and substitute the selected device serial:

```powershell
. .\.tooling\android-env.ps1
$deviceSerial = 'YOUR_SERIAL'
$appPackage = 'org.research.cltriage'
$evidenceDir = Join-Path (Get-Location) ('artifacts/android/device-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
adb -s $deviceSerial shell getprop ro.product.model
adb -s $deviceSerial shell getprop ro.build.version.release
adb -s $deviceSerial shell getprop ro.product.cpu.abilist
adb -s $deviceSerial shell getconf PAGE_SIZE
Get-FileHash artifacts/android/CLARA-research-arm64-v8a.apk -Algorithm SHA256
```

Record these values, the test date, app version, model ID from `assets/models/manifest.json`, and the test photograph's file hash. Test at least one 16 KB-page device separately before claiming 16 KB runtime compatibility; APK alignment is only one part of that check.

## Full journey

1. **Offline first launch.** Keep airplane mode on and Wi-Fi off. Stop Metro if running. For a newly installed app, complete consent and a test worker profile with name and role. For an upgrade, check that the existing profile and cases remain, and record this as an upgrade test rather than a first-install test. The app must open without a development server or network prompt.
2. **Intake and gallery.** Start a case with a unique ID such as `ANDROID-001`. Check missing consent and invalid age validation. Enter two optional clinical answers, leave the others blank, confirm permission to record this test case, and continue. Open the gallery, cancel once, then select an authorized lesion test image. Check orientation and preview. Retake/reselect once and confirm the new image is used.
3. **Photo review.** Try to continue before acknowledging review; it must remain disabled. Check all three quality statements and the review acknowledgment, then continue. These are worker checks, not an automatic blur model. In a second case, leave one statement unchecked and use the image with limitations; confirm the warning appears in the result and saved record.
4. **Real native inference.** Keep airplane mode on. Time the first assessment from pressing Continue to the image result. Both model stages should run and a nonempty lesion mask should show an outline plus a finite, uncalibrated score. Record the image, prediction, score, visible outline, and elapsed time. A runtime error or clinical-review fallback does **not** pass the native inference check. With an image producing no mask, the expected result is uncertain, with no classification score. Do not interpret an outline or a high score as medical accuracy.
5. **Result and save.** Read Suggestive of CL, Non-suggestive of CL, or Inconclusive. Save directly from the result; no questionnaire, staff decision, or referral should be required. Confirm case ID, original model result, model version, image, recorder and timing in the saved detail. If the native runtime is unavailable, Retry and Save without model result must remain available; such a record must never become NON_CL. Do not change model thresholds to force a branch.
6. **Separate microscopy and study view.** Open Record microscopy result from a saved case. Check missing result/confirmation and invalid-date validation. Enter a test report and save. Confirm the original model output and timestamp remain unchanged. A second microscopy entry must not overwrite the first. Open Study; compare the paired table and denominators against the stored test records. Confirm missing/inconclusive/failed records are listed separately, and CSV export includes them. Native export shares CSV text; verify the chosen receiving app preserves it.
7. **History and persistence.** Search by case ID, use Saved/Incomplete filters, open the case, and verify dashboard counts. Force-stop and relaunch using the commands below. Confirm profile/consent, photograph, model result, clinical details, microscopy and counts remain. Start another case, leave it incomplete, restart and resume. Existing v2 records must appear as previous-workflow records and remain excluded from study calculations.
8. **Camera and Android navigation.** In a separate case, deny camera permission and verify gallery remains usable. Grant permission in Android Settings, capture a non-identifying test photograph, retake, and use it. Test hardware Back from intake, gallery cancellation, photo review, result, history, microscopy, Study, Help, Prevention and Settings. No blank screens, extra questionnaires, lost saved records or inaccessible buttons should appear. Back out during analysis, then assess a different image; the prior asynchronous result must not replace the current case.
9. **Repeated/offline use and layout.** Complete three assessments in the same process; record subsequent inference times and watch for crashes or increasing memory. Background and restore the app once during analysis. Check default and large system font sizes: dashboard numbers, New Assessment text, model result, and bottom buttons must remain visible. Check Help illustrations and Prevention content while offline. Repeat the saved-case check after a phone restart and with USB disconnected.

Cold-start here means a new process; it does not mean app data has been erased. The commands below preserve records:

```powershell
adb -s $deviceSerial shell am force-stop $appPackage
adb -s $deviceSerial shell am start -W -n "$appPackage/.MainActivity"
```

## Collect failure evidence

In a second PowerShell terminal, initialize the same variables and capture the app process log while repeating the failure. The process ID changes after a restart, so obtain it again for each run. Press Ctrl+C to stop logging. Do not clear the device's logs or app data.

```powershell
$appProcessId = (adb -s $deviceSerial shell pidof $appPackage).Trim()
if (-not $appProcessId) { throw 'Launch CLARA before starting its process log.' }
adb -s $deviceSerial logcat --pid=$appProcessId -v threadtime | Tee-Object -FilePath (Join-Path $evidenceDir 'clara-process.log')
```

Immediately after a crash, also capture the crash buffer and memory report. The crash buffer may include other apps; keep the original private and share only the relevant CLARA lines.

```powershell
adb -s $deviceSerial logcat -b crash -d -v threadtime | Set-Content -Encoding utf8 (Join-Path $evidenceDir 'crash-buffer.log')
adb -s $deviceSerial shell dumpsys meminfo $appPackage | Set-Content -Encoding utf8 (Join-Path $evidenceDir 'memory.txt')
adb -s $deviceSerial shell screencap -p /sdcard/clara-test-screen.png
adb -s $deviceSerial pull /sdcard/clara-test-screen.png (Join-Path $evidenceDir 'screen.png')
```

Include the exact steps, expected/actual behavior, app/APK/model versions, device details, fixture hash, and screenshot. Avoid real patient data in shared logs and screenshots.

## Result record

Use **Pass / Fail / Not tested**, with an evidence filename or short observation. Installation and a visible home screen alone do not pass this suite.

| Check | Result | Evidence |
| --- | --- | --- |
| APK install/upgrade; existing records preserved | Not tested | |
| Offline first launch and first native inference | Not tested | |
| Real outline and score; cold/warm timing recorded | Not tested | |
| Camera permission denied/granted; capture/retake | Not tested | |
| Gallery choose/cancel; image orientation | Not tested | |
| Quality acknowledgment and limitation warning | Not tested | |
| Result directly saved without questionnaire or staff decision | Not tested | |
| Separate microscopy; original output retained; Study and CSV | Not tested | |
| History search/filter; correct dashboard counts | Not tested | |
| Force-stop/reboot persistence; pending resume | Not tested | |
| Back/cancel during processing; no stale result | Not tested | |
| Repeated inference/background restore; no crash | Not tested | |
| Large fonts; Help/Prevention offline | Not tested | |
| Separate 16 KB-page device runtime check | Not tested | |

Engineering results remain separate from model evaluation. Clinical use still requires representative, patient-separated validation, clinical review, and appropriate privacy/security controls.
