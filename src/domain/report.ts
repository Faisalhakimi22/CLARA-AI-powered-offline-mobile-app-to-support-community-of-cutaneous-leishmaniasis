import { Assessment } from './types';
import { clinicalQuestions, predictionLabel } from './clinical';
import { statusLabel } from './study';

export function assessmentReport(a: Assessment): string {
  const microscopy = a.microscopy;
  return [
    'CLARA — FEASIBILITY STUDY CASE',
    `Case ID: ${a.patient.caseId}`,
    `Workflow: ${a.workflow}`,
    `Status: ${statusLabel(a)}`,
    `Created: ${a.createdAt}`,
    `Saved: ${a.completedAt || 'Incomplete'}`,
    `Age: ${a.patient.age || 'Not recorded'}`,
    `Sex: ${a.patient.sex || 'Not recorded'}`,
    `Recorded by: ${a.recorder ? `${a.recorder.name} (${a.recorder.role})` : 'Not recorded'}`,
    `Facility: ${a.recorder?.facility || 'Not recorded'}`,
    `Collection permission: ${a.collectionConsentAt || 'Not confirmed'}`,
    '',
    'PHOTOGRAPH',
    a.image
      ? `Photograph stored locally (${a.image.source}); not included in this export.`
      : 'No photograph recorded.',
    a.quality
      ? `${a.quality.message}. Reviewed at ${a.quality.checkedAt}.`
      : 'Photo review incomplete.',
    '',
    'ORIGINAL IMAGE MODEL RESULT',
    `Model version: ${a.initial?.modelVersion ?? a.analysisRun?.modelVersion ?? 'Not recorded'}`,
    `Analysis status: ${a.analysisRun?.status ?? 'Not recorded'}`,
    `Result: ${a.initial ? predictionLabel(a.initial.prediction) : 'No model result'}`,
    ...(a.initial
      ? [
          a.initial.message,
          a.segmentation?.lesions.length === 0
            ? 'No classification score available.'
            : `Model score (uncalibrated): ${a.initial.confidence}`,
        ]
      : []),
    ...(a.analysisRun
      ? [
          `Started: ${a.analysisRun.startedAt}`,
          `Finished: ${a.analysisRun.finishedAt}`,
          `Last attempt duration (ms): ${a.analysisRun.durationMs}`,
        ]
      : []),
    ...(a.analysisRun?.failure
      ? [
          `Failure: ${a.analysisRun.failure.code || 'Unspecified'} — ${a.analysisRun.failure.message}`,
        ]
      : []),
    '',
    'CLINICAL INFORMATION (NOT USED TO MODIFY THE MODEL RESULT)',
    ...clinicalQuestions.map((q) => `${q.short}: ${a.clinical[q.key] || 'Not recorded'}`),
    '',
    'MICROSCOPY — SEPARATE LABORATORY RECORD',
    ...(microscopy
      ? [
          `Result: ${microscopy.result}`,
          `Test date: ${microscopy.testedAt}`,
          `Laboratory: ${microscopy.laboratory || 'Not recorded'}`,
          `Specimen / report ID: ${microscopy.specimenId || 'Not recorded'}`,
          `Entered by: ${microscopy.recordedBy.name} (${microscopy.recordedBy.role})`,
          `Recorded: ${microscopy.recordedAt}`,
          `Notes: ${microscopy.notes || 'None'}`,
        ]
      : ['Not recorded. Do not interpret a missing result as negative.']),
    ...(a.workflow === 'legacy-triage'
      ? [
          '',
          'PREVIOUS WORKFLOW — EXCLUDED FROM STUDY CALCULATIONS',
          ...(a.review
            ? [
                `Original worker decision: ${a.review.prediction}`,
                `Reviewer: ${a.review.reviewer.name}`,
                `Review time: ${a.review.reviewedAt}`,
                `Notes: ${a.review.notes}`,
                `Next step: ${a.review.nextStep}`,
              ]
            : []),
          ...(a.referral
            ? [
                `Original referral: ${a.referral.status}`,
                `Destination: ${a.referral.destination}`,
                `Reason: ${a.referral.reason}`,
                `Priority: ${a.referral.priority}`,
                `Notes: ${a.referral.notes}`,
                `Recorded: ${a.referral.updatedAt}`,
              ]
            : []),
        ]
      : []),
    '',
    'Research record only. The model output is not a diagnosis or a calibrated probability of disease.',
    'Handle this export under the study information-governance procedures.',
  ].join('\n');
}

export function reportFilename(a: Assessment) {
  return `CLARA-${a.patient.caseId.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
}
