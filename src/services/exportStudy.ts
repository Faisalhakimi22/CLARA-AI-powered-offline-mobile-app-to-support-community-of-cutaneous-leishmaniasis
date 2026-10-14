import { Share } from 'react-native';
import { Assessment } from '../domain/types';
import { studyCsv } from '../domain/study';

export async function exportStudy(cases: readonly Assessment[]): Promise<void> {
  await Share.share({ title: 'CLARA study data (CSV)', message: studyCsv(cases) });
}
