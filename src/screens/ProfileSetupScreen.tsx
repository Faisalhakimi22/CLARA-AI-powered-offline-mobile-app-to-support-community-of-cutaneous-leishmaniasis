import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../components/Illustrations';
import { Button, Card, Choices, Field, Icon, Note, T } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { colors, common } from '../theme';

export function ProfileSetupScreen() {
  const { data, changeData, storageError } = useApp();
  const nav = useNav();
  const [name, setName] = useState(data.profile.name);
  const [role, setRole] = useState(data.profile.role);
  const [facility, setFacility] = useState(data.profile.facility);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || !role.trim()) {
      setError('Enter your name and professional role.');
      return;
    }
    setError('');
    setBusy(true);
    const ok = await changeData((prev) => ({
      ...prev,
      profile: { name: name.trim(), role: role.trim(), facility: facility.trim() },
    }));
    setBusy(false);
    if (ok) nav.reset({ index: 0, routes: [{ name: 'Home' }] });
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
          gap: 26,
          width: '100%',
          maxWidth: 590,
          alignSelf: 'center',
        }}
      >
        <Brand />
        <Card style={{ padding: 28, gap: 24 }}>
          <Icon name="user" size={29} />
          <View style={{ gap: 9 }}>
            <T accessibilityRole="header" style={common.title}>
              Profile details
            </T>
            <T tone="muted">Your details identify who recorded each study case.</T>
          </View>
          <Field
            label="Your name"
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="Name used in study records"
          />
          <Choices
            label="Professional role"
            options={['Consultant', 'Medical officer', 'Technician', 'Community health worker']}
            value={role}
            onChange={setRole}
          />
          <Field
            label="Professional role"
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
            placeholder="Clinic or health centre"
          />
          {!!error && <Note tone="amber">{error}</Note>}
          {!!storageError && <Note tone="amber">{storageError}</Note>}
          <Button label="Continue" icon="arrow-right" onPress={save} loading={busy} />
          <T tone="muted" style={{ fontSize: 11 }}>
            Saved on this device. You can edit these details in Settings.
          </T>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
