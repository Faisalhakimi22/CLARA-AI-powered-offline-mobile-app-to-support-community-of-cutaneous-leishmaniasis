import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Splash from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/domain/types';
import { AppProvider, useApp } from './src/state/AppContext';
import { SplashScreen, WelcomeScreen, ConsentScreen } from './src/screens/OnboardingScreens';
import { HomeScreen } from './src/screens/HomeScreen';
import { PatientScreen } from './src/screens/PatientScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { InitialResultScreen } from './src/screens/AssessmentScreens';
import { QualityScreen } from './src/screens/PhotoReviewScreen';
import { ProcessingScreen } from './src/screens/ImageAssessmentScreen';
import { SummaryScreen } from './src/screens/CompletionScreens';
import { MicroscopyScreen, StudyScreen } from './src/screens/StudyScreens';
import { HistoryScreen, DetailScreen } from './src/screens/HistoryScreens';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { HelpScreen, InfoScreen } from './src/screens/HelpScreens';
import { PreventionScreen } from './src/screens/PreventionScreen';
import { colors } from './src/theme';
import { Button, Card, T } from './src/components/ui';
import { ConfirmDialog } from './src/components/ConfirmDialog';

void Splash.preventAutoHideAsync().catch(() => undefined);
const Stack = createNativeStackNavigator<RootStackParamList>();

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <View
          style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}
        >
          <Card>
            <T>Something interrupted the workspace. Your saved cases remain on this device.</T>
            <Button label="Try again" onPress={() => this.setState({ error: false })} />
          </Card>
        </View>
      );
    return this.props.children;
  }
}

function Navigator() {
  const { ready, loadError, data, clearAll } = useApp();
  const [introFinished, setIntroFinished] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Manrope_600SemiBold,
    Manrope_700Bold,
    ...Feather.font,
  });
  useEffect(() => {
    const timer = setTimeout(() => setIntroFinished(true), 1300);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (fontsLoaded || fontError) void Splash.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!ready || !introFinished || (!fontsLoaded && !fontError)) return <SplashScreen />;
  if (loadError)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Card>
          <T>{loadError}</T>
          <Button
            label="Clear unreadable local data"
            variant="danger"
            onPress={() => setConfirmReset(true)}
          />
        </Card>
        <ConfirmDialog
          visible={confirmReset}
          title="Remove local data?"
          description="This removes all stored records. This action cannot be undone."
          confirmLabel="Delete all local data"
          onConfirm={() => {
            void clearAll();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      </View>
    );
  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.bg,
          primary: colors.teal,
          card: colors.surface,
          text: colors.ink,
          border: colors.line,
        },
      }}
    >
      <Stack.Navigator
        initialRouteName={
          !data.consentAt
            ? 'Welcome'
            : !data.profile.name || !data.profile.role
              ? 'ProfileSetup'
              : 'Home'
        }
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.bg },
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Consent" component={ConsentScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Patient" component={PatientScreen} />
        <Stack.Screen name="Capture" component={CaptureScreen} />
        <Stack.Screen name="Quality" component={QualityScreen} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="Initial" component={InitialResultScreen} />
        <Stack.Screen name="Summary" component={SummaryScreen} />
        <Stack.Screen name="Microscopy" component={MicroscopyScreen} />
        <Stack.Screen name="Study" component={StudyScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Detail" component={DetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
        <Stack.Screen name="Prevention" component={PreventionScreen} />
        <Stack.Screen name="Info" component={InfoScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <AppProvider>
          <Navigator />
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
