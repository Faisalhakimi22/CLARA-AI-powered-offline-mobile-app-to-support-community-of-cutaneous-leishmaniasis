import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PageTitle, Screen } from '../components/Screen';
import {
  Badge,
  Button,
  Card,
  Choices,
  Field,
  Icon,
  KeyValue,
  Note,
  SectionLabel,
  T,
} from '../components/ui';
import { assessmentService } from '../services/assessmentService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { RootStackParamList } from '../domain/types';
import { colors, common, font } from '../theme';

export function SettingsScreen() {
  const { data, changeData, clearAll, notify } = useApp();
  const nav = useNav();
  const [name, setName] = useState(data.profile.name);
  const [role, setRole] = useState(data.profile.role);
  const [facility, setFacility] = useState(data.profile.facility);
  const [profileError, setProfileError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveProfile = async () => {
    if (!name.trim() || !role.trim()) {
      setProfileError('Enter a display name and role.');
      return;
    }
    setProfileError('');
    if (
      await changeData((prev) => ({
        ...prev,
        profile: { name: name.trim(), role: role.trim(), facility: facility.trim() },
      }))
    )
      notify('Profile saved on this device');
  };
  const clear = async () => {
    setBusy(true);
    if (await clearAll()) {
      setConfirm(false);
      nav.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    }
    setBusy(false);
  };
  const info: {
    title: RootStackParamList['Info']['topic'];
    icon: 'globe' | 'shield' | 'lock' | 'info' | 'feather';
    subtitle: string;
  }[] = [
    { title: 'Privacy', icon: 'shield', subtitle: 'How information is handled' },
    { title: 'Data security', icon: 'lock', subtitle: 'Protecting your device and records' },
    { title: 'About the app', icon: 'info', subtitle: 'CLARA · version 1.0.0' },
    {
      title: 'Assessment guide',
      icon: 'feather',
      subtitle: 'Patient details, photo, model result, and save',
    },
  ];
  return (
    <Screen narrow>
      <PageTitle
        title="Settings & preferences"
        description="Your profile, application information, and local records."
      />
      <View style={common.stack}>
        <Card>
          <SectionLabel
            label="Your profile"
            right={<Badge label="Local profile" tone="neutral" dot={false} />}
          />
          <Field
            label="Display name"
            value={name}
            onChangeText={setName}
            maxLength={60}
            error={profileError}
          />
          <Choices
            label="Professional role"
            options={['Consultant', 'Medical officer', 'Technician', 'Community health worker']}
            value={role}
            onChange={setRole}
          />
          <Field
            label="Role"
            value={role}
            onChangeText={setRole}
            maxLength={60}
            placeholder="Select above or enter your role"
          />
          <Field
            label="Facility"
            optional
            value={facility}
            onChangeText={setFacility}
            maxLength={100}
          />
          <Button label="Save Profile" icon="check" variant="secondary" onPress={saveProfile} />
        </Card>
        <Card>
          <SectionLabel label="Application" />
          <KeyValue label="Language" value="English" />
          <KeyValue
            label="Image analysis"
            value={assessmentService.available ? 'Research model enabled' : 'Not connected'}
          />
          <KeyValue label="Storage" value="On this device" />
          <Note>
            Records and image analysis stay on this device. Model results are saved for comparison
            with microscopy. The model is not clinically validated.
          </Note>
        </Card>
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {info.map((item, i) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => nav.navigate('Info', { topic: item.title })}
              style={{
                flexDirection: 'row',
                padding: 20,
                alignItems: 'center',
                gap: 14,
                borderBottomWidth: i < info.length - 1 ? 1 : 0,
                borderColor: colors.line,
              }}
            >
              <Icon name={item.icon} size={19} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontSize: 13, fontFamily: font.medium }}>{item.title}</T>
                <T style={{ fontSize: 11, color: colors.muted }}>{item.subtitle}</T>
              </View>
              <Icon name="chevron-right" size={17} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
        <Card style={{ borderColor: '#E8DCD5' }}>
          <SectionLabel label="Local data" />
          <T style={{ fontSize: 12, color: colors.muted, lineHeight: 20 }}>
            Remove cases, photos, drafts, consent, and preferences from this app on this device.
            This cannot be undone.
          </T>
          <Button
            label="Clear local data"
            icon="trash-2"
            variant="secondary"
            onPress={() => setConfirm(true)}
          />
        </Card>
      </View>
      <ConfirmDialog
        visible={confirm}
        title="Clear this workspace?"
        description="All local cases, saved photos, drafts, consent, and settings will be removed. You’ll return to the welcome screen with an empty history."
        confirmLabel="Delete all local data"
        busy={busy}
        onConfirm={clear}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}
