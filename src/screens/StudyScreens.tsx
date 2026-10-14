import React, { useState } from 'react';
import { View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Screen, PageTitle } from '../components/Screen';
import {
  Button,
  Card,
  Choices,
  EmptyState,
  Field,
  KeyValue,
  Note,
  SectionLabel,
  T,
} from '../components/ui';
import { CheckField } from '../components/CheckField';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { MicroscopyResult, RootStackParamList } from '../domain/types';
import { isSavedStudyAssessment, studyMetrics } from '../domain/study';
import { exportStudy } from '../services/exportStudy';
import { common, font } from '../theme';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const percentage = (value?: number) =>
  value === undefined ? 'Not available' : `${(value * 100).toFixed(1)}%`;

export function MicroscopyScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Microscopy'>>();
  const { data, recordMicroscopy, retrySave, notify } = useApp();
  const nav = useNav();
  const a = data.cases.find((record) => record.id === params.caseId);
  const [result, setResult] = useState('');
  const [testedAt, setTestedAt] = useState(today());
  const [laboratory, setLaboratory] = useState('');
  const [specimenId, setSpecimenId] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const pendingWrite = retry && !!a?.microscopy;
  if (!a || !isSavedStudyAssessment(a))
    return (
      <Screen narrow back="Back">
        <EmptyState
          title="Save the case first"
          description="Microscopy is recorded against a saved study case."
          action={<Button label="View History" onPress={() => nav.navigate('History')} />}
        />
      </Screen>
    );
  const save = async () => {
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(testedAt) &&
      Number.isFinite(Date.parse(testedAt)) &&
      new Date(testedAt).toISOString().slice(0, 10) === testedAt &&
      testedAt <= today();
    if (!pendingWrite && (!result || !validDate || !confirmed)) {
      setError(
        !result
          ? 'Select the result from the laboratory report.'
          : !validDate
            ? 'Enter a valid test date in YYYY-MM-DD format, no later than today.'
            : 'Confirm the case ID and laboratory report.',
      );
      return;
    }
    setBusy(true);
    setError('');
    const ok = pendingWrite
      ? await retrySave()
      : await recordMicroscopy(a.id, {
          result: (result === 'Positive'
            ? 'POSITIVE'
            : result === 'Negative'
              ? 'NEGATIVE'
              : 'INCONCLUSIVE') as MicroscopyResult['result'],
          testedAt,
          laboratory: laboratory.trim(),
          specimenId: specimenId.trim(),
          notes: notes.trim(),
        });
    setBusy(false);
    if (!ok) {
      setRetry(true);
      setError('The result could not be saved. Keep this screen open and retry.');
      return;
    }
    notify('Microscopy result saved');
    nav.replace('Detail', { id: a.id });
  };
  return (
    <Screen narrow back="Back to case">
      <PageTitle
        eyebrow="LABORATORY RECORD"
        title="Microscopy result"
        description={a.patient.caseId}
      />
      <View style={common.stack}>
        {a.microscopy && !retry ? (
          <>
            <Note>
              A microscopy result is already recorded for this case. The original record is
              retained.
            </Note>
            <Button label="View case" onPress={() => nav.replace('Detail', { id: a.id })} />
          </>
        ) : (
          <>
            <Note>
              Enter the laboratory report for this case ID. This does not change the saved model
              result.
            </Note>
            {!pendingWrite && (
              <Card>
                <SectionLabel label="Result from laboratory report" />
                <Choices
                  label="Microscopy result"
                  options={['Positive', 'Negative', 'Inconclusive']}
                  value={result}
                  onChange={setResult}
                  large
                />
                <Field
                  label="Test date (YYYY-MM-DD)"
                  value={testedAt}
                  onChangeText={setTestedAt}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
                <Field
                  label="Specimen / report ID"
                  optional
                  value={specimenId}
                  onChangeText={setSpecimenId}
                  maxLength={80}
                />
                <Field
                  label="Laboratory"
                  optional
                  value={laboratory}
                  onChangeText={setLaboratory}
                  maxLength={100}
                />
                <Field
                  label="Laboratory notes"
                  optional
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={1000}
                />
                <CheckField
                  label="I checked the case ID and laboratory report"
                  description="Confirm the entry before saving. The saved result cannot be overwritten in this version."
                  checked={confirmed}
                  onChange={setConfirmed}
                />
              </Card>
            )}
            {!!error && <Note tone="amber">{error}</Note>}
            <Button
              label={pendingWrite ? 'Retry saving microscopy' : 'Save microscopy result'}
              icon="save"
              loading={busy}
              onPress={() => {
                void save();
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

export function StudyScreen() {
  const { data } = useApp();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('All model versions');
  const all = [
    ...(data.draft ? [data.draft] : []),
    ...data.cases.filter((a) => a.id !== data.draft?.id),
  ];
  const versionOf = (a: (typeof all)[number]) =>
    a.initial?.modelVersion ?? a.analysisRun?.modelVersion ?? 'Version not recorded';
  const versions = [...new Set(all.filter((a) => a.workflow === 'feasibility-v1').map(versionOf))];
  const selected = versions.includes(version) ? version : 'All model versions';
  const scoped =
    selected === 'All model versions'
      ? all
      : all.filter((a) => a.workflow === 'feasibility-v1' && versionOf(a) === selected);
  const m = studyMetrics(scoped);
  const matrix = m.confusion;
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await exportStudy(all);
    } catch {
      setError('Study data could not be exported. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageTitle
        eyebrow="FEASIBILITY STUDY"
        title="Study results"
        description="Model results compared with recorded microscopy."
      />
      <View style={common.stack}>
        <Card>
          <SectionLabel label="Records on this device" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              ['Saved', m.savedStudyCases],
              ['Incomplete', m.incompleteStudyCases],
              ['Paired', m.pairedBinaryCases],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1, gap: 6 }}>
                <T tone="muted" style={{ fontSize: 12 }}>
                  {label}
                </T>
                <T style={{ fontSize: 27, fontFamily: font.displayBold }}>{value}</T>
              </View>
            ))}
          </View>
          {versions.length > 1 && (
            <Choices
              label="Model version"
              options={['All model versions', ...versions]}
              value={selected}
              onChange={setVersion}
            />
          )}
          {versions.length === 1 && (
            <T tone="muted" style={{ fontSize: 12 }}>
              {versions[0]}
            </T>
          )}
          {versions.length > 1 && selected === 'All model versions' && (
            <Note tone="amber">
              More than one model version is included. Select a version for a separate comparison.
            </Note>
          )}
        </Card>
        <Card>
          <SectionLabel label="Microscopy comparison" />
          <T tone="muted" style={{ fontSize: 13 }}>
            Calculated from {m.pairedBinaryCases} saved cases with a suggestive or non-suggestive
            model result and positive or negative microscopy.
          </T>
          <KeyValue
            label="Suggestive + microscopy positive (TP)"
            value={String(matrix.truePositive)}
          />
          <KeyValue
            label="Non-suggestive + microscopy positive (FN)"
            value={String(matrix.falseNegative)}
          />
          <KeyValue
            label="Non-suggestive + microscopy negative (TN)"
            value={String(matrix.trueNegative)}
          />
          <KeyValue
            label="Suggestive + microscopy negative (FP)"
            value={String(matrix.falsePositive)}
          />
          <KeyValue label="Sensitivity" value={percentage(m.sensitivity)} />
          <KeyValue label="Specificity" value={percentage(m.specificity)} />
          <KeyValue label="Accuracy" value={percentage(m.accuracy)} />
          <KeyValue
            label="Positive predictive value"
            value={percentage(m.positivePredictiveValue)}
          />
          <KeyValue
            label="Negative predictive value"
            value={percentage(m.negativePredictiveValue)}
          />
          <KeyValue label="Balanced accuracy" value={percentage(m.balancedAccuracy)} />
          <Note>
            These descriptive figures use microscopy as the comparison test. They exclude
            inconclusive and missing results and do not establish clinical performance. A zero
            denominator is shown as “Not available”.
          </Note>
        </Card>
        <Card>
          <SectionLabel label="Missing and inconclusive results" />
          <KeyValue
            label="Saved cases without a model result"
            value={String(m.missingModelResultCases)}
          />
          <KeyValue label="Model result inconclusive" value={String(m.modelInconclusiveCases)} />
          <KeyValue label="Microscopy not recorded" value={String(m.microscopyMissingCases)} />
          <KeyValue label="Microscopy inconclusive" value={String(m.microscopyInconclusiveCases)} />
          <T tone="muted" style={{ fontSize: 12 }}>
            Counts may overlap. These cases stay in the export.
          </T>
        </Card>
        <Card>
          <SectionLabel label="App feasibility" />
          <KeyValue
            label="Saved cases with completed analysis"
            value={`${m.modelCompletedCases} / ${m.savedStudyCases}`}
          />
          <KeyValue label="Saved cases with failed analysis" value={String(m.modelFailedCases)} />
          <KeyValue
            label="Analysis completion among saved cases"
            value={percentage(m.analysisCompletedRate)}
          />
          <KeyValue
            label="Median last-attempt analysis time"
            value={
              m.medianAnalysisDurationMs === undefined
                ? 'Not available'
                : `${(m.medianAnalysisDurationMs / 1000).toFixed(1)} seconds`
            }
          />
          <T tone="muted" style={{ fontSize: 12 }}>
            Time is from {m.analysisDurationCount} completed analyses. Earlier retries, abandoned
            visits, staff usability and overall visit time are not measured here.
          </T>
          {m.legacyCases > 0 && (
            <T tone="muted" style={{ fontSize: 12 }}>
              {m.legacyCases} earlier-workflow records are excluded from study calculations.
            </T>
          )}
        </Card>
        {!!error && <Note tone="amber">{error}</Note>}
        <Button
          label="Export all study data (CSV)"
          icon="share"
          loading={busy}
          disabled={!all.length}
          onPress={() => {
            void download();
          }}
        />
        <T tone="muted" style={{ fontSize: 12 }}>
          Export includes all local records and eligibility flags, including incomplete cases and
          earlier-workflow records. Photographs are not included.
        </T>
        <Button label="View History" variant="secondary" onPress={() => nav.navigate('History')} />
      </View>
    </Screen>
  );
}
