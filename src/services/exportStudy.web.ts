import { Assessment } from '../domain/types';
import { studyCsv } from '../domain/study';

export async function exportStudy(cases: readonly Assessment[]): Promise<void> {
  const url = URL.createObjectURL(
    new Blob(['\ufeff', studyCsv(cases)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `CLARA-study-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
