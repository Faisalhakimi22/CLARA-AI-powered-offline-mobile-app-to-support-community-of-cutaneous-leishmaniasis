import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { RouteProp, useIsFocused, useRoute } from '@react-navigation/native';
import { Screen, PageTitle } from '../components/Screen';
import { Button, Card, Icon, Note, Stepper, T } from '../components/ui';
import { ImagePreview } from '../components/Illustrations';
import { useApp } from '../state/AppContext';
import { useNav } from '../navigation';
import { LesionImage, RootStackParamList } from '../domain/types';
import { persistImage } from '../services/imageStorage';
import { colors, common, font } from '../theme';

export function CaptureScreen() {
  const { data, updateDraft } = useApp();
  const nav = useNav();
  const focused = useIsFocused();
  const route = useRoute<RouteProp<RootStackParamList, 'Capture'>>();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<LesionImage | undefined>(
    route.params?.retake ? undefined : data.draft?.image,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openCamera = async () => {
    setError('');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        setError(
          'Camera access is unavailable. Enable camera permission or choose a photo from your device.',
        );
        return;
      }
      setSelected(undefined);
      setReady(false);
      setActive(true);
    } catch {
      setError('The camera could not open. You can still upload a photo from your device.');
    }
  };
  const capture = async () => {
    if (!camera.current || !ready) return;
    setBusy(true);
    setError('');
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error('No photo returned');
      setSelected(await persistImage(photo.uri, 'camera'));
      setActive(false);
    } catch {
      setError('The photo could not be saved. Please try again or choose a different image.');
    } finally {
      setBusy(false);
    }
  };
  const gallery = async () => {
    setError('');
    try {
      // Launch directly from the tap so the browser can open its file chooser.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        exif: false,
      });
      if (result.canceled) return;
      setBusy(true);
      const photo = result.assets[0];
      if (photo.fileSize && photo.fileSize > 20 * 1024 * 1024)
        throw new Error('Choose an image smaller than 20 MB.');
      setSelected(await persistImage(photo.uri, 'gallery'));
      setActive(false);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes('20 MB')
          ? e.message
          : 'This image could not be opened. Try a JPG or PNG from your device.',
      );
    } finally {
      setBusy(false);
    }
  };
  const usePhoto = () => {
    if (!selected) return;
    updateDraft({
      image: selected,
      quality: undefined,
      segmentation: undefined,
      initial: undefined,
      analysisRun: undefined,
      updated: undefined,
      review: undefined,
      reviewDraft: undefined,
      completedAt: undefined,
      status: 'Pending Review',
      step: 'Quality',
    });
    nav.navigate('Quality');
  };
  return (
    <Screen narrow assessment>
      <Stepper step={2} />
      <PageTitle
        eyebrow="LESION PHOTOGRAPH"
        title={selected ? 'A clear view of the lesion.' : 'Bring the lesion into focus.'}
        description={
          selected
            ? 'Check that the lesion is clearly visible before continuing.'
            : 'Take a lesion photograph or choose one from your device.'
        }
      />
      <View style={common.stack}>
        <Card style={{ padding: 16 }}>
          {selected ? (
            <ImagePreview image={selected} height={340} />
          ) : active && focused ? (
            <View
              style={{
                height: 360,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: colors.tealDark,
              }}
            >
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                mode="picture"
                onCameraReady={() => setReady(true)}
                onMountError={() => {
                  setActive(false);
                  setError('No camera is available. Choose a photo from your device to continue.');
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 65,
                  bottom: 65,
                  left: 45,
                  right: 45,
                  borderWidth: 1.5,
                  borderRadius: 18,
                  borderColor: '#FFFFFFCC',
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  bottom: 20,
                  alignSelf: 'center',
                  backgroundColor: '#8F1D29CC',
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <T style={{ color: colors.white, fontSize: 11 }}>
                  Keep the lesion inside the frame
                </T>
              </View>
            </View>
          ) : (
            <View
              style={{
                alignItems: 'center',
                backgroundColor: colors.tealLight,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <T
                style={{ fontSize: 14, color: colors.ink, marginVertical: 34, textAlign: 'center' }}
              >
                Camera preview
              </T>
            </View>
          )}
          {busy && <ActivityIndicator color={colors.teal} />}
          {selected ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                label="Retake Photo"
                icon="rotate-ccw"
                variant="secondary"
                onPress={() => {
                  setSelected(undefined);
                  setActive(false);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Use Photo"
                icon="check"
                onPress={usePhoto}
                style={{ flex: 1 }}
                disabled={busy}
              />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Button
                label={active ? 'Take photo' : 'Open camera'}
                icon="camera"
                onPress={active ? capture : openCamera}
                disabled={busy || (active && !ready)}
              />
              <Button
                label="Upload from gallery"
                icon="image"
                variant="secondary"
                onPress={gallery}
                disabled={busy}
              />
            </View>
          )}
          {!!error && (
            <Note tone="amber" title="Let’s try another way">
              {error}
            </Note>
          )}
          {permission &&
            !permission.granted &&
            !permission.canAskAgain &&
            Platform.OS !== 'web' && (
              <Button
                label="Open device settings"
                variant="secondary"
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            )}
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {[
            ['sun', 'Good, even lighting'],
            ['maximize', 'Lesion clearly visible'],
            ['image', 'Simple background'],
            ['target', 'Hold the camera steady'],
          ].map(([icon, text]) => (
            <View
              key={text}
              style={{ width: '46%', flexDirection: 'row', gap: 8, alignItems: 'center' }}
            >
              <Icon name={icon as 'sun'} size={16} color={colors.teal} />
              <T style={{ fontSize: 11, color: colors.muted, flex: 1 }}>{text}</T>
            </View>
          ))}
        </View>
        <Note icon="shield">
          Obtain appropriate patient consent before taking a photo. Avoid faces, identifying marks,
          and unnecessary objects when possible.
        </Note>
        <Button
          label="Read the photo guide"
          icon="book-open"
          variant="ghost"
          onPress={() => nav.navigate('Help')}
        />
      </View>
    </Screen>
  );
}
