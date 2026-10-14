import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { PageTitle, Screen } from '../components/Screen';
import { Button } from '../components/ui';
import { AssessmentSummary } from '../components/AssessmentSummary';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { MissingAssessment } from './AssessmentScreens';
import { common } from '../theme';

/** Resumes older unsaved summaries; new assessments save directly from the model result. */
export function SummaryScreen() {
  const { data, saveAssessment, notify, retrySave } = useApp();
  const nav = useNav();
  const snapshot = useRef(data.draft);
  if (data.draft) snapshot.current = data.draft;
  const [busy, setBusy] = useState(false);
  const a = data.draft ?? snapshot.current;
  if (!a) return <MissingAssessment />;
  const complete = async () => {
    setBusy(true);
    const saved = data.draft ? await saveAssessment(true) : await retrySave();
    setBusy(false);
    if (!saved) return;
    notify('Case saved');
    nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Detail', params: { id: a.id } }] });
  };
  return (
    <Screen narrow assessment>
      <PageTitle title="Case summary" description={a.patient.caseId} />
      <View style={common.stack}>
        <AssessmentSummary assessment={a} />
        <Button
          label="Save Case"
          icon="save"
          loading={busy}
          onPress={() => {
            void complete();
          }}
        />
      </View>
    </Screen>
  );
}
