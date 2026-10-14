import { Assessment, MicroscopyResult } from './types';
import { canCompleteAssessment } from './clinical';

export function isSavedStudyAssessment(a: Assessment): boolean {
  return !!(
    a.workflow === 'feasibility-v1' &&
    a.status === 'Completed' &&
    a.completedAt &&
    canCompleteAssessment(a)
  );
}

export function statusLabel(a: Assessment): string {
  if (a.workflow === 'legacy-triage') return 'Earlier workflow';
  return isSavedStudyAssessment(a) ? 'Saved' : 'Incomplete';
}

export function isValidMicroscopy(value: MicroscopyResult): boolean {
  // Date-only lab reports refer to the local calendar day, not midnight UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.testedAt);
  const tested = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value.testedAt);
  const validCalendarDate = !dateOnly || (
    tested.getFullYear() === Number(dateOnly[1]) &&
    tested.getMonth() === Number(dateOnly[2]) - 1 &&
    tested.getDate() === Number(dateOnly[3])
  );
  return !!(
    ['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'].includes(value.result) &&
    validCalendarDate && Number.isFinite(tested.getTime()) &&
    Number.isFinite(Date.parse(value.recordedAt)) &&
    tested.getTime() <= Date.parse(value.recordedAt) &&
    value.recordedBy?.name.trim() &&
    value.recordedBy.role.trim()
  );
}

/** Saved model evidence is immutable. A microscopy result can be added once, separately. */
export function protectSavedStudyAssessment(original: Assessment, next: Assessment): Assessment {
  if (original.workflow !== 'feasibility-v1' || !original.completedAt) return next;
  if (!original.microscopy && next.microscopy && isValidMicroscopy(next.microscopy)) {
    return {
      ...original,
      microscopy: next.microscopy,
      updatedAt: next.microscopy.recordedAt,
    };
  }
  return original;
}

