# CLARA

Offline cutaneous leishmaniasis feasibility-study app for consultants, medical officers and technicians. Built with React Native and Expo for Android, iOS and web.

**Patient details → lesion photo → offline image-model result → save case.** There is no referral or staff triage-decision step. Optional clinical details are entered once. Later, study staff can record microscopy against the same case ID and compare it with the original model result in the separate Study view.

The research models are not clinically validated. Their output is not a diagnosis. [The study workflow and analysis definitions](docs/FEASIBILITY_STUDY.md) include a flow diagram, metric denominators and limitations.

## Run locally

Use Node.js LTS (tested with Node 24):

```sh
npm ci
npm run web
```

The browser executes bundled ONNX models through WebAssembly. Runtime files are copied to `public/onnx` during installation; images are not uploaded and no inference API or CDN is used. Native models require a custom installed build. Expo Go can preview the interface but cannot run ONNX; a failed analysis can be saved explicitly without a model result.

```sh
npx expo start --go --lan   # Expo Go interface preview on the same Wi-Fi
npm run android           # Local Android build/install with SDK/JDK and a device
npm run ios               # Local iOS build/install with Xcode on macOS
```

Browser camera access requires localhost or HTTPS. Physical iOS camera/model testing remains outstanding.

## Android build on Windows

The build bundles JavaScript and both models, signs with a local research certificate, and verifies signatures, ZIP alignment, model hashes and ARM64 library alignment.

```powershell
python scripts/setup_android.py
. .\.tooling\android-env.ps1
& "$env:ANDROID_HOME/cmdline-tools/latest/bin/android.exe" --no-metrics --sdk=$env:ANDROID_HOME sdk install 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'build-tools;35.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1' 'cmake;3.30.5'
npx expo prebuild --platform android --no-install
npm run build:android:local
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-android.ps1
```

The [CLARA Android releases](https://github.com/Faisalhakimi22/CLARA-AI-powered-offline-mobile-app-to-support-community-of-cutaneous-leishmaniasis/releases) provide the APK for ARM64 Android 7.0 or newer (approximately 118 MB). Back up `.tooling/clara-research.p12` and its password file securely to retain update compatibility; keep them out of source control. ONNX compatibility patches in `patches/` are reapplied by `npm ci`.

See [QA.md](QA.md) for the exact current build/check status and [Android device testing](docs/ANDROID_TESTING.md) for checks that still need a connected phone.

## Workflow and data

1. Accept the information-handling notice and enter the operator profile.
2. Start a case, record a unique study ID, optional age/sex and clinical details, and confirm permission to collect the photograph.
3. Take or choose a photo; check focus, lighting and framing.
4. Run the local segmentation and classification models. View Suggestive of CL, Non-suggestive of CL, or Inconclusive. Runtime failure is recorded separately.
5. Save Case. The original image, result, model version, last-attempt timing and operator attribution remain together. No follow-up questions or staff override is required.
6. Reopen a saved case from History. If available, enter its microscopy report separately. The first entry is retained; no correction workflow is implemented yet.
7. Study shows paired descriptive sensitivity, specificity, accuracy, predictive values, balanced accuracy, missing/inconclusive counts and saved-case analysis completion/time. Export all local records as CSV for the study team.

Case details save as they change; Save & exit stores an incomplete case. Saved model evidence cannot be changed through app controls. Microscopy is never supplied to the model. Reports include model version and separate laboratory information. Text and CSV exports exclude photographs; native export uses the system share sheet.

The Study tab is separate from the patient visit. There is no laboratory/hospital integration, backend, authentication or synchronization.

## Model integration

`src/services/modelAdapter.ts` is the provider boundary. It uses `localModelProvider.ts`, `onnxRuntime.native.ts` / `onnxRuntime.web.ts`, and bundled files in `assets/models`.

```ts
interface AssessmentProvider {
  segmentLesion(image: LesionImage): Promise<SegmentationResult>;
  classifyLesion(image: LesionImage, segmentation: SegmentationResult): Promise<AIResult>;
}
```

The current pair is `clara-local-research-refined-v2`. The feasibility-workflow revision leaves model weights, preprocessing and thresholds unchanged. An empty mask abstains without classification. CL score >0.8 suggests CL; <0.2 is non-suggestive; the middle band is inconclusive. Scores are uncalibrated. Clinical information does not change the model result.

See [training provenance](training/README.md), [refinement comparison](training/reports/candidate_refinement_v1/review.md), [internal test report](training/reports/refined_v2_test/review.md), and `assets/models/manifest.json`. Internal tests do not establish performance in Pakistani clinical practice. No real-world clinical-fusion model exists. Use the exact selected-checkpoint export command in the training guide to retain the refined pair.

## Structure

```text
App.tsx                       Navigation and startup
src/screens/                  Patient/photo/result/history/study screens
src/components/               Shared accessible UI and summaries
src/domain/types.ts           Model and record contracts
src/domain/clinical.ts        Patient and completion validation
src/domain/study.ts           Record guards, metrics and CSV
src/domain/migration.ts       Preserve previous records separately
src/domain/report.ts          Case text report
src/services/modelAdapter.ts  Replaceable image-model provider
src/services/storage.ts       Serialized local persistence
src/services/imageStorage.*   Durable local photographs
src/services/exportStudy.*    Browser CSV / native share
src/state/AppContext.tsx      Case and microscopy operations
```

## Storage and migration

AsyncStorage key: `@cl-triage/workspace/v3`. Existing v2 cases, including unfinished drafts, migrate intact to read-only earlier-workflow records. Their previous clinical decisions/referrals are retained as historical data and excluded from study calculations. V1 generated records/results are handled by the existing legacy cleanup. The new workspace is saved before old storage keys are removed.

Native photos use the app-owned document directory; browser photos use local persisted JPEG data. Android backup is disabled. Clear local data requires confirmation and removes records, photos, profile and consent. Exported copies are managed separately.

There is no app-level encryption, authentication, cloud backup or recovery. Use authorized, de-identified research data and approved devices. Application immutability guards are not a security or tamper-proof audit system.

## Verification

```sh
npm run typecheck
npm test
npm run export
npx playwright install chromium
```

Serve the exported app with `python -m http.server 8082 --bind 127.0.0.1 --directory dist`. In another PowerShell terminal set `$env:CLARA_TEST_URL='http://127.0.0.1:8082'` and run `npm run test:e2e`. The tests execute the real local models and exercise direct saving, separate microscopy, persistence, unavailable analysis and migration. Exact results are recorded in [QA.md](QA.md).

## Repository contents

The repository includes application source, bundled ONNX models, training scripts and metric reports. Local datasets, prepared training images, checkpoints, report image grids, signing credentials and generated build artifacts are excluded. End-to-end scenarios require the local prepared dataset described in `training/README.md`; the dataset and Colab ZIP are not distributed with this repository. Download Android packages from GitHub Releases.
