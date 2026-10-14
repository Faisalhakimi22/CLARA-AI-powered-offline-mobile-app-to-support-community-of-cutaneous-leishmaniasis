import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { PageTitle, Screen } from '../components/Screen';
import { Badge, Button, Card, EmptyState, Note, Score, Stepper, T } from '../components/ui';
import { ImagePreview, SegmentationPreview } from '../components/Illustrations';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { predictionLabel } from '../domain/clinical';
import { common, font } from '../theme';

export function MissingAssessment() {
  const nav = useNav();
  return (
    <Screen narrow>
      <EmptyState
        title="No assessment open"
        description="Start or resume an assessment from the home screen."
        action={<Button label="Return home" onPress={() => nav.navigate('Home')} />}
      />
    </Screen>
  );
}

export function InitialResultScreen() {
  const { data, updateDraft, saveAssessment, retrySave, notify } = useApp();
  const nav = useNav();
  // Failed storage writes may already have moved the case out of draft in memory.
  // Keep the record visible so the same save can be retried safely.
  const snapshot = useRef(data.draft);
  if (data.draft) snapshot.current = data.draft;
  const [busy, setBusy] = useState(false);
  const a = data.draft ?? snapshot.current;
  if (!a?.initial) return <MissingAssessment />;
  const save = async () => {
    setBusy(true);
    const ok = data.draft ? await saveAssessment(true) : await retrySave();
    setBusy(false);
    if (!ok) return;
    notify('Case saved');
    nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Detail', params: { id: a.id } }] });
  };
  return (
    <Screen narrow assessment>
      <Stepper step={3} />
      <PageTitle eyebrow="MODEL RESULT" title="Image assessment" description={a.patient.caseId} />
      <View style={common.stack}>
        <Card>
          <Badge label="Image model" tone="neutral" dot={false} />
          <T
            accessibilityRole="header"
            style={{ fontFamily: font.displayBold, fontSize: 27, lineHeight: 35 }}
          >
            {predictionLabel(a.initial.prediction)}
          </T>
          <T tone="muted" style={{ fontSize: 13, lineHeight: 22 }}>
            {a.initial.prediction === 'CL'
              ? 'The image model found features suggestive of CL.'
              : a.initial.prediction === 'NON_CL'
                ? 'The image model did not find strong features of CL. This does not rule out CL.'
                : a.segmentation?.lesions.length === 0
                  ? 'The model could not outline the lesion reliably.'
                  : 'The model could not give a clear result from this image.'}
          </T>
          {a.segmentation?.lesions.length === 0 ? (
            <T tone="muted" style={{ fontSize: 13 }}>
              No classification score available.
            </T>
          ) : (
            <Score value={a.initial.confidence} />
          )}
          {a.segmentation && a.segmentation.lesions.length > 0 && a.image ? (
            <View style={{ gap: 9 }}>
              <T style={{ fontFamily: font.semibold, fontSize: 13 }}>Lesion outline</T>
              <SegmentationPreview image={a.image} segmentation={a.segmentation} height={220} />
            </View>
          ) : (
            <ImagePreview image={a.image} height={220} />
          )}
          {a.quality?.overridden && (
            <Note tone="amber" title="Image quality warning">
              This photo was used despite a quality concern.
            </Note>
          )}
        </Card>
        <Note title="Research result">
          This is not a diagnosis. Save the result for comparison with microscopy using the same
          case ID.
        </Note>
        <Button
          label="Save Case"
          icon="save"
          onPress={() => {
            void save();
          }}
          loading={busy}
        />
        {!!data.draft && (
          <Button
            label="Retake Photo"
            icon="camera"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              updateDraft({ step: 'Capture' });
              nav.replace('Capture', { retake: true });
            }}
          />
        )}
      </View>
    </Screen>
  );
}
