import type { AssessmentProvider, SegmentationResult } from '../domain/types';
import { decodeModelImage } from './decodeModelImage';
import {
  classifyLogits,
  prepareClassification,
  prepareSegmentation,
  readSegmentation,
} from './modelProcessing';
import { runOnnx } from './onnxRuntime';
import modelManifest from '../../assets/models/manifest.json';

// Per-result cache prevents two overlapping assessments from sharing a mask.
// Entries are released after classification or garbage collected after cancellation.
const inputs = new WeakMap<
  SegmentationResult,
  {
    uri: string;
    pixels: Awaited<ReturnType<typeof decodeModelImage>>;
    mask: Uint8Array;
    geometry: ReturnType<typeof prepareSegmentation>['geometry'];
  }
>();

export const localModelProvider: AssessmentProvider = {
  async segmentLesion(image) {
    const pixels = await decodeModelImage(image);
    const { tensor, geometry } = prepareSegmentation(pixels);
    const logits = await runOnnx('segmentation', tensor);
    const { result, mask } = readSegmentation(logits, geometry);
    result.modelVersion = modelManifest.id;
    if (result.lesions.length) inputs.set(result, { uri: image.uri, pixels, mask, geometry });
    return result;
  },
  async classifyLesion(image, segmentation) {
    const input = inputs.get(segmentation);
    if (!input || input.uri !== image.uri)
      throw new Error('The lesion outline needs to be regenerated.');
    try {
      const tensor = prepareClassification(input.pixels, input.mask, input.geometry);
      const logits = await runOnnx('classifier', tensor);
      return { ...classifyLogits(logits), modelVersion: modelManifest.id };
    } finally {
      inputs.delete(segmentation);
    }
  },
};
