import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../domain/types';
import { initialData } from '../data/defaults';
import { migrateV1, migrateV2 } from '../domain/migration';

export const STORAGE_KEY = '@cl-triage/workspace/v3';
const PREVIOUS_KEY = '@cl-triage/workspace/v2';
// Retained only to migrate existing installations without losing entered cases.
const LEGACY_KEY = '@cl-triage/research-prototype/v1';
let writes: Promise<void> = Promise.resolve();

export async function loadData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const previous = await AsyncStorage.getItem(PREVIOUS_KEY);
    const old = previous ? null : await AsyncStorage.getItem(LEGACY_KEY);
    const data = previous
      ? migrateV2(JSON.parse(previous))
      : old
        ? migrateV1(JSON.parse(old))
        : initialData();
    await persistData(data);
    if (previous) await AsyncStorage.removeItem(PREVIOUS_KEY);
    if (old) await AsyncStorage.removeItem(LEGACY_KEY);
    return data;
  }
  const data = JSON.parse(raw) as AppData;
  if (data.version !== 3 || !Array.isArray(data.cases) || !data.profile) {
    throw new Error('Local data could not be opened. Clear local data to start again.');
  }
  return data;
}

/** Serialize writes so rapid edits can never overwrite a more recent snapshot. */
export function persistData(data: AppData): Promise<void> {
  const snapshot = JSON.stringify(data);
  const next = writes
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot));
  writes = next;
  return next;
}

export async function resetData(): Promise<void> {
  await persistData(initialData());
  await AsyncStorage.removeItem(PREVIOUS_KEY);
  await AsyncStorage.removeItem(LEGACY_KEY);
}
