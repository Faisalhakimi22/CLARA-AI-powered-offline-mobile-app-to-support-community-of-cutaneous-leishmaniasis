import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, T } from './ui';
import { colors, font } from '../theme';

export function CheckField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 12,
        minHeight: 52,
      }}
    >
      <View
        style={{
          width: 25,
          height: 25,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: checked ? colors.teal : '#B5C0B6',
          backgroundColor: checked ? colors.teal : colors.white,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <Icon name="check" size={17} color="white" />}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <T style={{ fontFamily: font.medium, fontSize: 14 }}>{label}</T>
        {!!description && (
          <T tone="muted" style={{ fontSize: 12, lineHeight: 19 }}>
            {description}
          </T>
        )}
      </View>
    </Pressable>
  );
}
