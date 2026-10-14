import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LesionImage } from '../domain/types';

/** Copy out of the picker/camera cache so photographs survive app restarts. */
export async function persistImage(
  uri: string,
  source: LesionImage['source'],
): Promise<LesionImage> {
  const resized = await manipulateAsync(uri, [{ resize: { width: 1000 } }], {
    compress: 0.75,
    format: SaveFormat.JPEG,
  });
  const folder = new Directory(Paths.document, 'cl-triage-images');
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(resized.uri).copy(target);
  return { uri: target.uri, width: resized.width, height: resized.height, source };
}

export async function clearImages(): Promise<void> {
  // Only this app-owned directory is touched. Never remove the document root.
  const folder = new Directory(Paths.document, 'cl-triage-images');
  if (folder.exists) folder.delete();
}
