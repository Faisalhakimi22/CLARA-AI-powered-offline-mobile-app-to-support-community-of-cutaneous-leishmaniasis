import React from 'react';
import { Modal, View } from 'react-native';
import { Button, Card, Icon, T } from './ui';
import { colors, font } from '../theme';

export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: '#172D2AC0',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Card style={{ width: '100%', maxWidth: 430, gap: 22 }}>
          <Icon name="trash-2" size={27} color={colors.red} />
          <T
            accessibilityRole="header"
            style={{ fontSize: 24, fontFamily: font.displayBold, lineHeight: 32 }}
          >
            {title}
          </T>
          <T style={{ color: colors.muted, fontSize: 14, lineHeight: 23 }}>{description}</T>
          <Button label={confirmLabel} variant="danger" loading={busy} onPress={onConfirm} />
          <Button label="Keep my data" variant="secondary" disabled={busy} onPress={onCancel} />
        </Card>
      </View>
    </Modal>
  );
}
