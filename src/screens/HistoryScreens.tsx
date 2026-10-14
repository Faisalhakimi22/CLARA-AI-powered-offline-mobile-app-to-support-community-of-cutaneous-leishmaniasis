import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { PageTitle, Screen } from '../components/Screen';
import {
  Badge,
  Button,
  Card,
  Choices,
  EmptyState,
  Field,
  Icon,
  Note,
  ResultBadge,
  T,
} from '../components/ui';
import { AssessmentSummary } from '../components/AssessmentSummary';
import { ExportButton } from '../components/ExportButton';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { RootStackParamList } from '../domain/types';
import { formatDate, predictionLabel, resumableStep } from '../domain/clinical';
import { useStartAssessment } from './HomeScreen';
import { common, font } from '../theme';

export function HistoryScreen() {
  const { data } = useApp();
  const nav = useNav();
  const route = useRoute<RouteProp<RootStackParamList, 'History'>>();
  const start = useStartAssessment();
  const [query, setQuery] = useState('');
  const filter =
    route.params?.filter === 'Completed'
      ? 'Saved'
      : route.params?.filter === 'Pending Review'
        ? 'Incomplete'
        : 'All';
  const all = [
    ...(data.draft ? [data.draft] : []),
    ...data.cases.filter((a) => a.id !== data.draft?.id),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cases = all.filter(
    (a) =>
      (filter === 'All' ||
        (a.workflow === 'feasibility-v1' &&
          (filter === 'Saved' ? !!a.completedAt : !a.completedAt))) &&
      `${a.patient.caseId} ${predictionLabel(a.initial?.prediction)} ${a.completedAt ? 'Saved' : 'Incomplete'}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <Screen>
      <PageTitle
        eyebrow="LOCAL RECORDS"
        title="Case history"
        description="Find a case by its study ID."
        action={<Button label="New Assessment" icon="plus" onPress={start} />}
      />
      <View style={common.stack}>
        <Card>
          <Field
            label="Search cases"
            value={query}
            onChangeText={setQuery}
            placeholder="Case ID or model result"
            autoCapitalize="none"
          />
          <Choices
            label="Case status"
            options={['All', 'Saved', 'Incomplete']}
            value={filter}
            onChange={(value) =>
              nav.setParams({
                filter:
                  value === 'Saved'
                    ? 'Completed'
                    : value === 'Incomplete'
                      ? 'Pending Review'
                      : undefined,
              })
            }
          />
        </Card>
        <T tone="muted" style={{ fontSize: 12 }}>
          {cases.length} {cases.length === 1 ? 'case' : 'cases'}
        </T>
        {cases.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${a.patient.caseId}`}
            onPress={() => nav.navigate('Detail', { id: a.id })}
          >
            <Card>
              <View style={common.between}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={{ fontFamily: font.semibold }}>{a.patient.caseId}</T>
                  <T tone="muted" style={{ fontSize: 12 }}>
                    {formatDate(a.createdAt)}
                  </T>
                </View>
                <Badge
                  label={
                    a.workflow !== 'feasibility-v1'
                      ? 'Previous workflow'
                      : a.completedAt
                        ? 'Saved'
                        : 'Incomplete'
                  }
                  tone={a.completedAt ? 'teal' : 'neutral'}
                />
                <Icon name="chevron-right" size={16} />
              </View>
              <View style={{ gap: 8 }}>
                <T tone="muted" style={{ fontSize: 12 }}>
                  Model result
                </T>
                {a.initial ? (
                  <ResultBadge prediction={a.initial.prediction} />
                ) : (
                  <T style={{ fontSize: 14 }}>
                    {a.analysisRun?.status === 'failed' ? 'Analysis unavailable' : 'Not recorded'}
                  </T>
                )}
                {a.workflow === 'feasibility-v1' && (
                  <T tone="muted" style={{ fontSize: 12 }}>
                    Microscopy:{' '}
                    {a.microscopy
                      ? a.microscopy.result === 'POSITIVE'
                        ? 'Positive'
                        : a.microscopy.result === 'NEGATIVE'
                          ? 'Negative'
                          : 'Inconclusive'
                      : 'Not recorded'}
                  </T>
                )}
              </View>
            </Card>
          </Pressable>
        ))}
        {!cases.length && (
          <EmptyState
            title="No cases found"
            description="Start a new assessment or change the search."
            action={<Button label="Start New Assessment" icon="plus" onPress={start} />}
          />
        )}
        <Button
          label="Study results"
          variant="secondary"
          icon="bar-chart-2"
          onPress={() => nav.navigate('Study')}
        />
      </View>
    </Screen>
  );
}

export function DetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  const { data, resumeAssessment, saveAssessment } = useApp();
  const nav = useNav();
  const start = useStartAssessment();
  const a =
    data.draft?.id === route.params.id
      ? data.draft
      : data.cases.find((record) => record.id === route.params.id);
  if (!a)
    return (
      <Screen back="Back to history">
        <EmptyState
          title="Case not found"
          description="Open a saved case from history."
          action={<Button label="View History" onPress={() => nav.navigate('History')} />}
        />
      </Screen>
    );
  const legacy = a.workflow !== 'feasibility-v1';
  const resume = async () => {
    if (data.draft && data.draft.id !== a.id && !(await saveAssessment(false))) return;
    resumeAssessment(a);
    nav.navigate(resumableStep(a));
  };
  return (
    <Screen narrow back="Back to history">
      <PageTitle
        eyebrow={legacy ? 'PREVIOUS WORKFLOW' : a.completedAt ? 'SAVED CASE' : 'INCOMPLETE CASE'}
        title={a.patient.caseId}
        description={
          a.completedAt
            ? `Saved on ${formatDate(a.completedAt, true)}`
            : 'Patient details and photograph are stored locally.'
        }
      />
      <View style={common.stack}>
        {legacy && (
          <Note>
            This record was created before the feasibility-study workflow. It is retained for
            reference and excluded from study calculations.
          </Note>
        )}
        <AssessmentSummary assessment={a} />
        {!legacy && !a.completedAt && (
          <Button label="Resume Assessment" icon="play" onPress={resume} />
        )}
        {!legacy && a.completedAt && !a.microscopy && (
          <Button
            label="Record microscopy result"
            icon="plus"
            onPress={() => nav.navigate('Microscopy', { caseId: a.id })}
          />
        )}
        <ExportButton assessment={a} />
        <Button label="Start New Assessment" icon="plus" variant="secondary" onPress={start} />
        <Button label="View History" variant="ghost" onPress={() => nav.navigate('History')} />
      </View>
    </Screen>
  );
}
