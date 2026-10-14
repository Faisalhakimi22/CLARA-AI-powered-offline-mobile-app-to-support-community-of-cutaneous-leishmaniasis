// ORT 1.24.3 declares a legacy Expo unimodule as well as a ReactPackage.
// Explicit configuration keeps Expo autolinking from skipping its ReactPackage.
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
