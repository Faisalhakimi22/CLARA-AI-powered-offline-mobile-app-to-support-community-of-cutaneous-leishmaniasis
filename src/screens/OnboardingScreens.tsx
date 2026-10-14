import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../components/Illustrations';
import { Button, Card, Icon, Note, T } from '../components/ui';
import { useWide } from '../components/Screen';
import { useNav } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, common, font } from '../theme';

export function SplashScreen() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <View style={{ alignItems: 'center', gap: 24 }}>
        <Brand />
        <T style={{ textAlign: 'center', maxWidth: 290, color: colors.muted }}>
          Offline cutaneous leishmaniasis feasibility study
        </T>
        <ActivityIndicator color={colors.teal} style={{ marginTop: 26 }} />
      </View>
    </SafeAreaView>
  );
}

export function WelcomeScreen() {
  const nav = useNav();
  const wide = useWide();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: wide ? 48 : 24,
          maxWidth: 1200,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View style={common.between}>
          <Brand />
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: wide ? 'row' : 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: wide ? 80 : 24,
            paddingVertical: 38,
          }}
        >
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 18 }}>
            <T
              accessibilityRole="header"
              style={{
                fontFamily: font.displayBold,
                fontSize: wide ? 49 : 37,
                lineHeight: wide ? 61 : 47,
                letterSpacing: -1.8,
              }}
            >
              CLARA
            </T>
            <T style={{ color: colors.muted, fontSize: 16, lineHeight: 26 }}>
              Offline cutaneous leishmaniasis feasibility study
            </T>
          </View>
          <Card
            style={{
              flex: wide ? 1 : undefined,
              width: wide ? undefined : '100%',
              maxWidth: 460,
              padding: wide ? 32 : 22,
              gap: 18,
            }}
          >
            <View style={{ gap: 8 }}>
              <T style={{ fontFamily: font.displayBold, fontSize: 22, letterSpacing: -0.6 }}>
                Record a study case
              </T>
            </View>
            {[
              ['user', 'Patient details', 'Enter the study case ID and basic details.'],
              ['camera', 'Lesion photo', 'Take a clear photo for offline image analysis.'],
              [
                'save',
                'Save the model result',
                'Use the same case ID for comparison with microscopy.',
              ],
            ].map(([icon, title, body], i) => (
              <View key={title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: colors.tealLight,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={icon as 'camera'} size={17} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={{ fontFamily: font.semibold, fontSize: 13 }}>{title}</T>
                  <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>{body}</T>
                </View>
              </View>
            ))}
            <Button label="Continue" icon="arrow-right" onPress={() => nav.navigate('Consent')} />
            <T style={{ fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 18 }}>
              Research use. A model result is not a diagnosis.
            </T>
          </Card>
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
        >
          <Icon name="shield" size={13} color={colors.muted} />
          <T style={{ fontSize: 11, color: colors.muted }}>Records are stored on this device.</T>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ConsentScreen() {
  const nav = useNav();
  const { changeData, storageError } = useApp();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    const ok = await changeData((prev) => ({ ...prev, consentAt: new Date().toISOString() }));
    setBusy(false);
    if (ok) nav.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          justifyContent: 'center',
          width: '100%',
          maxWidth: 610,
          alignSelf: 'center',
          gap: 25,
        }}
      >
        <Brand />
        <Card style={{ gap: 24, padding: 26 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: colors.tealLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="shield" size={26} />
          </View>
          <View style={{ gap: 10 }}>
            <T accessibilityRole="header" style={common.title}>
              Consent and use
            </T>
          </View>
          {[
            [
              'Feasibility study',
              'Record patient details, a lesion photo, and the model result. The study compares model results with microscopy using the same case ID.',
            ],
            [
              'Research result only',
              'The model is not clinically validated. Its result does not confirm or rule out CL. Patient care and laboratory testing follow your usual clinical process.',
            ],
            [
              'Handle information responsibly',
              'Collect only information you are authorised to collect. Obtain appropriate patient consent before photographing a lesion.',
            ],
            [
              'Local records',
              'Cases and images stay on this device. Records are not encrypted by the app. Use de-identified case IDs, a protected device, and your organisation’s approved data-handling practices.',
            ],
          ].map(([title, body]) => (
            <View key={title} style={{ gap: 6 }}>
              <T style={{ fontFamily: font.semibold, fontSize: 14 }}>{title}</T>
              <T style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{body}</T>
            </View>
          ))}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I understand the limitations and am authorised to collect this information"
            accessibilityState={{ checked: accepted }}
            aria-checked={accepted}
            onPress={() => setAccepted(!accepted)}
            style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'center' }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: accepted ? colors.teal : '#B5C0B6',
                backgroundColor: accepted ? colors.teal : colors.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {accepted && <Icon name="check" color="white" size={16} />}
            </View>
            <T style={{ flex: 1, fontSize: 12, lineHeight: 19 }}>
              I understand the limitations and am authorised to collect this information.
            </T>
          </Pressable>
          {storageError && <Note tone="amber">{storageError}</Note>}
          <Button
            label="I Understand & Continue"
            icon="arrow-right"
            disabled={!accepted}
            loading={busy}
            onPress={accept}
          />
          <Button label="Back" variant="ghost" onPress={() => nav.goBack()} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
