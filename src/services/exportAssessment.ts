import { Share } from 'react-native';
import { Assessment } from '../domain/types';
import { assessmentReport } from '../domain/report';

export async function exportAssessment(a: Assessment): Promise<void> {
  await Share.share({ title: `CLARA · ${a.patient.caseId}`, message: assessmentReport(a) });
}
