import React, { useCallback, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { colors, common, font } from '../theme';
import { Badge, Button, Icon, IconButton, IconName, T } from './ui';
import { Brand } from './Illustrations';

export const useWide = () => useWindowDimensions().width >= 1000;
const navItems: {
  route: 'Home' | 'History' | 'Study' | 'Prevention' | 'Help' | 'Settings';
  label: string;
  short: string;
  icon: IconName;
}[] = [
  { route: 'Home', label: 'Overview', short: 'Home', icon: 'grid' },
  { route: 'History', label: 'Assessment history', short: 'History', icon: 'folder' },
  { route: 'Study', label: 'Study results', short: 'Study', icon: 'bar-chart-2' },
  { route: 'Prevention', label: 'Prevention', short: 'Prevent', icon: 'shield' },
  { route: 'Help', label: 'Image-taking guide', short: 'Guide', icon: 'book-open' },
  { route: 'Settings', label: 'Settings', short: 'Settings', icon: 'sliders' },
];

export function Screen({
  children,
  narrow = false,
  back,
  assessment = false,
  resetScrollKey,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  back?: string;
  assessment?: boolean;
  resetScrollKey?: number;
}) {
  const wide = useWide();
  const nav = useNav();
  const route = useRoute();
  const scroll = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() =>
        scroll.current?.scrollTo({ y: 0, animated: false }),
      );
      return () => cancelAnimationFrame(frame);
    }, [resetScrollKey]),
  );
  const insets = useSafeAreaInsets();
  const { data, toast, storageError, retrySave, saveAssessment, notify } = useApp();
  const pending = data.cases.filter(
    (a) => a.workflow !== 'legacy-triage' && a.status === 'Pending Review',
  ).length;
  const current = navItems.some((n) => n.route === route.name)
    ? route.name
    : assessment
      ? ''
      : route.name === 'Detail'
        ? 'History'
        : '';
  const goHome = () => nav.reset({ index: 0, routes: [{ name: 'Home' }] });
  const goBack = () => (nav.canGoBack() ? nav.goBack() : goHome());
  const saveExit = async () => {
    if (await saveAssessment(false)) {
      notify('Incomplete assessment saved');
      goHome();
    }
  };
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
      {wide && (
        <View style={s.sidebar}>
          <View style={{ paddingHorizontal: 24, paddingTop: 30, paddingBottom: 38 }}>
            <Brand />
          </View>
          <T
            style={[
              common.eyebrow,
              { color: '#99A39C', fontSize: 9, paddingHorizontal: 26, marginBottom: 14 },
            ]}
          >
            WORKSPACE
          </T>
          <View style={{ gap: 6, paddingHorizontal: 14 }}>
            {navItems
              .filter((n) => n.route !== 'Settings')
              .map((item) => (
                <Pressable
                  key={item.route}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => (item.route === 'Home' ? goHome() : nav.navigate(item.route))}
                  style={({ pressed }) => [
                    s.navItem,
                    current === item.route && s.navActive,
                    pressed && { backgroundColor: colors.tealLight },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    size={19}
                    color={current === item.route ? colors.teal : colors.muted}
                  />
                  <T
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: current === item.route ? colors.teal : colors.muted,
                      fontFamily: current === item.route ? font.bold : font.medium,
                    }}
                  >
                    {item.label}
                  </T>
                  {item.route === 'History' && (
                    <T style={{ fontSize: 10, color: colors.muted }}>{data.cases.length}</T>
                  )}
                </Pressable>
              ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Incomplete cases"
              onPress={() => nav.navigate('History', { filter: 'Pending Review' })}
              style={s.navItem}
            >
              <Icon name="clock" size={19} color={colors.muted} />
              <T style={{ flex: 1, fontSize: 13, color: colors.muted }}>Incomplete cases</T>
              {pending > 0 && (
                <View style={s.count}>
                  <T style={{ color: colors.amber, fontSize: 10 }}>{pending}</T>
                </View>
              )}
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ paddingHorizontal: 22, gap: 16, marginBottom: 22 }}>
            <View style={s.guideCard}>
              <Icon name="feather" size={21} />
              <T style={{ fontSize: 13, fontFamily: font.semibold }}>Assessment guide</T>
              <T style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}>
                Patient details, photo, model result, and save.
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Assessment guide"
                onPress={() => nav.navigate('Info', { topic: 'Assessment guide' })}
                style={{ minHeight: 36, justifyContent: 'center' }}
              >
                <T style={{ fontSize: 11, fontFamily: font.bold, color: colors.teal }}>
                  Assessment guide ↗
                </T>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => nav.navigate('Settings')}
              style={[s.navItem, { paddingHorizontal: 2 }]}
            >
              <Icon name="settings" size={18} color={colors.muted} />
              <T style={{ color: colors.muted, fontSize: 13 }}>Settings & preferences</T>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => nav.navigate('Settings')}
            style={s.profile}
          >
            <Avatar />
            <View style={{ flex: 1 }}>
              <T numberOfLines={1} style={{ fontSize: 12, fontFamily: font.semibold }}>
                {data.profile.name}
              </T>
              <T style={{ fontSize: 10, color: colors.muted }}>{data.profile.role}</T>
            </View>
            <Icon name="chevrons-up" size={14} color={colors.muted} />
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[s.topbar, !wide && { paddingHorizontal: 20, height: 70 }]}>
          {wide ? (
            <View style={common.row}>
              <T style={{ fontSize: 12, color: colors.muted }}>Workspace</T>
              <Icon name="chevron-right" size={13} color="#ABB6AC" />
              <T style={{ fontSize: 12, fontFamily: font.medium }}>
                {assessment
                  ? 'New assessment'
                  : route.name === 'Home'
                    ? 'Overview'
                    : route.name === 'History'
                      ? 'Assessment history'
                      : route.name}
              </T>
            </View>
          ) : (
            <Brand />
          )}
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
            {wide && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: colors.teal }}
                />
                <T style={{ fontSize: 11, color: colors.muted }}>On this device</T>
              </View>
            )}
            <Badge label="Offline" tone="teal" dot={false} />
            {wide && (
              <IconButton name="help-circle" label="Help" onPress={() => nav.navigate('Help')} />
            )}
          </View>
        </View>
        {storageError && (
          <View
            accessibilityRole="alert"
            style={{ padding: 12, backgroundColor: colors.redLight, gap: 6 }}
          >
            <T style={{ color: colors.red, fontSize: 12 }}>{storageError}</T>
            <Button
              variant="secondary"
              label="Retry saving"
              onPress={() => {
                void retrySave();
              }}
            />
          </View>
        )}
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            { maxWidth: narrow ? 800 : 1210, padding: wide ? 36 : 22, paddingBottom: 32 },
          ]}
        >
          {(back || assessment) && (
            <View style={[common.between, { marginBottom: 8 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={back ?? 'Back'}
                onPress={goBack}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 }}
              >
                <Icon name="arrow-left" size={17} color={colors.muted} />
                <T style={{ color: colors.muted, fontSize: 12 }}>{back ?? 'Back'}</T>
              </Pressable>
              {assessment && data.draft && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save & exit"
                  onPress={saveExit}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <T style={{ color: colors.teal, fontSize: 12, fontFamily: font.semibold }}>
                    Save & exit
                  </T>
                </Pressable>
              )}
            </View>
          )}
          {children}
          <View style={{ paddingTop: 30, alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="shield" size={12} color={colors.muted} />
              <T style={{ fontSize: 10, color: colors.muted }}>
                Research use. Model results are not a diagnosis.
              </T>
            </View>
            <T style={{ fontSize: 9, color: '#9CA79F' }}>CLARA</T>
          </View>
        </ScrollView>
        {!wide && (
          <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {navItems
              .filter((item) => item.route !== 'Help')
              .map((item) => (
                <Pressable
                  key={item.route}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: current === item.route }}
                  onPress={() => (item.route === 'Home' ? goHome() : nav.navigate(item.route))}
                  style={s.bottomItem}
                >
                  <View
                    style={[
                      s.bottomIcon,
                      current === item.route && { backgroundColor: colors.tealLight },
                    ]}
                  >
                    <Icon
                      name={item.icon}
                      size={20}
                      color={current === item.route ? colors.teal : '#94A298'}
                    />
                  </View>
                  <T
                    style={{
                      fontSize: 10,
                      fontFamily: current === item.route ? font.bold : font.medium,
                      color: current === item.route ? colors.teal : colors.muted,
                    }}
                  >
                    {item.short}
                  </T>
                </Pressable>
              ))}
          </View>
        )}
      </KeyboardAvoidingView>
      {toast && (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[s.toast, { bottom: wide ? 24 : 100 + insets.bottom }]}
        >
          <Icon name="check-circle" size={18} color="#C4E3BD" />
          <T style={{ color: colors.white, fontSize: 13, flexShrink: 1 }}>{toast}</T>
        </View>
      )}
    </SafeAreaView>
  );
}

