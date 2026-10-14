import { Assessment } from '../domain/types';
import { assessmentReport, reportFilename } from '../domain/report';

export async function exportAssessment(a: Assessment): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([assessmentReport(a)], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename(a);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
