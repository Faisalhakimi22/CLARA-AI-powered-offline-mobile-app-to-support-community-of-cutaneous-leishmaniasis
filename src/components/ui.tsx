import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, common, font } from '../theme';
import { Prediction } from '../domain/types';
import { predictionLabel } from '../domain/clinical';

export type IconName = React.ComponentProps<typeof Feather>['name'];
export function Icon({
  name,
  size = 20,
  color = colors.teal,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} accessible={false} aria-hidden={true} />;
}
export function T({
  children,
  style,
  tone,
  ...props
}: TextProps & { tone?: 'muted' | 'teal' | 'white' }) {
  return (
    <Text
      {...props}
      style={[styles.text, tone && { color: colors[tone === 'muted' ? 'muted' : tone] }, style]}
    >
      {children}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'white' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ink = variant === 'primary' || variant === 'danger' ? colors.white : colors.tealDark;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.87 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        icon && <Icon name={icon} size={18} color={ink} />
      )}
      <T style={{ fontFamily: font.semibold, color: ink, fontSize: 14, flexShrink: 1 }}>{label}</T>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.tealLight }]}
    >
      <Icon name={name} color={colors.ink} />
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Badge({
  label,
  tone = 'teal',
  dot = true,
}: {
  label: string;
  tone?: 'teal' | 'amber' | 'blue' | 'neutral' | 'red';
  dot?: boolean;
}) {
  const textColor = tone === 'neutral' ? colors.muted : colors[tone];
  const bg = tone === 'neutral' ? colors.bg : colors[`${tone}Light` as 'tealLight'];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot && <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: textColor }} />}
      <T style={{ color: textColor, fontFamily: font.semibold, fontSize: 11, lineHeight: 15 }}>
        {label}
      </T>
    </View>
  );
}
export function ResultBadge({ prediction }: { prediction?: Prediction }) {
  return (
    <Badge
      label={predictionLabel(prediction)}
      tone={
        prediction === 'CL'
          ? 'amber'
          : prediction === 'NON_CL'
            ? 'teal'
            : prediction
              ? 'blue'
              : 'neutral'
      }
    />
  );
}
export function Note({
  title,
  children,
  tone = 'neutral',
  icon = 'info',
}: {
  title?: string;
  children: React.ReactNode;
  tone?: 'neutral' | 'amber' | 'teal';
  icon?: IconName;
}) {
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: tone === 'neutral' ? '#F2F4F7' : colors[`${tone}Light`] },
      ]}
    >
      <Icon name={icon} size={18} color={tone === 'neutral' ? colors.muted : colors[tone]} />
      <View style={{ flex: 1, gap: 4 }}>
        {title && <T style={{ fontSize: 13, fontFamily: font.semibold }}>{title}</T>}
        <T style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>{children}</T>
      </View>
    </View>
  );
}
export function Field({
  label,
  optional,
  error,
  ...props
}: TextInputProps & { label: string; optional?: boolean; error?: string }) {
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <View style={common.between}>
        <T style={common.label}>{label}</T>
        {optional && <T style={{ fontSize: 11, color: colors.muted }}>Optional</T>}
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#9DA8A2"
        style={[
          styles.input,
          props.multiline && { height: 110, textAlignVertical: 'top', paddingTop: 14 },
          error && { borderColor: colors.red },
          props.style,
        ]}
      />
      {!!error && (
        <T accessibilityRole="alert" style={{ color: colors.red, fontSize: 12 }}>
          {error}
        </T>
      )}
    </View>
  );
}
export function Choices({
  label,
  options,
  value,
  onChange,
  large = false,
}: {
  label?: string;
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  large?: boolean;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: large ? 'column' : 'row',
        flexWrap: large ? 'nowrap' : 'wrap',
        gap: 9,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityLabel={option}
          accessibilityState={{ checked: value === option }}
          aria-checked={value === option}
          onPress={() => onChange(option)}
          style={({ pressed }) => [
            styles.choice,
            large && { width: '100%', paddingVertical: 18, justifyContent: 'space-between' },
            value === option && { backgroundColor: colors.tealLight, borderColor: colors.teal },
            pressed && { opacity: 0.75 },
          ]}
        >
          <T
            style={{
              fontSize: 14,
              color: value === option ? colors.tealDark : colors.muted,
              fontFamily: value === option ? font.semibold : font.regular,
            }}
          >
            {option}
          </T>
          {large && (
            <View
              style={[
                styles.radio,
                value === option && { borderColor: colors.teal, borderWidth: 5 },
              ]}
            />
          )}
        </Pressable>
      ))}
    </View>
  );
}
export function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const currentStep = Math.min(step, 3);
  return (
    <View accessibilityLabel={`Step ${currentStep} of 3`} style={styles.stepper}>
      {['Patient', 'Photo', 'Result'].map((label, index) => (
        <React.Fragment key={label}>
          {index > 0 && (
            <View
              style={[styles.stepLine, index < currentStep && { backgroundColor: colors.teal }]}
            />
          )}
          <View style={{ alignItems: 'center', gap: 7 }}>
            <View
              style={[
                styles.stepCircle,
                index + 1 <= currentStep && {
                  backgroundColor: index + 1 === currentStep ? colors.teal : colors.tealLight,
                  borderColor: 'transparent',
                },
              ]}
            >
              {index + 1 < currentStep ? (
                <Icon name="check" size={13} />
              ) : (
                <T
                  style={{
                    fontSize: 11,
                    fontFamily: font.bold,
                    color: index + 1 === currentStep ? colors.white : colors.muted,
                  }}
                >
                  {index + 1}
                </T>
              )}
            </View>
            <T
              style={{
                fontSize: 10,
                color: index + 1 === currentStep ? colors.teal : colors.muted,
                fontFamily: font.medium,
              }}
            >
              {label}
            </T>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
export function Score({ value }: { value: number }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={common.between}>
        <T style={{ fontSize: 12, color: colors.muted, flex: 1, marginRight: 12 }}>
          Model score (uncalibrated)
        </T>
        <T style={{ fontFamily: font.bold, color: colors.teal }}>{Math.round(value * 100)}%</T>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        style={{ height: 5, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${value * 100}%`,
            height: 5,
            backgroundColor: colors.teal,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}
export function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <View style={common.between}>
      <T style={{ fontFamily: font.displayBold, fontSize: 18, letterSpacing: -0.4 }}>{label}</T>
      {right}
    </View>
  );
}
export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 5, flex: 1, minWidth: 120 }}>
      <T style={{ color: colors.muted, fontSize: 12 }}>{label}</T>
      <T style={{ fontSize: 14, fontFamily: font.medium }}>{value}</T>
    </View>
  );
}
export function EmptyState({
  icon = 'folder',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 44, gap: 16 }}>
      <View style={{ padding: 18, borderRadius: 20, backgroundColor: colors.tealLight }}>
        <Icon name={icon} size={28} />
      </View>
      <T style={{ fontFamily: font.displayBold, fontSize: 21 }}>{title}</T>
      <T style={{ color: colors.muted, textAlign: 'center', maxWidth: 340 }}>{description}</T>
      {action}
    </Card>
  );
}
const styles = StyleSheet.create({
  text: { fontFamily: font.regular, color: colors.ink, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.teal },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent' },
  white: { backgroundColor: colors.white },
  danger: { backgroundColor: colors.red },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    gap: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
  },
  note: { flexDirection: 'row', gap: 11, padding: 16, borderRadius: 12, alignItems: 'flex-start' },
  input: {
    minHeight: 52,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    fontFamily: font.regular,
  },
  choice: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#C3CFC6', borderRadius: 12 },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, marginBottom: 8 },
  stepCircle: {
    height: 26,
    width: 26,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    height: 1,
    backgroundColor: colors.line,
    flex: 1,
    marginHorizontal: 5,
    marginTop: 13,
  },
});
