# ONNX Runtime Android compatibility patch

`onnxruntime-react-native+1.24.3.patch` applies to the exact 1.24.3 package during
`npm install`. It keeps the upstream Microsoft copyright and MIT license notices.

The patch:

- Retrieves the JavaScript call invoker from `ReactApplicationContext`, avoiding
  `CatalystInstance` in React Native's bridgeless architecture. Checks that the
  runtime exists, logs initialization failures, and avoids native cleanup after
  unsuccessful initialization.
- Pins the Android ONNX Runtime Maven artifact to 1.24.3 instead of the package's
  dynamic `latest.integration` dependency.
- Replaces the legacy Gradle `VersionNumber` comparison with the already parsed
  React Native minor version.
- Enables flexible page sizes when building the JSI wrapper with NDK 27, matching
  the React Native and Expo native library settings.

Upstream references:

- [Bridgeless installation fix](https://github.com/microsoft/onnxruntime/pull/33081)
- [Unpinned native runtime issue](https://github.com/microsoft/onnxruntime/issues/32744)
- [Android 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)

Reassess this patch when upgrading ONNX Runtime. After updating dependencies,
verify the Android native build, offline inference, runtime teardown, and APK
alignment. A successful web build does not validate the Android JSI bindings.

## Android package registration

ORT 1.24.3 also ships legacy Expo `unimodule.json` metadata. Expo autolinking skips its React Native package unless it has an explicit Android configuration. The root `react-native.config.js` supplies that configuration so `OnnxruntimePackage` is included in the generated `PackageList`. The local Android build script checks the generated package list and confirms that the packaged DEX instantiates `OnnxruntimePackage`. Native libraries alone do not prove that the JavaScript bridge is registered.
