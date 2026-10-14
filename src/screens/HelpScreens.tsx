import React from 'react';
import { View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { PageTitle, Screen, useWide } from '../components/Screen';
import { Button, Card, Icon, Note, T } from '../components/ui';
import { PhotoGuideDoodle, PhotoGuideScene } from '../components/PhotoGuideDoodle';
import { RootStackParamList } from '../domain/types';
import { useNav } from '../navigation';
import { colors, common, font } from '../theme';

export function HelpScreen() {
  const nav = useNav();
  const wide = useWide();
  const tips = [
    {
      icon: 'sun' as const,
      scene: 'light' as PhotoGuideScene,
      title: 'Find soft, even light',
      text: 'Use a well-lit space. Avoid strong shadows, glare, and direct flash on the lesion.',
    },
    {
      icon: 'maximize' as const,
      scene: 'frame' as PhotoGuideScene,
      title: 'Show the whole lesion',
      text: 'Include the entire lesion and a little surrounding skin. Move close enough for detail while keeping the image in focus.',
    },
    {
      icon: 'target' as const,
      scene: 'steady' as PhotoGuideScene,
      title: 'Keep the camera steady',
      text: 'Support your hands, keep the lens facing the lesion, and pause briefly before taking the photo.',
    },
    {
      icon: 'aperture' as const,
      scene: 'focus' as PhotoGuideScene,
      title: 'Check the focus',
      text: 'Wait for the camera to focus. Check the preview for clear edges; retake the image if it looks blurry.',
    },
    {
      icon: 'image' as const,
      scene: 'background' as PhotoGuideScene,
      title: 'Keep the background simple',
      text: 'Remove unnecessary objects and avoid capturing identifying details. Centre the photographed lesion.',
    },
    {
      icon: 'check-circle' as const,
      scene: 'review' as PhotoGuideScene,
      title: 'Review before you continue',
      text: 'Confirm that the whole lesion is visible, the exposure is even, and the image is sharp.',
    },
  ];
  return (
    <Screen narrow back="Back">
      <PageTitle title="Lesion photo guide" description="Take a clear, focused photo." />
      <View style={common.stack}>
        <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 16 }}>
          {tips.map((tip, i) => (
            <Card key={tip.title} style={{ width: wide ? '48.7%' : '100%', gap: 14, padding: 16 }}>
              <PhotoGuideDoodle scene={tip.scene} />
              <View style={common.between}>
                <Icon name={tip.icon} size={23} />
                <T style={{ fontFamily: font.bold, color: '#ABB7A5', fontSize: 12 }}>0{i + 1}</T>
              </View>
              <T style={{ fontFamily: font.displayBold, fontSize: 18 }}>{tip.title}</T>
              <T style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>{tip.text}</T>
            </Card>
          ))}
        </View>
        <Note icon="shield" title="Patient consent">
          Only photograph a patient when you are authorised and appropriate consent has been
          obtained. Use a case ID and avoid including unnecessary identifying details.
        </Note>
        <Button
          label="Back"
          icon="arrow-left"
          variant="secondary"
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Home'))}
        />
      </View>
    </Screen>
  );
}

const content: Record<
  RootStackParamList['Info']['topic'],
  { intro: string; paragraphs: { title: string; body: string }[] }
> = {
  Privacy: {
    intro: 'Study records stay on this device.',
    paragraphs: [
      {
        title: 'Local collection',
        body: 'Patient details, photographs, model results, and recorded microscopy results are stored on this device. The app has no account server, background uploads, or analytics.',
      },
      {
        title: 'Collect only what you need',
        body: 'Use a de-identified case ID. Avoid patient names, addresses, and unnecessary identifying details. Obtain appropriate consent and follow your organisation’s information policies.',
      },
      {
        title: 'Export with care',
        body: 'Exports contain case IDs and study information. Share them only with authorised study staff and save them in an approved location. Exported records do not include photographs.',
      },
      {
        title: 'Retention and removal',
        body: 'Records stay here until local data is cleared or the app is removed. Clearing browser storage also removes web records. Exported copies must be managed separately.',
      },
    ],
  },
  'Data security': {
    intro: 'Protect your device and the information you collect.',
    paragraphs: [
      {
        title: 'Storage on this device',
        body: 'The app does not add encryption or a sign-in layer. Records use application storage; mobile photos are stored in the app’s document directory. Browser photos are stored with the case. Anyone with access to the unlocked workspace can view its contents.',
      },
      {
        title: 'Use approved devices and practices',
        body: 'Use de-identified records and a device protected by a screen lock. Follow your organisation’s policies for device access, data retention, consent, and clinical use.',
      },
      {
        title: 'Keep essential records recoverable',
        body: 'There is no cloud backup or account recovery. Export necessary summaries to an approved location. Uninstalling the app, clearing local data, or losing the device can remove access to these records.',
      },
    ],
  },
  'About the app': {
    intro: 'CLARA · Version 1.0.0',
    paragraphs: [
      {
        title: 'Offline feasibility study',
        body: 'CLARA helps consultants, medical officers, technicians, and community health workers record basic patient details, take a lesion photo, and save an offline model result for suspected cutaneous leishmaniasis.',
      },
      {
        title: 'Image model results',
        body: 'The model outlines the lesion and assesses the image on this device. Results are suggestive of CL, non-suggestive of CL, or inconclusive. The model is not clinically validated, and its score is not a probability of disease.',
      },
      {
        title: 'Comparison with microscopy',
        body: 'Microscopy is performed through the usual laboratory process. The study uses the same case ID to compare the laboratory result with the saved model result. The original model result is kept unchanged.',
      },
      {
        title: 'Clinical confirmation remains essential',
        body: 'This app does not diagnose, confirm, or rule out CL. Final diagnosis requires appropriate clinical assessment and laboratory confirmation.',
      },
    ],
  },
  'Assessment guide': {
    intro: 'Patient details, lesion photo, model result, and save.',
    paragraphs: [
      {
        title: '1. Enter patient details',
        body: 'Use the study case ID and record basic patient details. Obtain appropriate consent before collecting information or taking a photo. Use the same case ID for microscopy.',
      },
      {
        title: '2. Take a lesion photo',
        body: 'Take or choose a photo, then review focus, lighting, and framing. Retake an unsuitable image or explicitly record its quality limitations.',
      },
      {
        title: '3. View the model result',
        body: 'Run image analysis on this device. The model shows whether the image is suggestive of CL, non-suggestive of CL, or inconclusive. If analysis cannot run, the case records that no result was available.',
      },
      {
        title: '4. Save the case',
        body: 'Save the patient details, photograph, and model result to assessment history. An unfinished assessment can be saved and resumed later.',
      },
      {
        title: 'Study comparison later',
        body: 'Laboratory testing takes place outside the app. When a microscopy report is available, authorised study staff can record it against the same case ID and compare results in Study. A missing or inconclusive result must not be entered as negative.',
      },
    ],
  },
};

export function InfoScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Info'>>();
  const nav = useNav();
  const info = content[route.params.topic];
  return (
    <Screen narrow back="Back">
      <PageTitle eyebrow="CLARA" title={route.params.topic} description={info.intro} />
      <View style={common.stack}>
        {info.paragraphs.map((p) => (
          <Card key={p.title}>
            <T style={{ fontFamily: font.displayBold, fontSize: 20, lineHeight: 28 }}>{p.title}</T>
            <T style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>{p.body}</T>
          </Card>
        ))}
        <Button label="Back" variant="secondary" onPress={() => nav.goBack()} />
      </View>
    </Screen>
  );
}
