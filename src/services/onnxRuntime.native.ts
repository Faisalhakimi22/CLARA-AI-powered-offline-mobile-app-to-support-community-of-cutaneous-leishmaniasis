import { Asset } from 'expo-asset';
import { NativeModules } from 'react-native';
import type { InferenceSession } from 'onnxruntime-react-native';
import { ModelRuntimeUnavailableError } from './modelErrors';

type Stage = 'segmentation' | 'classifier';
const assets = {
  segmentation: require('../../assets/models/segmentation.onnx'),
  classifier: require('../../assets/models/classifier.onnx'),
};
const sessions: Partial<Record<Stage, Promise<InferenceSession>>> = {};

async function runtime() {
  // Expo Go cannot load this native module. Check before importing ORT, whose
  // module initializer otherwise calls install() on a missing bridge module.
  if (!NativeModules.Onnxruntime && !('OrtApi' in globalThis)) {
    throw new ModelRuntimeUnavailableError();
  }
  try {
    return await import('onnxruntime-react-native');
  } catch {
    throw new ModelRuntimeUnavailableError();
  }
}

async function session(stage: Stage): Promise<InferenceSession> {
  if (!sessions[stage]) {
    sessions[stage] = (async () => {
      const ort = await runtime();
      const asset = Asset.fromModule(assets[stage]);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('The model file could not be opened.');
      // ONNX native loads filesystem paths; Expo assets provide file:// URLs.
      const path = decodeURIComponent(asset.localUri.replace(/^file:\/\//, ''));
      return ort.InferenceSession.create(path, { intraOpNumThreads: 2 });
    })().catch((error: unknown) => {
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
  try {
    const outputs = await model.run({ image: tensor });
    try {
      const logits = outputs.logits;
      if (!logits || !(logits.data instanceof Float32Array))
        throw new Error('Invalid model output.');
      return new Float32Array(logits.data);
    } finally {
      Object.values(outputs).forEach((value) => value.dispose());
    }
  } finally {
    tensor.dispose();
  }
}
