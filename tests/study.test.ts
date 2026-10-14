import test from 'node:test';
import assert from 'node:assert/strict';
import { newAssessment } from '../src/data/defaults';
import { canCompleteAssessment, finalPrediction } from '../src/domain/clinical';
import { migrateV1, migrateV2 } from '../src/domain/migration';
import {
  csvCell,
  isValidMicroscopy,
  patchStudyDraft,
  protectSavedStudyAssessment,
  studyCsv,
  studyMetrics,
} from '../src/domain/study';
import { Assessment, Prediction } from '../src/domain/types';

const staff = { name: 'Study operator', role: 'Technician', facility: 'Study site' };
const stamp = '2026-10-14T08:00:00.000Z';
test('microscopy date uses the local calendar day and rejects impossible dates', () => {
  const now = new Date(2026, 9, 14, 0, 5);
  const entry = { result: 'POSITIVE' as const, testedAt: '2026-10-14', recordedAt: now.toISOString(), recordedBy: staff };
  assert.equal(isValidMicroscopy(entry), true);
  assert.equal(isValidMicroscopy({ ...entry, testedAt: '2026-10-15' }), false);
  assert.equal(isValidMicroscopy({ ...entry, testedAt: '2026-02-30' }), false);
});
function caseWith(
  prediction: Prediction = 'CL',
  microscopy?: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE',
): Assessment {
  return {
    ...newAssessment(staff),
    patient: { caseId: 'STUDY-001', age: '30', sex: 'Female' },
    collectionConsentAt: stamp,
    image: { uri: 'file:///test.jpg', width: 100, height: 100, source: 'camera' },
    quality: {
      source: 'user',
      checkedAt: stamp,
      checks: { focus: true, lighting: true, framing: true },
      acceptable: true,
      message: 'Accepted',
    },
    initial: {
      prediction,
      confidence: 0.9,
      message: 'Research result',
      modelVersion: 'fixed-model',
    },
    analysisRun: {
      status: 'completed',
      startedAt: stamp,
      finishedAt: stamp,
      durationMs: 100,
      modelVersion: 'fixed-model',
    },
    status: 'Completed',
    completedAt: stamp,
    step: 'Summary',
    ...(microscopy
      ? {
          microscopy: {
            result: microscopy,
            testedAt: '2026-10-14',
            recordedAt: stamp,
            recordedBy: staff,
          },
        }
      : {}),
  };
}

test('completion needs an actual result or explicit failure, never a staff decision', () => {
  const a = caseWith();
  assert.equal(canCompleteAssessment(a), true);
  assert.equal(canCompleteAssessment({ ...a, initial: undefined }), false);
  assert.equal(canCompleteAssessment({ ...a, recorder: undefined }), false);
  assert.equal(canCompleteAssessment({ ...a, patient: { ...a.patient, age: '999' } }), false);
  const failed = {
    ...a,
    initial: undefined,
    analysisRun: {
      ...a.analysisRun!,
      status: 'failed' as const,
      failure: { message: 'Runtime unavailable' },
    },
  };
  assert.equal(canCompleteAssessment(failed), true);
  assert.equal(finalPrediction(failed), undefined);
  assert.equal(canCompleteAssessment({ ...failed, initial: a.initial }), false);
});

