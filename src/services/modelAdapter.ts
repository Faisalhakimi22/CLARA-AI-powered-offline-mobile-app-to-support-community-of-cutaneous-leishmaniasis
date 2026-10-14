import { AssessmentProvider } from '../domain/types';

/**
 * MODEL INTEGRATION POINT: bundled research checkpoints run locally through ONNX.
 * Lazy loading keeps model binaries and native runtime out of the startup path.
 * Replace this provider to integrate future validated models; screens stay unchanged.
 * Clinical answers are recorded as study data and do not change the image result.
 */
export const modelAdapter: AssessmentProvider = {
  async segmentLesion(image) {
    const { localModelProvider } = await import('./localModelProvider');
    return localModelProvider.segmentLesion(image);
  },
  async classifyLesion(image, segmentation) {
    const { localModelProvider } = await import('./localModelProvider');
    return localModelProvider.classifyLesion(image, segmentation);
  },
};