/** Photo changes invalidate every image-dependent result before another analysis. */
export function patchStudyDraft(original: Assessment, patch: Partial<Assessment>): Assessment {
  if (original.workflow !== 'feasibility-v1' || original.completedAt) return original;
  const imageChanged = Object.hasOwn(patch, 'image') && patch.image !== original.image;
  const next = {
    ...original,
    ...(imageChanged
      ? { quality: undefined, initial: undefined, segmentation: undefined, analysisRun: undefined }
      : {}),
    ...patch,
    // Neither a caller's patch nor a model result can change attribution or identity.
    id: original.id,
    workflow: original.workflow,
    recorder: original.recorder,
    createdAt: original.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (imageChanged) {
    next.initial = undefined;
    next.segmentation = undefined;
    next.analysisRun = undefined;
  }
  return next;
}

export interface StudyMetrics {
  totalStudyCases: number;
  savedStudyCases: number;
  incompleteStudyCases: number;
  legacyCases: number;
  /** All counts below use saved eligible study cases, including recorded failures. */
  modelCompletedCases: number;
  modelFailedCases: number;
  missingModelResultCases: number;
  modelInconclusiveCases: number;
  microscopyMissingCases: number;
  microscopyInconclusiveCases: number;
  pairedBinaryCases: number;
  confusion: {
    truePositive: number;
    falseNegative: number;
    trueNegative: number;
    falsePositive: number;
  };
  /** Fractions from 0 to 1; undefined means the denominator is zero. */
  sensitivity?: number;
  specificity?: number;
  accuracy?: number;
  positivePredictiveValue?: number;
  negativePredictiveValue?: number;
  balancedAccuracy?: number;
  analysisCompletedRate?: number;
  medianAnalysisDurationMs?: number;
  analysisDurationCount: number;
}

const divide = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : undefined;

function hasBinaryPair(a: Assessment): boolean {
  return !!(
    isSavedStudyAssessment(a) &&
    a.analysisRun?.status === 'completed' &&
    a.initial &&
    ['CL', 'NON_CL'].includes(a.initial.prediction) &&
    a.microscopy &&
    isValidMicroscopy(a.microscopy) &&
    ['POSITIVE', 'NEGATIVE'].includes(a.microscopy.result)
  );
}

/** Descriptive internal study results, not a clinical validation or a diagnosis. */
export function studyMetrics(cases: readonly Assessment[]): StudyMetrics {
  const study = cases.filter((a) => a.workflow === 'feasibility-v1');
  const saved = study.filter(isSavedStudyAssessment);
  const pairs = saved.filter(hasBinaryPair);
  const confusion = { truePositive: 0, falseNegative: 0, trueNegative: 0, falsePositive: 0 };
  for (const a of pairs) {
    if (a.microscopy!.result === 'POSITIVE') {
      if (a.initial!.prediction === 'CL') confusion.truePositive++;
      else confusion.falseNegative++;
    } else if (a.initial!.prediction === 'NON_CL') confusion.trueNegative++;
    else confusion.falsePositive++;
  }
  const { truePositive: tp, falseNegative: fn, trueNegative: tn, falsePositive: fp } = confusion;
  const sensitivity = divide(tp, tp + fn);
  const specificity = divide(tn, tn + fp);
  const completed = saved.filter((a) => a.analysisRun?.status === 'completed');
  const durations = completed.map((a) => a.analysisRun!.durationMs).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const medianAnalysisDurationMs = durations.length
    ? durations.length % 2
      ? durations[middle]
      : (durations[middle - 1] + durations[middle]) / 2
    : undefined;
  return {
    totalStudyCases: study.length,
    savedStudyCases: saved.length,
    incompleteStudyCases: study.length - saved.length,
    legacyCases: cases.filter((a) => a.workflow !== 'feasibility-v1').length,
    modelCompletedCases: completed.length,
    modelFailedCases: saved.filter((a) => a.analysisRun?.status === 'failed').length,
    missingModelResultCases: saved.filter((a) => !a.initial).length,
    modelInconclusiveCases: completed.filter((a) => a.initial?.prediction === 'UNCERTAIN').length,
    microscopyMissingCases: saved.filter((a) => !a.microscopy || !isValidMicroscopy(a.microscopy))
      .length,
    microscopyInconclusiveCases: saved.filter(
      (a) =>
        a.microscopy && isValidMicroscopy(a.microscopy) && a.microscopy.result === 'INCONCLUSIVE',
    ).length,
    pairedBinaryCases: pairs.length,
    confusion,
    sensitivity,
    specificity,
    accuracy: divide(tp + tn, pairs.length),
    positivePredictiveValue: divide(tp, tp + fp),
    negativePredictiveValue: divide(tn, tn + fn),
    balancedAccuracy:
      sensitivity !== undefined && specificity !== undefined
        ? (sensitivity + specificity) / 2
        : undefined,
    analysisCompletedRate: divide(completed.length, saved.length),
    medianAnalysisDurationMs,
    analysisDurationCount: durations.length,
  };
}

/** Quote every cell and neutralize spreadsheet formulas, including whitespace-prefixed payloads. */
export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safe =
    /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Include non-paired records so failures and missing reference results stay visible. */
export function studyCsv(cases: readonly Assessment[]): string {
  const headers = [
    'record_id',
    'case_id',
    'workflow',
    'study_eligible',
    'pair_eligible',
    'record_status',
    'created_at',
    'saved_at',
    'age',
    'sex',
    'recorder_name',
    'recorder_role',
    'recorder_facility',
    'collection_permission_at',
    'photo_source',
    'photo_quality_accepted',
    'analysis_status',
    'analysis_started_at',
    'analysis_finished_at',
    'analysis_duration_ms',
    'model_version',
    'model_result',
    'model_score_uncalibrated',
    'model_message',
    'failure_code',
    'failure_message',
    'microscopy_result',
    'microscopy_tested_at',
    'microscopy_recorded_at',
    'laboratory',
    'specimen_id',
    'microscopy_recorded_by',
    'microscopy_recorder_role',
    'microscopy_notes',
    'lesion_duration',
    'pain',
    'itching',
    'lesion_count',
    'lesion_location',
    'exposure',
    'legacy_worker_decision',
    'legacy_referral_status',
  ];
  const rows = cases.map((a) => [
    a.id,
    a.patient.caseId,
    a.workflow,
    isSavedStudyAssessment(a),
    hasBinaryPair(a),
    statusLabel(a),
    a.createdAt,
    a.completedAt,
    a.patient.age,
    a.patient.sex,
    a.recorder?.name,
    a.recorder?.role,
    a.recorder?.facility,
    a.collectionConsentAt,
    a.image?.source,
    a.quality ? !!(a.quality.acceptable || a.quality.overridden) : '',
    a.analysisRun?.status ?? (a.workflow === 'legacy-triage' ? 'LEGACY_NOT_TRACKED' : 'NOT_RUN'),
    a.analysisRun?.startedAt,
    a.analysisRun?.finishedAt,
    a.analysisRun?.durationMs,
    a.initial?.modelVersion ?? a.analysisRun?.modelVersion,
    a.initial?.prediction ?? 'NO_RESULT',
    a.initial && a.segmentation?.lesions.length !== 0 ? a.initial.confidence : '',
    a.initial?.message,
    a.analysisRun?.failure?.code,
    a.analysisRun?.failure?.message,
    a.microscopy?.result ?? 'NOT_RECORDED',
    a.microscopy?.testedAt,
    a.microscopy?.recordedAt,
    a.microscopy?.laboratory,
    a.microscopy?.specimenId,
    a.microscopy?.recordedBy.name,
    a.microscopy?.recordedBy.role,
    a.microscopy?.notes,
    a.clinical.duration,
    a.clinical.pain,
    a.clinical.itching,
    a.clinical.count,
    a.clinical.location,
    a.clinical.exposure,
    a.workflow === 'legacy-triage' ? a.review?.prediction : '',
    a.workflow === 'legacy-triage' ? a.referral?.status : '',
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
