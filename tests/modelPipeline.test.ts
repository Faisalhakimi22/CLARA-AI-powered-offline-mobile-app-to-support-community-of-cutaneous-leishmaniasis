import assert from 'node:assert/strict';
import test from 'node:test';
import { AssessmentProvider, LesionImage, SegmentationResult } from '../src/domain/types';
import { runModelPipeline } from '../src/services/assessmentService';

const image: LesionImage = {
  uri: 'file:///synthetic-test-image.jpg',
  width: 100,
  height: 100,
  source: 'gallery',
};

const segmentation: SegmentationResult = {
  message: 'One outline returned.',
  lesions: [{ polygon: [0.1, 0.1, 0.8, 0.1, 0.7, 0.8], confidence: 0.92 }],
};

test('missing lesion mask abstains without calling the disease classifier', async () => {
  let called = false;
  const provider: AssessmentProvider = {
    async segmentLesion() {
      return { lesions: [], message: 'No outline.' };
    },
    async classifyLesion() {
      called = true;
      return { prediction: 'NON_CL', confidence: 0.9, message: 'Should not be called' };
    },
  };
  const result = await runModelPipeline(provider, image);
  assert.equal(called, false);
  assert.equal(result.classification.prediction, 'UNCERTAIN');
  assert.equal(result.classification.confidence, 0);
});

test('runs segmentation before classification and passes its regions to stage two', async () => {
  const stages: string[] = [];
  const events: string[] = [];
  const provider: AssessmentProvider = {
    async segmentLesion(input) {
      assert.equal(input, image);
      events.push('segment');
      return segmentation;
    },
    async classifyLesion(input, result) {
      assert.equal(input, image);
      assert.equal(result, segmentation);
      events.push('classify');
      return { prediction: 'UNCERTAIN', confidence: 0.58, message: 'More information is needed.' };
    },
  };

  const result = await runModelPipeline(provider, image, (stage) => stages.push(stage));

  assert.deepEqual(events, ['segment', 'classify']);
  assert.deepEqual(stages, ['segmentation', 'classification']);
  assert.equal(result.segmentation, segmentation);
  assert.equal(result.classification.prediction, 'UNCERTAIN');
});

test('does not call classification when segmentation output is invalid', async () => {
  let classified = false;
  const provider: AssessmentProvider = {
    async segmentLesion() {
      return { message: 'Invalid outline.', lesions: [{ polygon: [0, 0, 2, 1], confidence: 0.8 }] };
    },
    async classifyLesion() {
      classified = true;
      return { prediction: 'CL', confidence: 0.8, message: 'Review recommended.' };
    },
  };

  await assert.rejects(() => runModelPipeline(provider, image), /invalid lesion outline/i);
  assert.equal(classified, false);
});

test('rejects classification confidence outside the provider contract', async () => {
  const provider: AssessmentProvider = {
    async segmentLesion() {
      return segmentation;
    },
    async classifyLesion() {
      return { prediction: 'CL', confidence: 1.5, message: 'Review recommended.' };
    },
  };

  await assert.rejects(() => runModelPipeline(provider, image), /invalid confidence/i);
});
