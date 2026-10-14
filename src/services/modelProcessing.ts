import type { AIResult, SegmentationResult } from '../domain/types';

/** Must match training/train_models.py and the exported ONNX input shapes. */
export const MODEL_IMAGE_SIZE = 128;
const AREA = MODEL_IMAGE_SIZE * MODEL_IMAGE_SIZE;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface SegmentationGeometry {
  resizedWidth: number;
  resizedHeight: number;
  left: number;
  top: number;
}

function validateImage(image: PixelImage): void {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > 4096 ||
    image.height > 4096 ||
    image.width * image.height > 16_777_216 ||
    !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new Error('Invalid RGBA image dimensions or pixel data.');
  }
}

// Python/Pillow round uses ties-to-even. Match training even for unusual aspect ratios.
function roundEven(value: number): number {
  const integer = Math.floor(value);
  return value - integer === 0.5 ? integer + (integer % 2) : Math.round(value);
}

function imageGeometry(image: PixelImage): SegmentationGeometry {
  const scale = MODEL_IMAGE_SIZE / Math.max(image.width, image.height);
  const resizedWidth = Math.max(1, roundEven(image.width * scale));
  const resizedHeight = Math.max(1, roundEven(image.height * scale));
  return {
    resizedWidth,
    resizedHeight,
    left: Math.floor((MODEL_IMAGE_SIZE - resizedWidth) / 2),
    top: Math.floor((MODEL_IMAGE_SIZE - resizedHeight) / 2),
  };
}

function validateGeometry(geometry: SegmentationGeometry): void {
  const { resizedWidth, resizedHeight, left, top } = geometry;
  if (
    ![resizedWidth, resizedHeight, left, top].every(Number.isSafeInteger) ||
    resizedWidth < 1 ||
    resizedHeight < 1 ||
    left < 0 ||
    top < 0 ||
    left + resizedWidth > MODEL_IMAGE_SIZE ||
    top + resizedHeight > MODEL_IMAGE_SIZE
  ) {
    throw new Error('Invalid segmentation letterbox geometry.');
  }
}

interface AxisSample {
  indices: number[];
  weights: number[];
}

/** Antialiased bilinear sampling, including its expanded support on downsampling. */
function axisSamples(source: number, destination: number): AxisSample[] {
  const scale = source / destination;
  const support = Math.max(1, scale);
  return Array.from({ length: destination }, (_, index) => {
    const center = (index + 0.5) * scale;
    const indices: number[] = [];
    const weights: number[] = [];
    let total = 0;
    const first = Math.max(0, Math.floor(center - support));
    const last = Math.min(source - 1, Math.ceil(center + support));
    for (let pixel = first; pixel <= last; pixel += 1) {
      const weight = Math.max(0, 1 - Math.abs(pixel + 0.5 - center) / support);
      if (weight > 0) {
        indices.push(pixel);
        weights.push(weight);
        total += weight;
      }
    }
    return { indices, weights: weights.map((weight) => weight / total) };
  });
}

/** Returns RGB in CHW order, with values in 0..255 before model normalization. */
function resizePixels(
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number,
  sample: (x: number, y: number, channel: number) => number,
): Float32Array {
  const xs = axisSamples(width, outputWidth);
  const ys = axisSamples(height, outputHeight);
  const horizontal = new Float32Array(height * outputWidth * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const axis = xs[x];
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let k = 0; k < axis.indices.length; k += 1) {
          value += sample(axis.indices[k], y, channel) * axis.weights[k];
        }
        // Pillow RGB intermediate samples are 8-bit, as in the training pipeline.
        horizontal[(y * outputWidth + x) * 3 + channel] = Math.round(value);
      }
    }
  }
  const outputArea = outputWidth * outputHeight;
  const result = new Float32Array(outputArea * 3);
  for (let y = 0; y < outputHeight; y += 1) {
    const axis = ys[y];
    for (let x = 0; x < outputWidth; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let k = 0; k < axis.indices.length; k += 1) {
          value += horizontal[(axis.indices[k] * outputWidth + x) * 3 + channel] * axis.weights[k];
        }
        result[channel * outputArea + y * outputWidth + x] = Math.round(value);
      }
    }
  }
  return result;
}

function normalize(value: number, channel: number): number {
  return (value / 255 - MEAN[channel]) / STD[channel];
}

export function prepareSegmentation(image: PixelImage): {
  tensor: Float32Array;
  geometry: SegmentationGeometry;
} {
  validateImage(image);
  const geometry = imageGeometry(image);
  const { resizedWidth, resizedHeight, left, top } = geometry;
  const resized = resizePixels(
    image.width,
    image.height,
    resizedWidth,
    resizedHeight,
    (x, y, c) => image.data[(y * image.width + x) * 4 + c],
  );
  const tensor = new Float32Array(AREA * 3);
  const resizedArea = resizedWidth * resizedHeight;
  for (let channel = 0; channel < 3; channel += 1) {
    tensor.fill(normalize(114, channel), channel * AREA, (channel + 1) * AREA);
    for (let y = 0; y < resizedHeight; y += 1) {
      for (let x = 0; x < resizedWidth; x += 1) {
        tensor[channel * AREA + (top + y) * MODEL_IMAGE_SIZE + left + x] = normalize(
          resized[channel * resizedArea + y * resizedWidth + x],
          channel,
        );
      }
    }
  }
  return { tensor, geometry };
}

