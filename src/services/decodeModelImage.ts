import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import { decode } from 'jpeg-js';
import type { LesionImage } from '../domain/types';
import type { PixelImage } from './modelProcessing';

/** Bound memory use and normalize camera/gallery formats before local inference. */
export async function decodeModelImage(image: LesionImage): Promise<PixelImage> {
  const maxDimension = 1024;
  const resize = image.width >= image.height ? { width: maxDimension } : { height: maxDimension };
  const decoded = await manipulateAsync(
    image.uri,
    Math.max(image.width, image.height) > maxDimension ? [{ resize }] : [],
    { format: SaveFormat.JPEG, compress: 1, base64: true },
  );
  if (!decoded.base64) throw new Error('The photograph could not be decoded.');
  return decode(toByteArray(decoded.base64), {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: 2,
    maxMemoryUsageInMB: 64,
  });
}
