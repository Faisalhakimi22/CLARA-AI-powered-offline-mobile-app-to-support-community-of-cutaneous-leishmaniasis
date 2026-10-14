import { AppData, Assessment } from './types';
import { initialData } from '../data/defaults';

/** Preserve entered records from v1 without treating generated outputs as clinical evidence. */
export function migrateV1(value: unknown): AppData {
  const previous = value as Record<string, any>;
  if (previous?.version !== 1 || !Array.isArray(previous.cases))
    throw new Error('The existing workspace could not be read.');
  const clean = (record: any): Assessment | null => {
    if (!record || record.isSeed || !record.patient || !record.id) return null;
    const image =
      record.image && ['camera', 'gallery'].includes(record.image.source)
        ? record.image
        : undefined;
    return {
      id: record.id,
      workflow: 'legacy-triage',
      patient: record.patient,
      clinical: record.clinical ?? {},
      image,
      referral: record.referral,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: 'Pending Review',
      step: 'Patient',
    };
  };
  const unchangedProfile =
    previous.profile?.name === 'Dr. Sarah Ahmed' &&
    previous.profile.role === 'Medical officer' &&
    previous.profile.facility === 'Community health centre';
  const profile =
    previous.profile?.name && !unchangedProfile
      ? {
          name: previous.profile.name,
          role: previous.profile.role ?? '',
          facility: previous.profile.facility ?? '',
        }
      : initialData().profile;
  return {
    ...initialData(),
    consentAt: previous.consentAt ?? null,
    profile,
    cases: [previous.draft, ...previous.cases.filter((a: any) => a.id !== previous.draft?.id)]
      .map(clean)
      .filter((a: Assessment | null): a is Assessment => a !== null),
    draft: null,
  };
}

/** Keep every prior triage result and referral, without relabelling it as study evidence. */
export function migrateV2(value: unknown): AppData {
  const previous = value as Record<string, any>;
  if (previous?.version !== 2 || !Array.isArray(previous.cases) || !previous.profile) {
    throw new Error('The existing workspace could not be read.');
  }
  const migrateRecord = (record: any): Assessment => {
    if (!record || !record.id || !record.patient || !record.clinical) {
      throw new Error('An existing case could not be read.');
    }
    // Spread retains historical clinical reviews, referrals, and all original timestamps.
    // Keep the earlier screen name as historical metadata; legacy records are read-only.
    return { ...record, workflow: 'legacy-triage' } as Assessment;
  };
  return {
    ...previous,
    version: 3,
    consentAt: previous.consentAt ?? null,
    profile: { ...previous.profile },
    cases: [
      ...(previous.draft ? [migrateRecord(previous.draft)] : []),
      ...previous.cases.filter((a: any) => a.id !== previous.draft?.id).map(migrateRecord),
    ],
    draft: null,
  } as AppData;
}
