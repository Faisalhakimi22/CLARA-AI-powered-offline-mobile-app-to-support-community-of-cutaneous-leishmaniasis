export type Prediction = 'CL' | 'NON_CL' | 'UNCERTAIN';

export interface LesionImage {
  uri: string;
  width: number;
  height: number;
  source: 'camera' | 'gallery';
}

/** Provider-neutral contracts. Confidence must be a finite number between 0 and 1. */
export interface AIResult {
  prediction: Prediction;
  confidence: number;
  message: string;
  /** Persisted with the case so results remain attributable after model updates. */
  modelVersion?: string;
}

/** Polygon coordinates are normalized to the source image: x/y values in [0, 1]. */
export interface SegmentedLesion {
  polygon: number[];
  confidence: number;
}

/** Provider-neutral output of stage one. Native masks are converted to polygons by the adapter. */
export interface SegmentationResult {
  lesions: SegmentedLesion[];
  message: string;
  modelVersion?: string;
}

export type ModelStage = 'segmentation' | 'classification';

export interface ImageAssessmentResult {
  segmentation: SegmentationResult;
  classification: AIResult;
}

export interface AdaptiveResult {
  prediction: Prediction;
  confidence: number;
  factors: string[];
  recommendation: string;
}

export interface QualityResult {
  source: 'user';
  checkedAt: string;
  checks: { focus: boolean; lighting: boolean; framing: boolean };
  acceptable: boolean;
  message: string;
  overridden?: boolean;
}

export interface ClinicalAnswers {
  duration?: string;
  pain?: string;
  itching?: string;
  count?: string;
  location?: string;
  exposure?: string;
}

export interface Patient {
  caseId: string;
  age: string;
  sex: string;
}

export interface StaffProfile {
  name: string;
  role: string;
  facility: string;
}

/** Timing and outcome of the original image-analysis attempt, never a staff prediction. */
export interface AnalysisRun {
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelVersion?: string;
  failure?: { code?: string; message: string };
}

/** Microscopy is recorded independently after the original model output is saved. */
export interface MicroscopyResult {
  result: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  testedAt: string;
  recordedAt: string;
  recordedBy: StaffProfile;
  laboratory?: string;
  specimenId?: string;
  notes?: string;
}

export type MicroscopyEntry = Omit<MicroscopyResult, 'recordedAt' | 'recordedBy'>;

export interface ClinicalReview {
  prediction: Prediction;
  notes: string;
  nextStep: string;
  reviewer: { name: string; role: string; facility: string };
  reviewedAt: string;
}

export interface Referral {
  destination: string;
  reason: string;
  priority: 'Routine' | 'Priority' | 'Urgent';
  notes: string;
  status: 'Draft' | 'Referred';
  updatedAt: string;
}

export type AssessmentStep =
  'Patient' | 'Capture' | 'Quality' | 'Processing' | 'Initial' | 'Summary';
export type CaseStatus = 'Completed' | 'Referred' | 'Pending Review';

export interface Assessment {
  id: string;
  /** Old triage/review records are retained, but excluded from this feasibility study. */
  workflow: 'feasibility-v1' | 'legacy-triage';
  recorder?: StaffProfile;
  patient: Patient;
  clinical: ClinicalAnswers;
  collectionConsentAt?: string;
  image?: LesionImage;
  quality?: QualityResult;
  segmentation?: SegmentationResult;
  initial?: AIResult;
  analysisRun?: AnalysisRun;
  microscopy?: MicroscopyResult;
  updated?: AdaptiveResult;
  review?: ClinicalReview;
  reviewDraft?: { prediction?: Prediction; notes: string; nextStep: string };
  referral?: Referral;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  step: AssessmentStep;
  completedAt?: string;
}

export interface AppData {
  version: 3;
  consentAt: string | null;
  profile: StaffProfile;
  cases: Assessment[];
  draft: Assessment | null;
}

/** Implement both stages with on-device or remote models; screens stay unchanged. */
export interface AssessmentProvider {
  segmentLesion(image: LesionImage): Promise<SegmentationResult>;
  classifyLesion(image: LesionImage, segmentation: SegmentationResult): Promise<AIResult>;
  combineAssessment?(
    image: LesionImage,
    initial: AIResult,
    answers: ClinicalAnswers,
  ): Promise<AdaptiveResult>;
}

export type RootStackParamList = {
  Welcome: undefined;
  Consent: undefined;
  ProfileSetup: undefined;
  Home: undefined;
  Patient: undefined;
  Capture: { retake?: boolean } | undefined;
  Quality: undefined;
  Processing: undefined;
  Initial: undefined;
  Summary: undefined;
  Study: undefined;
  Microscopy: { caseId: string };
  History: { filter?: CaseStatus } | undefined;
  Detail: { id: string };
  Settings: undefined;
  Help: undefined;
  Prevention: undefined;
  Info: {
    topic: 'Privacy' | 'Data security' | 'About the app' | 'Assessment guide';
  };
};
