import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyLogits,
  MODEL_IMAGE_SIZE,
  prepareClassification,
  prepareSegmentation,
  readSegmentation,
  type PixelImage,
} from '../src/services/modelProcessing';

const area = MODEL_IMAGE_SIZE ** 2;

function solidImage(width: number, height: number, color = [255, 0, 128]): PixelImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set([...color, 255], index * 4);
  return { width, height, data };
}

function near(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

test('segmentation preprocessing preserves aspect ratio and uses normalized CHW RGB with fill114', () => {
  const { tensor, geometry } = prepareSegmentation(solidImage(256, 128));
  assert.deepEqual(geometry, { resizedWidth: 128, resizedHeight: 64, left: 0, top: 32 });
  assert.equal(tensor.length, 3 * area);
  near(tensor[0], (114 / 255 - 0.485) / 0.229);
  const imageOrigin = 32 * MODEL_IMAGE_SIZE;
  near(tensor[imageOrigin], (1 - 0.485) / 0.229);
  near(tensor[area + imageOrigin], (0 - 0.456) / 0.224);
  near(tensor[2 * area + imageOrigin], (128 / 255 - 0.406) / 0.225);
});

test('lesion contours undo letterbox padding and follow concave boundaries', () => {
  const { geometry } = prepareSegmentation(solidImage(256, 128));
  const logits = new Float32Array(area).fill(-10);
  // An L-shaped lesion in the image's top-left corner.
  for (let y = 32; y < 48; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (x < 8 || y < 40) logits[y * MODEL_IMAGE_SIZE + x] = 10;
    }
  }
  // Predictions in padded image space must never become lesions.
  logits.fill(10, 0, MODEL_IMAGE_SIZE * 4);
  const { result, mask } = readSegmentation(logits, geometry);
  assert.equal(result.lesions.length, 1);
  assert.equal(mask.slice(0, MODEL_IMAGE_SIZE * 32).some(Boolean), false);
  const polygon = result.lesions[0].polygon;
  assert.equal(polygon.length, 12, 'L-shaped boundary has six corners, rather than a box');
  const xs = polygon.filter((_, index) => index % 2 === 0);
  const ys = polygon.filter((_, index) => index % 2 === 1);
  near(Math.min(...xs), 0);
  near(Math.max(...xs), 16 / 128);
  near(Math.min(...ys), 0);
  near(Math.max(...ys), 16 / 64);
  assert.ok(result.lesions[0].confidence > 0.99);
});

test('empty and tiny disconnected mask components are removed; separate lesions remain separate', () => {
  const { geometry } = prepareSegmentation(solidImage(128, 128));
  const logits = new Float32Array(area).fill(-10);
  logits[0] = 10;
  logits[1] = 10;
  assert.deepEqual(readSegmentation(logits, geometry).result.lesions, []);
  assert.equal(readSegmentation(logits, geometry).mask.some(Boolean), false);
  for (const start of [10 * 128 + 10, 50 * 128 + 50]) {
    [start, start + 1, start + 128, start + 129].forEach((index) => {
      logits[index] = 2;
    });
  }
  assert.equal(readSegmentation(logits, geometry).result.lesions.length, 2);
});

test('classification crop masks background to120 and keeps lesion color after resizing', () => {
  const image = solidImage(256, 128, [255, 255, 255]);
  const { geometry } = prepareSegmentation(image);
  const logits = new Float32Array(area).fill(-10);
  for (let y = 48; y < 80; y += 1) {
    for (let x = 32; x < 96; x += 1) logits[y * 128 + x] = 10;
  }
  const { mask } = readSegmentation(logits, geometry);
  const tensor = prepareClassification(image, mask, geometry);
  assert.equal(tensor.length, area * 3);
  near(tensor[0], (120 / 255 - 0.485) / 0.229);
  near(tensor[64 * 128 + 64], (1 - 0.485) / 0.229);
  assert.throws(
    () => prepareClassification(image, new Uint8Array(area), geometry),
    /without a lesion/,
  );
});

test('softmax uses CL index0 and an uncertainty band and remains stable with extreme logits', () => {
  assert.equal(classifyLogits(new Float32Array([10, -10])).prediction, 'CL');
  assert.equal(classifyLogits(new Float32Array([-10, 10])).prediction, 'NON_CL');
  assert.equal(classifyLogits(new Float32Array([1, 0])).prediction, 'UNCERTAIN');
  const equal = classifyLogits(new Float32Array([10_000, 10_000]));
  assert.equal(equal.prediction, 'UNCERTAIN');
  near(equal.confidence, 0.5);
  assert.equal(classifyLogits(new Float32Array([10_000, -10_000])).confidence, 1);
});

test('malformed tensors, geometry, masks and images fail rather than producing plausible output', () => {
  const image = solidImage(2, 2);
  const { geometry } = prepareSegmentation(image);
  assert.throws(() => prepareSegmentation({ ...image, data: new Uint8Array(1) }), /RGBA/);
  assert.throws(() => readSegmentation(new Float32Array(2), geometry), /segmentation output/);
  const nan = new Float32Array(area);
  nan[0] = Number.NaN;
  assert.throws(() => readSegmentation(nan, geometry), /finite logits/);
  assert.throws(
    () => readSegmentation(new Float32Array(area), { ...geometry, left: 129 }),
    /geometry/,
  );
  assert.throws(
    () => prepareClassification(image, new Uint8Array(area).fill(255), geometry),
    /binary lesion mask/,
  );
  assert.throws(() => classifyLogits(new Float32Array([Infinity, 1])), /finite CL/);
  assert.throws(() => classifyLogits(new Float32Array([1])), /classifier output/);
});