interface Point {
  x: number;
  y: number;
}

interface Edge {
  start: number;
  end: number;
  direction: number;
  visited: boolean;
}

function signedArea(points: Point[]): number {
  return (
    points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

/** Trace pixel-cell boundaries; do not substitute a bounding rectangle for the lesion. */
function outerContour(component: number[], mask: Uint8Array): Point[] {
  const stride = MODEL_IMAGE_SIZE + 1;
  const edges: Edge[] = [];
  const outgoing = new Map<number, Edge[]>();
  const add = (x1: number, y1: number, x2: number, y2: number, direction: number) => {
    const edge: Edge = {
      start: y1 * stride + x1,
      end: y2 * stride + x2,
      direction,
      visited: false,
    };
    edges.push(edge);
    const existing = outgoing.get(edge.start);
    if (existing) existing.push(edge);
    else outgoing.set(edge.start, [edge]);
  };
  for (const index of component) {
    const x = index % MODEL_IMAGE_SIZE;
    const y = Math.floor(index / MODEL_IMAGE_SIZE);
    if (y === 0 || !mask[index - MODEL_IMAGE_SIZE]) add(x, y, x + 1, y, 0);
    if (x === MODEL_IMAGE_SIZE - 1 || !mask[index + 1]) add(x + 1, y, x + 1, y + 1, 1);
    if (y === MODEL_IMAGE_SIZE - 1 || !mask[index + MODEL_IMAGE_SIZE])
      add(x + 1, y + 1, x, y + 1, 2);
    if (x === 0 || !mask[index - 1]) add(x, y + 1, x, y, 3);
  }
  let largest: Point[] = [];
  let largestArea = 0;
  for (const first of edges) {
    if (first.visited) continue;
    const loop: Point[] = [];
    let edge: Edge | undefined = first;
    while (edge && !edge.visited) {
      edge.visited = true;
      loop.push({ x: edge.start % stride, y: Math.floor(edge.start / stride) });
      if (edge.end === first.start) break;
      const direction: number = edge.direction;
      const candidates: Edge[] = (outgoing.get(edge.end) ?? []).filter((next) => !next.visited);
      // Keep foreground to our right where a boundary touches itself diagonally.
      const priority = [1, 0, 3, 2];
      edge = candidates.sort(
        (a: Edge, b: Edge): number =>
          priority.indexOf((a.direction - direction + 4) % 4) -
          priority.indexOf((b.direction - direction + 4) % 4),
      )[0];
    }
    const area = signedArea(loop);
    // Interior holes have the opposite winding; UI polygons represent outer edges.
    if (area > largestArea) {
      largestArea = area;
      largest = loop;
    }
  }
  const corners = largest.filter((point, i) => {
    const before = largest[(i + largest.length - 1) % largest.length];
    const after = largest[(i + 1) % largest.length];
    return (
      (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x)
    );
  });
  // Bound vector-rendering work while keeping sampled vertices on the true boundary.
  if (corners.length > 512) {
    return Array.from({ length: 512 }, (_, i) => corners[Math.floor((i * corners.length) / 512)]);
  }
  return corners;
}

export function readSegmentation(
  logits: Float32Array,
  geometry: SegmentationGeometry,
): { result: SegmentationResult; mask: Uint8Array } {
  validateGeometry(geometry);
  if (logits.length !== AREA || !logits.every(Number.isFinite)) {
    throw new Error('Invalid segmentation output: expected 128 × 128 finite logits.');
  }
  const mask = new Uint8Array(AREA);
  const { left, top, resizedWidth, resizedHeight } = geometry;
  for (let y = top; y < top + resizedHeight; y += 1) {
    for (let x = left; x < left + resizedWidth; x += 1) {
      const index = y * MODEL_IMAGE_SIZE + x;
      mask[index] = logits[index] >= 0 ? 1 : 0;
    }
  }
  const visited = new Uint8Array(AREA);
  const components: number[][] = [];
  for (let origin = 0; origin < AREA; origin += 1) {
    if (!mask[origin] || visited[origin]) continue;
    const component = [origin];
    visited[origin] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor];
      const x = index % MODEL_IMAGE_SIZE;
      const neighbours = [
        index >= MODEL_IMAGE_SIZE ? index - MODEL_IMAGE_SIZE : -1,
        index < AREA - MODEL_IMAGE_SIZE ? index + MODEL_IMAGE_SIZE : -1,
        x > 0 ? index - 1 : -1,
        x < MODEL_IMAGE_SIZE - 1 ? index + 1 : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] && !visited[neighbour]) {
          visited[neighbour] = 1;
          component.push(neighbour);
        }
      }
    }
    if (component.length < 4)
      component.forEach((index) => {
        mask[index] = 0;
      });
    else components.push(component);
  }
  if (components.length > 128) {
    throw new Error(
      'The lesion outline is too fragmented to interpret. Retake the image or save without a model result.',
    );
  }
  const lesions = components
    .map((component) => ({
      polygon: outerContour(component, mask).flatMap((point) => [
        Math.max(0, Math.min(1, (point.x - left) / resizedWidth)),
        Math.max(0, Math.min(1, (point.y - top) / resizedHeight)),
      ]),
      confidence:
        component.reduce((sum, index) => sum + 1 / (1 + Math.exp(-logits[index])), 0) /
        component.length,
    }))
    .filter((lesion) => lesion.polygon.length >= 6);
  return {
    result: {
      lesions,
      message: lesions.length
        ? 'Model-generated lesion outline.'
        : 'No lesion outline was identified.',
    },
    mask,
  };
}

