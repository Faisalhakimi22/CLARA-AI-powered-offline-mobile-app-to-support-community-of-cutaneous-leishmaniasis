import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Screen, PageTitle } from '../components/Screen';
import { Button, Card, Note, Stepper, T } from '../components/ui';
import { MissingAssessment } from './AssessmentScreens';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { assessmentService } from '../services/assessmentService';
import { colors, common } from '../theme';
import { ModelStage } from '../domain/types';
import { ModelRuntimeUnavailableError } from '../services/modelErrors';
import manifest from '../../assets/models/manifest.json';

export function ProcessingScreen() {
  const { data, updateDraft, saveAssessment, retrySave, notify } = useApp();
  const nav = useNav();
  const focused = useIsFocused();
  const snapshot = useRef(data.draft);
  if (data.draft) snapshot.current = data.draft;
  const a = data.draft ?? snapshot.current;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modelStage, setModelStage] = useState<ModelStage | null>(null);
  const request = useRef(0);
  useEffect(() => {
    if (!focused || !a?.image || a.completedAt) return;
    let active = true;
    const requestId = ++request.current;
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    setError('');
    setModelStage(null);
    updateDraft({ initial: undefined, segmentation: undefined, analysisRun: undefined });
    assessmentService
      .analyzeImage(a.image, (stage) => {
        if (active && request.current === requestId) setModelStage(stage);
      })
      .then(({ segmentation, classification }) => {
        if (!active || request.current !== requestId) return;
        updateDraft({
          segmentation,
          initial: classification,
          updated: undefined,
          review: undefined,
          analysisRun: {
            status: 'completed',
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - started),
            modelVersion: classification.modelVersion ?? manifest.id,
          },
          step: 'Initial',
        });
        nav.replace('Initial');
      })
      .catch((cause: unknown) => {
        if (!active || request.current !== requestId) return;
        const message =
          cause instanceof ModelRuntimeUnavailableError
            ? cause.message
            : 'Image analysis could not be completed. Retry or save the case without a model result.';
        updateDraft({
          initial: undefined,
          segmentation: undefined,
          analysisRun: {
            status: 'failed',
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - started),
            modelVersion: manifest.id,
            failure: {
              code:
                cause instanceof ModelRuntimeUnavailableError
                  ? 'RUNTIME_UNAVAILABLE'
                  : 'ANALYSIS_FAILED',
              message,
            },
          },
        });
        setError(message);
      });
    return () => {
      active = false;
    };
  }, [focused, attempt, a?.image?.uri, a?.id]);
  if (!a?.image) return <MissingAssessment />;
  const saveFailure = async () => {
    request.current++;
    setBusy(true);
    const ok = data.draft ? await saveAssessment(true) : await retrySave();
    setBusy(false);
    if (!ok) return;
    notify('Case saved without a model result');
    nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Detail', params: { id: a.id } }] });
  };
  return (
    <Screen narrow assessment>
      <Stepper step={3} />
      <PageTitle
        eyebrow="IMAGE ANALYSIS"
        title={error ? 'Analysis unavailable' : 'Analysing photo'}
        description={a.patient.caseId}
      />
      <View style={common.stack}>
        <Card style={{ padding: 28, gap: 22 }}>
          {error ? (
            <Note tone="amber">{error}</Note>
          ) : (
            <>
              <ActivityIndicator color={colors.teal} size="large" />
              <T style={{ textAlign: 'center' }}>
                {modelStage === 'classification'
                  ? 'Assessing the lesion image'
                  : 'Finding the lesion outline'}
              </T>
              <T tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>
                Processing on this device.
              </T>
            </>
          )}
        </Card>
        {!!error && (
          <>
            {!!data.draft && (
              <Button
                label="Retry analysis"
                icon="refresh-cw"
                disabled={busy}
                onPress={() => setAttempt((v) => v + 1)}
              />
            )}
            <Button
              label="Save without model result"
              icon="save"
              loading={busy}
              onPress={() => {
                void saveFailure();
              }}
              variant="secondary"
            />
            <Note>
              The failed analysis will be recorded separately from suggestive, non-suggestive and
              inconclusive results.
            </Note>
          </>
        )}
      </View>
    </Screen>
  );
}
