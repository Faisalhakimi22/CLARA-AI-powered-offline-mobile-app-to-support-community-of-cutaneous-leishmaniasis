import {
  AIResult,
  AdaptiveResult,
  AssessmentProvider,
  ClinicalAnswers,
  ImageAssessmentResult,
  LesionImage,
  ModelStage,
} from '../domain/types';
import { modelAdapter } from './modelAdapter';

export class AnalysisUnavailableError extends Error {
  constructor() {
    super('Image analysis is not connected. This case can be saved without a model result.');
    this.name = 'AnalysisUnavailableError';
  }
}

export type ModelStageListener = (stage: ModelStage) => void;

function assertConfidence(value: number, stage: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${stage} returned an invalid confidence value.`);
}

/** Validates model-neutral outputs before they are persisted or displayed. */
export function validateSegmentation(
  result: Awaited<ReturnType<AssessmentProvider['segmentLesion']>>,
) {
  if (!result || !Array.isArray(result.lesions)) throw new Error('Segmentation output is invalid.');
  for (const lesion of result.lesions) {
    assertConfidence(lesion.confidence, 'Segmentation');
    if (
      !Array.isArray(lesion.polygon) ||
      lesion.polygon.length < 6 ||
      lesion.polygon.length % 2 !== 0 ||
      lesion.polygon.some(
        (coordinate) => !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1,
      )
    )
      throw new Error('Segmentation returned an invalid lesion outline.');
  }
}

function validateClassification(result: Awaited<ReturnType<AssessmentProvider['classifyLesion']>>) {
  if (!result || !['CL', 'NON_CL', 'UNCERTAIN'].includes(result.prediction))
    throw new Error('Classification output is invalid.');
  assertConfidence(result.confidence, 'Classification');
  if (typeof result.message !== 'string') throw new Error('Classification message is invalid.');
}

/** Shared, testable two-stage orchestration. The provider owns all model-specific behavior. */
export async function runModelPipeline(
  provider: AssessmentProvider,
  image: LesionImage,
  onStage?: ModelStageListener,
): Promise<ImageAssessmentResult> {
  onStage?.('segmentation');
  const segmentation = await provider.segmentLesion(image);
  validateSegmentation(segmentation);

  // A missing mask is a failed localization, never evidence against CL.
  // Do not feed a blank crop or the entire photograph to the classifier.
  if (!segmentation.lesions.length) {
    return {
      segmentation,
      classification: {
        prediction: 'UNCERTAIN',
        confidence: 0,
        modelVersion: segmentation.modelVersion,
        message: 'A lesion could not be outlined reliably. The model result is inconclusive.',
      },
    };
  }

  onStage?.('classification');
  const classification = await provider.classifyLesion(image, segmentation);
  validateClassification(classification);

  return { segmentation, classification };
}

/** A disconnected adapter produces no prediction, score, or artificial delay. */
export const assessmentService = {
  get available() {
    return modelAdapter !== null;
  },
  get supportsClinicalContext() {
    return !!modelAdapter?.combineAssessment;
  },
  async analyzeImage(
    image: LesionImage,
    onStage?: ModelStageListener,
  ): Promise<ImageAssessmentResult> {
    if (!modelAdapter) throw new AnalysisUnavailableError();
    return runModelPipeline(modelAdapter, image, onStage);
  },
  async combineAssessment(
    image: LesionImage,
    initial: AIResult,
    answers: ClinicalAnswers,
  ): Promise<AdaptiveResult> {
    if (!modelAdapter?.combineAssessment) throw new AnalysisUnavailableError();
    return modelAdapter.combineAssessment(image, initial, answers);
  },
};
