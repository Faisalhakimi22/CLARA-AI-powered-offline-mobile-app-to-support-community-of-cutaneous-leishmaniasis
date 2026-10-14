const fs = require('node:fs');
const path = require('node:path');

// Keep WASM binaries and their JavaScript loader matched to the installed ORT.
const destination = path.join(__dirname, '..', 'public', 'onnx');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(
  path.join(path.dirname(require.resolve('onnxruntime-web')), 'ort.wasm.min.js'),
  path.join(destination, 'ort.wasm.min.js'),
);
for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  fs.copyFileSync(require.resolve(`onnxruntime-web/${file}`), path.join(destination, file));
}
console.log('Local ONNX browser runtime prepared.');
