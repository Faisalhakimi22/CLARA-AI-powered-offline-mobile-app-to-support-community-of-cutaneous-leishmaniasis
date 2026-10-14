import { AppData, Assessment, StaffProfile } from '../domain/types';

export function newAssessment(recorder?: StaffProfile): Assessment {
  const stamp = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    workflow: 'feasibility-v1',
    recorder: recorder ? { ...recorder } : undefined,
    patient: {
      caseId: `CL-${new Date().getFullYear()}-${id.slice(-7).toUpperCase()}`,
      age: '',
      sex: '',
    },
    clinical: {},
    createdAt: stamp,
    updatedAt: stamp,
    status: 'Pending Review',
    step: 'Patient',
  };
}

export function initialData(): AppData {
  return {
    version: 3,
    consentAt: null,
    profile: { name: '', role: '', facility: '' },
    cases: [],
    draft: null,
  };
}
