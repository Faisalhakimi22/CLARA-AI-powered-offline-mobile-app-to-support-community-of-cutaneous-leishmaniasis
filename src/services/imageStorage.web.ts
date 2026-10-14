import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LesionImage } from '../domain/types';

/** Web stores a compact data URL, not an expiring blob URL. No upload is performed. */
export async function persistImage(
  uri: string,
  source: LesionImage['source'],
): Promise<LesionImage> {
  const image = await manipulateAsync(uri, [{ resize: { width: 800 } }], {
    compress: 0.65,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!image.base64) throw new Error('This photo could not be saved. Try another image.');
  return {
    uri: `data:image/jpeg;base64,${image.base64}`,
    width: image.width,
    height: image.height,
    source,
  };
}

export async function clearImages(): Promise<void> {
  // Image data is part of the local app snapshot and is removed when it is cleared.
}
