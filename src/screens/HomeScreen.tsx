import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen, PageTitle, useWide } from '../components/Screen';
import { Badge, Button, Card, Icon, ResultBadge, SectionLabel, T } from '../components/ui';
import { useNav } from '../navigation';
import { useApp } from '../state/AppContext';
import { finalPrediction, formatDate, resumableStep } from '../domain/clinical';
import { isSavedStudyAssessment, statusLabel } from '../domain/study';
import { colors, common, font } from '../theme';

export function useStartAssessment() {
  const { data, saveAssessment, startAssessment } = useApp();
  const nav = useNav();
  return async () => {
    if (data.draft && !(await saveAssessment(false))) return;
    startAssessment();
    nav.navigate('Patient');
  };
}

export function HomeScreen() {
  const { data, resumeAssessment } = useApp();
  const nav = useNav();
  const wide = useWide();
  const start = useStartAssessment();
  const assessments = [
    ...(data.draft ? [data.draft] : []),
    ...data.cases.filter((a) => a.id !== data.draft?.id),
  ]
    .filter((a) => a.workflow !== 'legacy-triage')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const saved = assessments.filter(isSavedStudyAssessment).length;
  const pending = assessments.length - saved;
  return (
    <Screen>
      <PageTitle
        title="Study overview"
        description={`${data.profile.name} · ${data.profile.role}`}
        action={
          wide ? (
            <T style={{ fontSize: 12, color: colors.muted }}>
              {new Date().toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </T>
          ) : undefined
        }
      />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card
          style={{ flex: wide ? 1.4 : undefined, padding: 24, gap: 14, justifyContent: 'center' }}
        >
          <T
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: font.displayBold, fontSize: 24, lineHeight: 32 }}
          >
            New assessment
          </T>
          <T style={{ fontSize: 14, lineHeight: 22, color: colors.muted, maxWidth: 440 }}>
            Add patient details, take a lesion photo, and save the model result.
          </T>
          <Button
            label="New assessment"
            icon="plus"
            onPress={start}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          />
        </Card>
        <Card style={{ flex: 1, padding: 20, gap: 14 }}>
          <View style={common.between}>
            <T style={{ fontFamily: font.semibold, fontSize: 16 }}>Incomplete cases</T>
            <Badge label={String(pending)} tone="red" dot={false} />
          </View>
          <T style={{ fontSize: 13, color: colors.muted, lineHeight: 21 }}>
            {pending ? 'Continue an assessment you saved earlier.' : 'No incomplete assessments.'}
          </T>
          <Button
            label="View incomplete cases"
            icon="arrow-right"
            variant="secondary"
            onPress={() => nav.navigate('History', { filter: 'Pending Review' })}
          />
        </Card>
      </View>
      {data.draft && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resume current assessment"
          onPress={() => {
            resumeAssessment(data.draft!);
            nav.navigate(resumableStep(data.draft!));
          }}
          style={{
            padding: 16,
            marginTop: 14,
            backgroundColor: colors.tealLight,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Icon name="play-circle" color={colors.teal} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 13, fontFamily: font.semibold }}>
              Continue {data.draft.patient.caseId}
            </T>
            <T tone="muted" style={{ fontSize: 12 }}>
              Assessment saved on this device.
            </T>
          </View>
          <Icon name="arrow-right" size={18} color={colors.teal} />
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 20 }}>
        {[
          { label: 'Total cases', value: assessments.length, icon: 'clipboard' as const },
          { label: 'Incomplete', value: pending, icon: 'clock' as const },
          { label: 'Saved', value: saved, icon: 'check-circle' as const },
        ].map((item, i) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={{ flex: 1 }}
            onPress={() =>
              nav.navigate(
                'History',
                i === 1
                  ? { filter: 'Pending Review' }
                  : i === 2
                    ? { filter: 'Completed' }
                    : undefined,
              )
            }
          >
            <Card style={{ minWidth: 0, padding: wide ? 18 : 10, gap: 8 }}>
              <View style={[common.between, { minWidth: 0 }]}>
                <T
                  numberOfLines={1}
                  style={{ flexShrink: 1, fontSize: wide ? 11 : 10, color: colors.muted }}
                >
                  {item.label}
                </T>
                {wide && <Icon name={item.icon} size={16} color={colors.teal} />}
              </View>
              <T
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  flexShrink: 1,
                  fontFamily: font.displayBold,
                  fontSize: wide ? 28 : 24,
                  lineHeight: wide ? 34 : 30,
                }}
              >
                {item.value}
              </T>
            </Card>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18 }}>
        <View style={{ flex: 1.5, gap: 12 }}>
          <SectionLabel
            label="Recent assessments"
            right={
              <Pressable
                accessibilityRole="button"
                onPress={() => nav.navigate('History')}
                style={{ minHeight: 40, justifyContent: 'center' }}
              >
                <T style={{ fontSize: 12, color: colors.teal, fontFamily: font.semibold }}>
                  View history
                </T>
              </Pressable>
            }
          />
          <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {assessments.slice(0, 4).map((a, i) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${a.patient.caseId}`}
                onPress={() => nav.navigate('Detail', { id: a.id })}
                style={{
                  padding: 16,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  borderTopWidth: i ? 1 : 0,
                  borderColor: colors.line,
                  backgroundColor: colors.white,
                }}
              >
                <Icon name="file-text" size={18} color={colors.teal} />
                <View style={{ flex: 1, gap: 5 }}>
                  <T numberOfLines={1} style={{ fontSize: 13, fontFamily: font.semibold }}>
                    {a.patient.caseId}
                  </T>
                  <T style={{ fontSize: 11, color: colors.muted }}>{formatDate(a.createdAt)}</T>
                  {!wide && <ResultBadge prediction={finalPrediction(a)} />}
                </View>
                {wide && <ResultBadge prediction={finalPrediction(a)} />}
                {wide && <T style={{ fontSize: 11, color: colors.muted }}>{statusLabel(a)}</T>}
                <Icon name="chevron-right" size={15} color={colors.muted} />
              </Pressable>
            ))}
            {!assessments.length && (
              <T style={{ padding: 20, color: colors.muted }}>No assessments recorded.</T>
            )}
          </Card>
          <T style={{ fontSize: 11, color: colors.muted }}>
            Case records are stored on this device.
          </T>
        </View>
        <View style={{ flex: 1, gap: 12 }}>
          <SectionLabel label="Guidance" />
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="bar-chart-2" color={colors.teal} />
              <T style={{ fontFamily: font.semibold, fontSize: 15 }}>Study results</T>
            </View>
            <T style={{ fontSize: 13, color: colors.muted }}>
              Compare saved model results with microscopy by case ID.
            </T>
            <Button
              label="Study results"
              variant="secondary"
              onPress={() => nav.navigate('Study')}
            />
          </Card>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="camera" color={colors.teal} />
              <T style={{ fontFamily: font.semibold, fontSize: 15 }}>Lesion photography</T>
            </View>
            <T style={{ fontSize: 13, color: colors.muted }}>
              Use even light and keep the lesion in focus.
            </T>
            <Button label="Photo guide" variant="secondary" onPress={() => nav.navigate('Help')} />
          </Card>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="shield" color={colors.teal} />
              <T style={{ fontFamily: font.semibold, fontSize: 15 }}>Prevention</T>
            </View>
            <T style={{ fontSize: 13, color: colors.muted }}>
              Practical steps to reduce sand fly bites.
            </T>
            <Button
              label="Prevention guidance"
              variant="secondary"
              onPress={() => nav.navigate('Prevention')}
            />
          </Card>
        </View>
      </View>
    </Screen>
  );
}
