import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import dayjs from 'dayjs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg, filePart } from '../api/client';
import { enqueue, isOnline, newClientRef, syncQueue, type QueuedPhoto } from '../offline/queue';
import { useStructure } from '../hooks/useStructure';
import { useGps } from '../hooks/useGps';
import { Button, Card, ErrorText, Field, Input, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'ProgressCapture'>;

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Hot', 'Cold'].map((w) => ({ value: w, label: w }));

export default function ProgressCaptureScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const structure = useStructure(route.params?.projectId);
  const gps = useGps();

  const [floorId, setFloorId] = useState<number | null>(null);
  const [reportDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [workDescription, setWorkDescription] = useState('');
  const [workCompleted, setWorkCompleted] = useState('');
  const [percentage, setPercentage] = useState('');
  const [labourCount, setLabourCount] = useState('');
  const [materialUsed, setMaterialUsed] = useState('');
  const [weather, setWeather] = useState<string | number | null>(null);
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // capture a GPS fix as soon as the screen opens
  useEffect(() => {
    void gps.capture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhoto = useCallback(
    (uri: string, source: 'camera' | 'upload') => {
      setPhotos((prev) => [
        ...prev,
        {
          uri,
          latitude: gps.fix?.latitude ?? null,
          longitude: gps.fix?.longitude ?? null,
          captured_at: new Date().toISOString(),
          source,
        },
      ]);
    },
    [gps.fix]
  );

  const takePhoto = async () => {
    if (!cameraPerm?.granted) {
      const res = await requestCameraPerm();
      if (!res.granted) {
        Alert.alert('Camera permission', 'Camera access is required to capture site photos.');
        return;
      }
    }
    setCameraOpen(true);
  };

  const snap = async () => {
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      if (pic?.uri) addPhoto(pic.uri, 'camera');
    } finally {
      setCameraOpen(false);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, mediaTypes: ['images'] });
    if (!res.canceled) res.assets.forEach((a) => addPhoto(a.uri, 'upload'));
  };

  const buildPayload = () => ({
    project_id: structure.projectId,
    wing_id: structure.wingId,
    floor_id: floorId,
    report_date: reportDate,
    work_time: dayjs().format('HH:mm'),
    work_description: workDescription.trim(),
    work_completed: workCompleted.trim(),
    percentage: Number(percentage) || 0,
    labour_count: Number(labourCount) || 0,
    material_used: materialUsed.trim(),
    weather: weather ? String(weather) : '',
    remarks: remarks.trim(),
    latitude: gps.fix?.latitude ?? null,
    longitude: gps.fix?.longitude ?? null,
  });

  const validate = (): string | null => {
    if (!structure.projectId) return 'Please choose a project.';
    if (!workDescription.trim()) return 'Please describe today’s work.';
    if (percentage && (Number(percentage) < 0 || Number(percentage) > 100)) return 'Progress % must be between 0 and 100.';
    return null;
  };

  const submitOnline = async (clientRef: string) => {
    const payload = buildPayload();
    const form = new FormData();
    for (const [k, v] of Object.entries(payload)) {
      if (v !== null && v !== undefined && v !== '') form.append(k, String(v));
    }
    form.append('client_ref', clientRef);
    photos.forEach((p) => form.append('photos', filePart(p.uri)));
    if (photos.length) {
      form.append(
        'photosMeta',
        JSON.stringify(photos.map((p) => ({ latitude: p.latitude, longitude: p.longitude, captured_at: p.captured_at, source: p.source })))
      );
    }
    await api.postForm('/progress', form);
  };

  const submit = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    const clientRef = newClientRef();
    try {
      if (await isOnline()) {
        try {
          await submitOnline(clientRef);
          Alert.alert('Saved', 'Progress report submitted.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        } catch (err) {
          // Network hiccup mid-upload → fall through to the offline queue
          if ((err as any)?.status && (err as any).status >= 400 && (err as any).status < 500) throw err;
        }
      }
      await enqueue({
        client_ref: clientRef,
        kind: 'progress',
        title: `Progress — ${reportDate}`,
        created_at: new Date().toISOString(),
        payload: buildPayload(),
        photos,
      });
      Alert.alert(
        'Saved offline',
        'You appear to be offline. The report is queued on this device and will sync automatically when you are back online.',
        [
          { text: 'Sync now', onPress: () => syncQueue().finally(() => navigation.goBack()) },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (cameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={styles.cameraBar}>
          <TouchableOpacity onPress={() => setCameraOpen(false)} style={styles.cameraBtn}>
            <Text style={styles.cameraBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={snap} style={styles.shutter}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <View style={{ width: 70 }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.gpsRow}>
            <Text style={{ fontSize: 13, color: colors.textSoft, flex: 1 }}>
              {gps.fix
                ? `📍 GPS locked: ${gps.fix.latitude.toFixed(5)}, ${gps.fix.longitude.toFixed(5)}`
                : gps.error || '📍 Locating GPS…'}
            </Text>
            <Button title="Retry" small variant="ghost" onPress={() => void gps.capture()} />
          </View>
        </Card>

        <ErrorText message={error} />

        <Field label="Project" required>
          <PickerField
            value={structure.projectId}
            options={structure.projects.map((p) => ({ value: p.id, label: p.name }))}
            onChange={structure.selectProject}
            placeholder="Select project"
          />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Wing / Block">
              <PickerField
                value={structure.wingId}
                options={structure.wings.map((w) => ({ value: w.id, label: w.name }))}
                onChange={structure.selectWing}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Floor">
              <PickerField
                value={floorId}
                options={structure.floors.map((f) => ({ value: f.id, label: f.name }))}
                onChange={(v) => setFloorId(v === null ? null : Number(v))}
              />
            </Field>
          </View>
        </View>

        <Field label={`Work done today — ${dayjs(reportDate).format('D MMM YYYY')}`} required>
          <Input
            value={workDescription}
            onChangeText={setWorkDescription}
            placeholder="e.g. Slab casting for 3rd floor, column reinforcement…"
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
        </Field>
        <Field label="Work completed / milestone note">
          <Input value={workCompleted} onChangeText={setWorkCompleted} placeholder="e.g. 100% of 3rd floor slab" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Progress %">
              <Input value={percentage} onChangeText={setPercentage} keyboardType="numeric" placeholder="0 - 100" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Workers on site">
              <Input value={labourCount} onChangeText={setLabourCount} keyboardType="numeric" placeholder="0" />
            </Field>
          </View>
        </View>
        <Field label="Materials used">
          <Input value={materialUsed} onChangeText={setMaterialUsed} placeholder="e.g. Cement 40 bags, TMT 0.8 MT" />
        </Field>
        <Field label="Weather">
          <PickerField value={weather} options={WEATHER_OPTIONS} onChange={setWeather} placeholder="Select weather" />
        </Field>
        <Field label="Remarks">
          <Input value={remarks} onChangeText={setRemarks} multiline style={{ minHeight: 56, textAlignVertical: 'top' }} />
        </Field>

        <Field label={`Site photos (${photos.length})`}>
          <View style={styles.photoRow}>
            {photos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.photoWrap}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
                {p.latitude ? (
                  <View style={styles.photoGps}>
                    <Text style={{ color: '#fff', fontSize: 9 }}>📍</Text>
                  </View>
                ) : null}
              </View>
            ))}
            <TouchableOpacity style={styles.photoAdd} onPress={takePhoto}>
              <Text style={{ fontSize: 24 }}>📷</Text>
              <Text style={styles.photoAddText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoAdd} onPress={pickFromGallery}>
              <Text style={{ fontSize: 24 }}>🖼️</Text>
              <Text style={styles.photoAddText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Button title="Submit progress report" onPress={submit} loading={busy} />
        <Text style={styles.offlineNote}>
          No internet? No problem — the report is stored on this device and synced automatically.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gpsRow: { flexDirection: 'row', alignItems: 'center' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 86, height: 86, borderRadius: 10, overflow: 'hidden' },
  photo: { width: 86, height: 86 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGps: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  photoAdd: {
    width: 86,
    height: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: 10.5, color: colors.textSoft, marginTop: 4, fontWeight: '600' },
  offlineNote: { textAlign: 'center', fontSize: 11.5, color: colors.textFaint, marginTop: 12 },
  cameraBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
    paddingHorizontal: 26,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  cameraBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  cameraBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
});
