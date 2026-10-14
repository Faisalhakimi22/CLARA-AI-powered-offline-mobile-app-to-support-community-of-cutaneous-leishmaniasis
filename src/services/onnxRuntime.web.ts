import { Asset } from 'expo-asset';
import type { InferenceSession } from 'onnxruntime-web';

type Stage = 'segmentation' | 'classifier';
const assets = {
  segmentation: require('../../assets/models/segmentation.onnx'),
  classifier: require('../../assets/models/classifier.onnx'),
};
const sessions: Partial<Record<Stage, Promise<InferenceSession>>> = {};
type OrtRuntime = typeof import('onnxruntime-web');
let loadingRuntime: Promise<OrtRuntime> | undefined;

function runtime(): Promise<OrtRuntime> {
  if (!loadingRuntime) {
    // ORT uses variable dynamic imports that Metro cannot transform. Load the
    // official browser distribution unchanged, from the app's own origin.
    loadingRuntime = new Promise<OrtRuntime>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/onnx/ort.wasm.min.js';
      script.async = true;
      script.onload = () => {
        const ort = (window as unknown as { ort: OrtRuntime }).ort;
        if (!ort) {
          reject(new Error('The local model runtime could not load.'));
          return;
        }
        ort.env.wasm.wasmPaths = `${window.location.origin}/onnx/`;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        resolve(ort);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('The local model runtime could not load.'));
      };
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      loadingRuntime = undefined;
      throw error;
    });
  }
  return loadingRuntime;
}

async function session(stage: Stage): Promise<InferenceSession> {
  if (!sessions[stage]) {
    sessions[stage] = runtime()
      .then((ort) =>
        ort.InferenceSession.create(Asset.fromModule(assets[stage]).uri, {
          executionProviders: ['wasm'],
        }),
      )
      .catch((error: unknown) => {
        delete sessions[stage];
        throw error;
      });
  }
  return sessions[stage]!;
}

export async function runOnnx(stage: Stage, input: Float32Array): Promise<Float32Array> {
  const ort = await runtime();
  const model = await session(stage);
  const tensor = new ort.Tensor('float32', input, [1, 3, 128, 128]);
  const outputs = await model.run({ image: tensor });
  try {
    const logits = outputs.logits;
    if (!logits || !(logits.data instanceof Float32Array)) throw new Error('Invalid model output.');
    return new Float32Array(logits.data);
  } finally {
    tensor.dispose();
    Object.values(outputs).forEach((value) => value.dispose());
  }
}