test('paired metrics keep failures, uncertain, missing and legacy cases out of binary denominators', () => {
  const cases = [
    caseWith('CL', 'POSITIVE'),
    caseWith('CL', 'POSITIVE'),
    caseWith('NON_CL', 'POSITIVE'),
    caseWith('NON_CL', 'NEGATIVE'),
    caseWith('CL', 'NEGATIVE'),
    caseWith('UNCERTAIN', 'POSITIVE'),
    caseWith('CL'),
    caseWith('NON_CL', 'INCONCLUSIVE'),
  ];
  const failed = caseWith();
  failed.initial = undefined;
  failed.analysisRun = {
    ...failed.analysisRun!,
    status: 'failed',
    failure: { message: 'No runtime' },
  };
  cases.push(
    failed,
    { ...caseWith('CL', 'POSITIVE'), workflow: 'legacy-triage' },
    newAssessment(staff),
  );
  const m = studyMetrics(cases);
  assert.equal(m.savedStudyCases, 9);
  assert.equal(m.incompleteStudyCases, 1);
  assert.equal(m.legacyCases, 1);
  assert.equal(m.pairedBinaryCases, 5);
  assert.deepEqual(m.confusion, {
    truePositive: 2,
    falseNegative: 1,
    trueNegative: 1,
    falsePositive: 1,
  });
  assert.equal(m.sensitivity, 2 / 3);
  assert.equal(m.specificity, 1 / 2);
  assert.equal(m.accuracy, 3 / 5);
  assert.equal(m.modelInconclusiveCases, 1);
  assert.equal(m.modelFailedCases, 1);
  assert.equal(m.microscopyMissingCases, 2);
  assert.equal(m.microscopyInconclusiveCases, 1);
  assert.equal(m.analysisCompletedRate, 8 / 9);
});

test('zero denominators are unavailable, not zero or perfect accuracy', () => {
  assert.equal(studyMetrics([]).accuracy, undefined);
  assert.equal(studyMetrics([caseWith('CL', 'POSITIVE')]).specificity, undefined);
  assert.equal(studyMetrics([caseWith('UNCERTAIN', 'NEGATIVE')]).pairedBinaryCases, 0);
});

test('saved original evidence is immutable and microscopy may be recorded once', () => {
  const original = caseWith('NON_CL');
  const changed = caseWith('CL', 'POSITIVE');
  const preserved = protectSavedStudyAssessment(original, changed);
  assert.deepEqual(preserved.initial, original.initial);
  assert.deepEqual(preserved.image, original.image);
  assert.deepEqual(preserved.analysisRun, original.analysisRun);
  assert.deepEqual(preserved.patient, original.patient);
  assert.equal(preserved.microscopy?.result, 'POSITIVE');
  assert.equal(protectSavedStudyAssessment(preserved, caseWith('CL', 'NEGATIVE')), preserved);
  assert.equal(patchStudyDraft(original, { initial: changed.initial }), original);
});

test('replacing an unsaved photograph invalidates image-dependent output', () => {
  const a = { ...caseWith(), completedAt: undefined, status: 'Pending Review' as const };
  const patched = patchStudyDraft(a, {
    image: { ...a.image!, uri: 'file:///new.jpg' },
    initial: a.initial,
  });
  assert.equal(patched.initial, undefined);
  assert.equal(patched.analysisRun, undefined);
  assert.equal(patched.quality, undefined);
  assert.deepEqual(patched.recorder, staff);
});

test('migration preserves historical outputs and an unsaved draft without making either study evidence', () => {
  const old = {
    ...caseWith('CL', 'POSITIVE'),
    referral: {
      destination: 'Clinic',
      reason: 'Follow up',
      priority: 'Routine',
      notes: '',
      status: 'Referred',
      updatedAt: stamp,
    },
  };
  const pending = { ...old, id: 'draft', step: 'Review', completedAt: undefined };
  const migrated = migrateV2({
    version: 2,
    profile: staff,
    consentAt: stamp,
    cases: [old],
    draft: pending,
  });
  assert.equal(migrated.version, 3);
  assert.equal(migrated.draft, null);
  assert.equal(migrated.cases.length, 2);
  assert.deepEqual(migrated.cases[1].initial, old.initial);
  assert.deepEqual(migrated.cases[1].referral, old.referral);
  assert.equal(studyMetrics(migrated.cases).totalStudyCases, 0);
  assert.equal(
    migrateV1({ version: 1, profile: staff, cases: [], draft: pending }).cases.length,
    1,
  );
});

test('CSV preserves missing outcomes and neutralizes formula-like user text', () => {
  const a = caseWith();
  a.patient.caseId = '=SUM(1,2)';
  const csv = studyCsv([a]);
  assert.match(csv, /study_eligible/);
  assert.match(csv, /NOT_RECORDED/);
  assert.match(csv, /'=SUM\(1,2\)/);
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('  @payload'), '"\'  @payload"');
});
