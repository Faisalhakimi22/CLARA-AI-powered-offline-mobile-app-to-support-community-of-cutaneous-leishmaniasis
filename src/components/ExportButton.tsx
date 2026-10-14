import React, { useState } from 'react';
import { View } from 'react-native';
import { Assessment } from '../domain/types';
import { exportAssessment } from '../services/exportAssessment';
import { Button, Note } from './ui';

export function ExportButton({ assessment }: { assessment: Assessment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onPress = async () => {
    setBusy(true);
    setError('');
    try {
      await exportAssessment(assessment);
    } catch {
      setError('The summary could not be exported. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Button
        label="Export Summary"
        icon="share"
        variant="secondary"
        loading={busy}
        onPress={onPress}
      />
      {!!error && <Note tone="amber">{error}</Note>}
    </View>
  );
}