export function Avatar() {
  const { data } = useApp();
  const initials = data.profile.name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join('');
  return (
    <View
      style={{
        width: 36,
        height: 36,
        backgroundColor: colors.tealLight,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T style={{ fontFamily: font.bold, color: colors.teal, fontSize: 11 }}>{initials || 'HW'}</T>
    </View>
  );
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const wide = useWide();
  return (
    <View
      style={{
        flexDirection: wide ? 'row' : 'column',
        justifyContent: 'space-between',
        alignItems: wide ? 'center' : 'flex-start',
        gap: 16,
        marginBottom: 26,
      }}
    >
      <View style={{ gap: 7, flex: 1 }}>
        {eyebrow && <T style={common.eyebrow}>{eyebrow}</T>}
        <T
          accessibilityRole="header"
          style={[common.title, wide && { fontSize: 32, lineHeight: 42 }]}
        >
          {title}
        </T>
        {description && (
          <T style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{description}</T>
        )}
      </View>
      {action}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, flexDirection: 'row' },
  sidebar: {
    width: 246,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 9,
  },
  navActive: { backgroundColor: colors.tealLight },
  count: {
    backgroundColor: colors.amberLight,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  guideCard: {
    backgroundColor: colors.tealLight,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  profile: {
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topbar: {
    height: 76,
    paddingHorizontal: 36,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { width: '100%', alignSelf: 'center', flexGrow: 1 },
  bottomNav: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    paddingTop: 8,
  },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  bottomIcon: {
    width: 46,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    left: '10%',
    right: '10%',
    maxWidth: 480,
    marginHorizontal: 'auto',
    backgroundColor: colors.tealDark,
    padding: 15,
    borderRadius: 13,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    elevation: 5,
    boxShadow: '0 6px 20px #0002',
  },
});
