# CLARA engineering verification - 14 October 2026

Current app: 1.1.0 / Android version code 2. Current workflow: patient details, lesion photo, image-model result, save. Microscopy comparison is a separate later study task. These are engineering checks, not clinical validation.

| Check | Result |
| --- | --- |
| TypeScript strict checking | Passed |
| Pipeline, preprocessing and study-domain tests | 18 passed |
| Real models -> direct Save Case -> microscopy -> history/reload -> CSV | Passed; original model output and timing unchanged |
| Patient validation -> gallery file selection -> model result -> save | Passed |
| Real inconclusive output -> save without questionnaire | Passed |
| Unavailable model -> explicitly saved failure without prediction | Passed |
| Previous v2 records -> retained archive excluded from study | Passed |
| External HTTP calls / JavaScript errors in successful study journey | None |
| Android / iOS / web JavaScript export | Passed |
| Android native APK 1.1.0 | Built; signing, ZIP alignment, both model hashes and all 23 ARM64 library layout checks passed |
| Expo Go preview | Running on LAN; iOS manifest reports CLARA 1.1.0 / SDK 57; actual phone use not tested |
| Physical Android/iPhone camera and native-inference testing | Not performed; no connected test phone |

Five distinct browser scenarios passed in Chromium with a Pixel 7 viewport. Four run from seeded intake/photos or historical data; the fifth starts from Home, validates intake and uploads a real dataset photograph through the gallery picker. Successful image scenarios execute both real local models. The unavailable-model scenario intentionally blocks model-file requests. The migration check preserves a previous referral as historical data without exposing a new referral action.

The 18 unit checks include model sequencing, malformed outputs, mask geometry, class mapping, completion requirements, paired-metric denominators, missing/inconclusive exclusions, zero denominators, original-result immutability, photo invalidation, migrations, CSV quoting/formula protection, and laboratory dates around local midnight. Screenshots are in `artifacts/feasibility/`.

## Build and model provenance

The current [Android APK](artifacts/android/CLARA-research-arm64-v8a.apk) is 118,338,406 bytes. SHA256: `affab00c416832730e2c4bb2b7651101fddf8577ed76d5c87d790be7faeca74a`. Package `org.research.cltriage`, version 1.1.0/code 2, ARM64, minimum Android API 24. The build completed in 10m 36s and retained the same research signing certificate for updates. [Static package evidence](artifacts/android/apk-verification.json) verifies both unchanged ONNX models and all 23 ARM64 libraries. Signature and ZIP-alignment checks also passed in the build script. `adb devices -l` showed no connected device on 14 October.

The previous 1.0.0 APK and verification JSON are retained in `artifacts/android/previous-workflow-v1/`. Its SHA256 is `f91bb8a5941ed8a63394ae8ca2fabe05ce6f3f8bbb6dfc77eaac61cdcc73a85b`; it contains the earlier referral workflow and is not the current study app.

The model pair remains `clara-local-research-refined-v2`. This workflow change alters result wording but not weights, preprocessing or decision thresholds. Segmentation SHA256: `899c1bb184871d579a41654c6256cfc6d36ee9f59fba52bd99df435765eb6d01`; classifier SHA256: `4da26caf37fb8b341acbf4f7be9e844b5bd28a819f75e87863ec93d28c99cb07`.

Previously completed ONNX/PyTorch parity checks passed with maximum logit differences 1.00e-5 for segmentation and 1.86e-5 for classification. [The internal test report](training/reports/refined_v2_test/review.md) records mean mask Dice 0.671 on 150 images, including only 15 CL images, and 36 uncertain outputs at the fixed review band. These existing model results are not Pakistani clinical validation; patient independence is unverified and acquisition source is confounded with disease class. No new model training or test-set tuning was performed for this workflow change.

## Repeat checks

Run `npm run typecheck`, `npm test`, and `npm run export`. Serve `dist` with `python -m http.server 8082 --bind 127.0.0.1 --directory dist`, then set `$env:CLARA_TEST_URL='http://127.0.0.1:8082'` and run `npm run test:e2e` in another PowerShell terminal.

For Android, run `npm run build:android:local`, install with `scripts/install-android.ps1`, and follow [the phone-testing procedure](docs/ANDROID_TESTING.md). Static APK checks do not verify native runtime behavior. Expo Go cannot run the native model library.

## Remaining work before a field study

- Complete native phone testing: camera permissions, offline cold start and inference, memory/latency, hardware navigation and persistence; build/test iOS separately.
- Agree the [study protocol](docs/FEASIBILITY_STUDY.md): eligibility, reference testing, blinding, sample size, fixed model/thresholds, handling missing/inconclusive results, laboratory correction procedure, and collection of usability/acceptability and full visit-time measures.
- Study-tab metrics are descriptive paired point estimates, without confidence intervals. Counts retain missing/inconclusive results. Last-attempt analysis timing is not total visit time or a count of all retries.
- Complete privacy/security and ethics review. Local storage has no app-level encryption or authentication; application record locks are not tamper-proof. Use authorized de-identified research data.

The app is a research build, not a clinically validated medical product.
