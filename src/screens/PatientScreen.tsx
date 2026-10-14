import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PageTitle, Screen, useWide } from '../components/Screen';
import {
  Button,
  Card,
  Choices,
  EmptyState,
  Field,
  Icon,
  Note,
  SectionLabel,
  Stepper,
  T,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { clinicalQuestions, validatePatient } from '../domain/clinical';
import { colors, common, font } from '../theme';
import { CheckField } from '../components/CheckField';

export function PatientScreen() {
  const { data, updateDraft } = useApp();
  const nav = useNav();
  const wide = useWide();
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<{ caseId?: string; age?: string }>({});
  const [consentError, setConsentError] = useState(false);
  const draft = data.draft;
  if (!draft)
    return (
      <Screen>
        <EmptyState
          title="Start a new assessment"
          description="Create a case from your workspace to begin."
          action={<Button label="Return home" onPress={() => nav.navigate('Home')} />}
        />
      </Screen>
    );
  const next = () => {
    const found = validatePatient(draft.patient);
    if (
      data.cases.some(
        (a) =>
          a.id !== draft.id &&
          a.patient.caseId.trim().toLowerCase() === draft.patient.caseId.trim().toLowerCase(),
      )
    )
      found.caseId = 'This case ID is already in your history. Please use a unique ID.';
    setErrors(found);
    setConsentError(!draft.collectionConsentAt);
    if (!Object.keys(found).length && draft.collectionConsentAt) {
      updateDraft({
        patient: { ...draft.patient, caseId: draft.patient.caseId.trim() },
        step: 'Capture',
      });
      nav.navigate('Capture');
    }
  };
  return (
    <Screen narrow assessment>
      <Stepper step={1} />
      <PageTitle
        eyebrow="NEW ASSESSMENT"
        title="Patient details"
        description="Use the same case ID for the photograph and microscopy record."
      />
      <View style={common.stack}>
        <Card>
          <SectionLabel label="Case details" />
          <Field
            label="Patient ID / Case ID"
            value={draft.patient.caseId}
            onChangeText={(caseId) => updateDraft({ patient: { ...draft.patient, caseId } })}
            placeholder="e.g. CL-2026-0049"
            autoCapitalize="characters"
            maxLength={40}
            error={errors.caseId}
          />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
            <Field
              label="Age in years"
              optional
              value={draft.patient.age}
              onChangeText={(age) => updateDraft({ patient: { ...draft.patient, age } })}
              placeholder="e.g. 35"
              keyboardType="number-pad"
              maxLength={3}
              error={errors.age}
            />
            <View style={{ flex: 2, gap: 8 }}>
              <View style={common.between}>
                <T style={common.label}>Sex</T>
                <T style={{ color: colors.muted, fontSize: 11 }}>Optional</T>
              </View>
              <Choices
                label="Sex"
                options={['Female', 'Male', 'Other', 'Not recorded']}
                value={draft.patient.sex}
                onChange={(sex) => updateDraft({ patient: { ...draft.patient, sex } })}
              />
            </View>
          </View>
        </Card>
        <Card style={{ gap: 6 }}>
          <CheckField
            label="Permission to record this case is confirmed"
            description="I am authorised to collect this information and have obtained appropriate patient consent for the photograph."
            checked={!!draft.collectionConsentAt}
            onChange={(checked) => {
              updateDraft({ collectionConsentAt: checked ? new Date().toISOString() : undefined });
              setConsentError(false);
            }}
          />
          {consentError && (
            <Note tone="amber">Confirm permission before taking or uploading a photograph.</Note>
          )}
        </Card>
        <Card style={{ padding: 20 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add clinical details now"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={common.between}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ padding: 10, backgroundColor: colors.tealLight, borderRadius: 10 }}>
                <Icon name="clipboard" size={18} />
              </View>
              <View>
                <T style={{ fontFamily: font.semibold, fontSize: 14 }}>Add clinical details now</T>
                <T style={{ color: colors.muted, fontSize: 11 }}>
                  Optional study information
                </T>
              </View>
            </View>
            <Icon name={expanded ? 'minus' : 'plus'} size={18} />
          </Pressable>
          {expanded && (
            <View style={{ gap: 25, paddingTop: 10 }}>
              {clinicalQuestions.map((q) => (
                <View key={q.key} style={{ gap: 10 }}>
                  <T style={common.label}>
                    {q.short} <T style={{ fontSize: 11, color: colors.muted }}>· Optional</T>
                  </T>
                  <Choices
                    label={q.short}
                    options={q.options}
                    value={draft.clinical[q.key]}
                    onChange={(value) =>
                      updateDraft({
                        clinical: { ...draft.clinical, [q.key]: value },
                        updated: undefined,
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
        </Card>
        <Button label="Continue to Photo" icon="arrow-right" onPress={next} />
      </View>
    </Screen>
  );
}
