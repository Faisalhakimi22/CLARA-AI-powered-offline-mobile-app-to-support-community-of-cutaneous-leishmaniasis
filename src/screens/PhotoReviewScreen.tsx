import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, PageTitle } from '../components/Screen';
import { Badge, Button, Card, Note, Stepper } from '../components/ui';
import { CheckField } from '../components/CheckField';
import { ImagePreview } from '../components/Illustrations';
import { MissingAssessment } from './AssessmentScreens';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { common } from '../theme';

export function QualityScreen() {
  const { data, updateDraft } = useApp();
  const nav = useNav();
  const a = data.draft;
  const [checks, setChecks] = useState(
    a?.quality?.checks ?? { focus: false, lighting: false, framing: false },
  );
  const [reviewed, setReviewed] = useState(false);
  if (!a?.image) return <MissingAssessment />;
  const acceptable = checks.focus && checks.lighting && checks.framing;
  const next = () => {
    if (!reviewed) return;
    updateDraft({
      quality: {
        source: 'user',
        checkedAt: new Date().toISOString(),
        checks,
        acceptable,
        overridden: !acceptable,
        message: acceptable
          ? 'Photo accepted after visual review'
          : 'Photo accepted with quality limitations',
      },
      step: 'Processing',
    });
    nav.navigate('Processing');
  };
  return (
    <Screen narrow assessment>
      <Stepper step={2} />
      <PageTitle
        eyebrow="CHECK THE PHOTOGRAPH"
        title="Check the photo"
        description="Confirm focus, lighting and framing before image analysis."
      />
      <View style={common.stack}>
        <Card>
          <ImagePreview image={a.image} height={300} />
          <Badge label="Visual review by health worker" tone="neutral" dot={false} />
          <CheckField
            label="Lesion details are in focus"
            checked={checks.focus}
            onChange={(focus) => setChecks({ ...checks, focus })}
          />
          <CheckField
            label="Lighting is even and adequate"
            checked={checks.lighting}
            onChange={(lighting) => setChecks({ ...checks, lighting })}
          />
          <CheckField
            label="The entire lesion is clearly framed"
            checked={checks.framing}
            onChange={(framing) => setChecks({ ...checks, framing })}
          />
          {!acceptable && (
            <Note tone="amber">
              Check the statements that apply. If the image is blurry, poorly lit, or incomplete,
              another photo is recommended.
            </Note>
          )}
          <CheckField
            label="I have reviewed this photograph"
            description="These checks record your visual review. No automatic image-quality analysis is performed."
            checked={reviewed}
            onChange={setReviewed}
          />
        </Card>
        <Button
          label={acceptable ? 'Continue to Assessment' : 'Use Photo with Limitations'}
          icon="arrow-right"
          disabled={!reviewed}
          onPress={next}
        />
        <Button
          label="Retake Photo"
          icon="camera"
          variant="secondary"
          onPress={() => nav.replace('Capture', { retake: true })}
        />
      </View>
    </Screen>
  );
}
