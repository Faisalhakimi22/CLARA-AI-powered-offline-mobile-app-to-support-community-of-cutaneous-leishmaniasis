import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#202124',
  muted: '#667085',
  teal: '#B42332',
  tealDark: '#8F1D29',
  tealLight: '#FCEDEE',
  line: '#E5E7EB',
  amber: '#A61B2B',
  amberLight: '#FCEDEE',
  red: '#B42332',
  redLight: '#FCEDEE',
  blue: '#8F1D29',
  blueLight: '#FCEDEE',
  white: '#FFFFFF',
};
export const font = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  display: 'Manrope_600SemiBold',
  displayBold: 'Manrope_700Bold',
};
export const common = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 20 },
  flex: { flex: 1 },
  label: { fontFamily: font.semibold, color: colors.ink, fontSize: 14 },
  body: { fontFamily: font.regular, color: colors.muted, fontSize: 15, lineHeight: 23 },
  title: {
    fontFamily: font.displayBold,
    color: colors.ink,
    fontSize: 28,
    letterSpacing: -0.9,
    lineHeight: 37,
  },
  eyebrow: {
    fontFamily: font.bold,
    color: colors.teal,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  divider: { height: 1, backgroundColor: colors.line },
});
