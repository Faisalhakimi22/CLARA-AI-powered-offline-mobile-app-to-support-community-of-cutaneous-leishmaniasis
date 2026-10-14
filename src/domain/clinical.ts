import { Assessment, ClinicalAnswers, Prediction } from './types';

export const clinicalQuestions: {
  key: keyof ClinicalAnswers;
  title: string;
  short: string;
  hint: string;
  options: string[];
}[] = [
  {
    key: 'duration',
    title: 'How long has the lesion been present?',
    short: 'Lesion duration',
    hint: 'Use the patient’s best estimate.',
    options: ['Less than 2 weeks', '2–4 weeks', '1–3 months', 'More than 3 months', 'Unknown'],
  },
  {
    key: 'pain',
    title: 'Is the lesion painful?',
    short: 'Pain',
    hint: 'Ask about pain at rest or when the lesion is touched.',
    options: ['Yes', 'No', 'Unknown'],
  },
  {
    key: 'itching',
    title: 'Is the lesion itchy?',
    short: 'Itching',
    hint: 'Ask whether the patient has noticed itching.',
    options: ['Yes', 'No', 'Unknown'],
  },
  {
    key: 'count',
    title: 'How many lesions are present?',
    short: 'Number of lesions',
    hint: 'Include lesions the patient has noticed elsewhere.',
    options: ['One', '2–5', 'More than 5', 'Unknown'],
  },
  {
    key: 'location',
    title: 'Where is the lesion located?',
    short: 'Lesion location',
    hint: 'Choose the location of the photographed lesion.',
    options: ['Face or neck', 'Arm or hand', 'Leg or foot', 'Trunk', 'Other', 'Unknown'],
  },
  {
    key: 'exposure',
    title: 'Has the patient been in an area where CL is common?',
    short: 'Possible exposure',
    hint: 'Consider where the patient lives, works, or has travelled.',
    options: ['Yes', 'No', 'Unknown'],
  },
];

export function validatePatient(patient: Assessment['patient']) {
  const errors: { caseId?: string; age?: string } = {};
  if (!patient.caseId.trim()) errors.caseId = 'Enter a case ID to continue.';
  else if (!/^[a-zA-Z0-9 _-]{2,40}$/.test(patient.caseId.trim()))
    errors.caseId = 'Use 2–40 letters, numbers, spaces, dashes or underscores.';
  if (patient.age && (!/^\d{1,3}$/.test(patient.age) || Number(patient.age) > 120))
    errors.age = 'Enter a whole number from 0 to 120, or leave blank.';
  return errors;
}

export function unansweredClinicalQuestions(answers: ClinicalAnswers) {
  // An explicit “Unknown” is a saved answer, so it must not be asked again.
  return clinicalQuestions.filter((q) => !q.options.includes(answers[q.key] ?? ''));
}

export function allQuestionsAnswered(answers: ClinicalAnswers) {
  return unansweredClinicalQuestions(answers).length === 0;
}

export const predictionLabel = (prediction?: Prediction) =>
  prediction === 'CL'
    ? 'Suggestive of CL'
    : prediction === 'NON_CL'
      ? 'Non-suggestive of CL'
      : prediction === 'UNCERTAIN'
        ? 'Inconclusive'
        : 'Not available';

export function recommendationFor(prediction?: Prediction) {
  if (prediction === 'CL')
    return {
      title: 'Suspected CL',
      subtitle: 'Clinical Confirmation Recommended',
      description:
        'CL has been recorded as a possible cause. A lesion image cannot confirm the cause. Appropriate clinical and laboratory assessment is needed.',
      next: 'Refer for clinical evaluation and appropriate laboratory confirmation under local protocols.',
    };
  if (prediction === 'NON_CL')
    return {
      title: 'Low Suspicion',
      subtitle: 'Clinical Review as Appropriate',
      description:
        'The recorded triage decision indicates low suspicion. This does not rule out CL or another condition.',
      next: 'Use clinical judgement to arrange review, particularly if the lesion persists, worsens, or remains concerning.',
    };
  return {
    title: 'Uncertain',
    subtitle: 'Further Clinical/Laboratory Assessment Recommended',
    description:
      'The available information is insufficient for a reliable triage assessment. Appropriate clinical or laboratory evaluation is needed.',
    next: 'Arrange further clinical assessment and appropriate testing or referral under local protocols.',
  };
}

export const finalPrediction = (assessment: Assessment) =>
  assessment.analysisRun?.status === 'failed' ? undefined : assessment.initial?.prediction;

export function canCompleteAssessment(a: Assessment) {
  const run = a.analysisRun;
  const initial = a.initial;
  const validRun = !!(
    run &&
    Number.isFinite(Date.parse(run.startedAt)) &&
    Number.isFinite(Date.parse(run.finishedAt)) &&
    Date.parse(run.finishedAt) >= Date.parse(run.startedAt) &&
    Number.isFinite(run.durationMs) &&
    run.durationMs >= 0 &&
    (run.status === 'completed'
      ? initial &&
        ['CL', 'NON_CL', 'UNCERTAIN'].includes(initial.prediction) &&
        Number.isFinite(initial.confidence) &&
        initial.confidence >= 0 &&
        initial.confidence <= 1 &&
        initial.message.trim() &&
        !run.failure
      : run.status === 'failed' && !initial && run.failure?.message.trim())
  );
  return !!(
    a.workflow === 'feasibility-v1' &&
    Object.keys(validatePatient(a.patient)).length === 0 &&
    a.recorder?.name.trim() &&
    a.recorder.role.trim() &&
    a.collectionConsentAt &&
    a.image?.uri &&
    a.quality &&
    (a.quality.acceptable || a.quality.overridden) &&
    validRun
  );
}
export const formatDate = (value: string, withTime = false) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

export function resumableStep(a: Assessment): Assessment['step'] {
  if (a.workflow === 'legacy-triage' || a.completedAt) return 'Summary';
  if (!a.collectionConsentAt) return 'Patient';
  if (!a.image) return a.step === 'Patient' ? 'Patient' : 'Capture';
  if (!a.quality) return 'Quality';
  // Restore the user's photo decision until they explicitly accept the image.
  if (a.step === 'Quality' || (!a.quality.acceptable && !a.quality.overridden)) return 'Quality';
  return a.analysisRun?.status === 'completed' ? 'Initial' : 'Processing';
}