export function prepareClassification(
  image: PixelImage,
  mask: Uint8Array,
  geometry: SegmentationGeometry,
): Float32Array {
  validateImage(image);
  validateGeometry(geometry);
  const expected = imageGeometry(image);
  if (
    (Object.keys(expected) as (keyof SegmentationGeometry)[]).some(
      (key) => geometry[key] !== expected[key],
    )
  ) {
    throw new Error('Segmentation geometry does not match the source image.');
  }
  if (mask.length !== AREA || !mask.every((value) => value === 0 || value === 1)) {
    throw new Error('Invalid binary lesion mask.');
  }
  const { left, top, resizedWidth, resizedHeight } = geometry;
  let minX = MODEL_IMAGE_SIZE;
  let minY = MODEL_IMAGE_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = top; y < top + resizedHeight; y += 1) {
    for (let x = left; x < left + resizedWidth; x += 1) {
      if (!mask[y * MODEL_IMAGE_SIZE + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  if (maxX < 0) throw new Error('Cannot classify an image without a lesion mask.');
  const x1 = (minX - left) / resizedWidth;
  const y1 = (minY - top) / resizedHeight;
  const x2 = (maxX - left) / resizedWidth;
  const y2 = (maxY - top) / resizedHeight;
  const padX = Math.max(0.04, (x2 - x1) * 0.25);
  const padY = Math.max(0.04, (y2 - y1) * 0.25);
  const cropLeft = Math.max(0, Math.floor((x1 - padX) * image.width));
  const cropTop = Math.max(0, Math.floor((y1 - padY) * image.height));
  const cropRight = Math.min(
    image.width,
    Math.max(cropLeft + 1, Math.floor((x2 + padX) * image.width)),
  );
  const cropBottom = Math.min(
    image.height,
    Math.max(cropTop + 1, Math.floor((y2 + padY) * image.height)),
  );
  const pixels = resizePixels(
    cropRight - cropLeft,
    cropBottom - cropTop,
    MODEL_IMAGE_SIZE,
    MODEL_IMAGE_SIZE,
    (x, y, channel) => {
      const sourceX = x + cropLeft;
      const sourceY = y + cropTop;
      const maskX =
        left +
        Math.min(resizedWidth - 1, Math.floor(((sourceX + 0.5) * resizedWidth) / image.width));
      const maskY =
        top +
        Math.min(resizedHeight - 1, Math.floor(((sourceY + 0.5) * resizedHeight) / image.height));
      return mask[maskY * MODEL_IMAGE_SIZE + maskX]
        ? image.data[(sourceY * image.width + sourceX) * 4 + channel]
        : 120;
    },
  );
  for (let channel = 0; channel < 3; channel += 1) {
    for (let index = 0; index < AREA; index += 1) {
      pixels[channel * AREA + index] = normalize(pixels[channel * AREA + index], channel);
    }
  }
  return pixels;
}

/** Scores are uncalibrated research outputs, not probabilities of a clinical diagnosis.
 * The 0.2–0.8 review band is experimental and must be validated before clinical use.
 */
export function classifyLogits(logits: Float32Array): AIResult {
  if (logits.length !== 2 || !logits.every(Number.isFinite)) {
    throw new Error('Invalid classifier output: expected finite CL and NON_CL logits.');
  }
  const maximum = Math.max(logits[0], logits[1]);
  const clScore = Math.exp(logits[0] - maximum);
  const nonClScore = Math.exp(logits[1] - maximum);
  const score = clScore / (clScore + nonClScore);
  const confidence = Math.max(score, 1 - score);
  if (score > 0.8) {
    return {
      prediction: 'CL',
      confidence,
      message: 'The lesion image is suggestive of CL.',
    };
  }
  if (score < 0.2) {
    return {
      prediction: 'NON_CL',
      confidence,
      message: 'The lesion image is non-suggestive of CL. This does not rule out CL.',
    };
  }
  return {
    prediction: 'UNCERTAIN',
    confidence,
    message: 'The model could not give a conclusive result from this image.',
  };
}
