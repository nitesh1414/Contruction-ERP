import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg, filePart } from '../api/client';
import type { IssueCategory, Paged } from '../api/types';
import { enqueue, isOnline, newClientRef, syncQueue, type QueuedPhoto } from '../offline/queue';
import { useStructure } from '../hooks/useStructure';
import { useGps } from '../hooks/useGps';
import { Button, Card, ErrorText, Field, Input, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PRIORITIES = ['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: p.toUpperCase() }));

export default function IssueCreateScreen() {
  const navigation = useNavigation<Nav>();
  const structure = useStructure();
  const gps = useGps();

  const [categories, setCategories] = useState<IssueCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priority, setPriority] = useState<string | number | null>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void gps.capture();
    api
      .get<Paged<IssueCategory>>('/issues/categories', { limit: 100 })
      .then((res) => setCategories(res.data))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, mediaTypes: ['images'] });
    if (!res.canceled) {
      setPhotos((prev) => [
        ...prev,
        ...res.assets.map((a) => ({
          uri: a.uri,
          latitude: gps.fix?.latitude ?? null,
          longitude: gps.fix?.longitude ?? null,
          captured_at: new Date().toISOString(),
          source: 'upload' as const,
        })),
      ]);
    }
  };

  const buildPayload = () => ({
    project_id: structure.projectId,
    wing_id: structure.wingId,
    category_id: categoryId,
    priority: priority || 'medium',
    title: title.trim(),
    description: description.trim(),
    location: location.trim(),
    due_date: dueDate.trim(),
    latitude: gps.fix?.latitude ?? null,
    longitude: gps.fix?.longitude ?? null,
  });

  const submit = async () => {
    if (!structure.projectId) {
      setError('Please choose a project.');
      return;
    }
    if (!title.trim()) {
      setError('Issue title is required.');
      return;
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      setError('Due date must be YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setError(null);
    const clientRef = newClientRef();
    try {
      if (await isOnline()) {
        try {
          const form = new FormData();
          const payload = buildPayload();
          for (const [k, v] of Object.entries(payload)) {
            if (v !== null && v !== undefined && v !== '') form.append(k, String(v));
          }
          form.append('client_ref', clientRef);
          photos.forEach((p) => form.append('photos', filePart(p.uri)));
          await api.postForm('/issues', form);
          Alert.alert('Issue raised', 'The site team has been notified.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        } catch (err) {
          if ((err as any)?.status >= 400 && (err as any)?.status < 500) throw err;
        }
      }
      await enqueue({
        client_ref: clientRef,
        kind: 'issue',
        title: `Issue — ${title.trim().slice(0, 40)}`,
        created_at: new Date().toISOString(),
        payload: buildPayload(),
        photos,
      });
      Alert.alert('Saved offline', 'Issue queued and will sync when you are back online.', [
        { text: 'Sync now', onPress: () => syncQueue().finally(() => navigation.goBack()) },
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ fontSize: 13, color: colors.textSoft }}>
            {gps.fix ? `📍 GPS: ${gps.fix.latitude.toFixed(5)}, ${gps.fix.longitude.toFixed(5)}` : gps.error || '📍 Locating GPS…'}
          </Text>
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
        <Field label="Wing / Block">
          <PickerField
            value={structure.wingId}
            options={structure.wings.map((w) => ({ value: w.id, label: w.name }))}
            onChange={structure.selectWing}
          />
        </Field>
        <Field label="Title" required>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Water seepage in basement wall" />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
            placeholder="Describe the problem, exact spot, severity…"
          />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Priority">
              <PickerField value={priority} options={PRIORITIES} onChange={setPriority} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Category">
              <PickerField
                value={categoryId}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(v) => setCategoryId(v === null ? null : Number(v))}
              />
            </Field>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Location on site">
              <Input value={location} onChangeText={setLocation} placeholder="e.g. B2 near col C4" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Due date">
              <Input value={dueDate} onChangeText={setDueDate} placeholder={dayjs().add(3, 'day').format('YYYY-MM-DD')} autoCapitalize="none" />
            </Field>
          </View>
        </View>

        <Field label={`Photos (${photos.length})`}>
          <View style={styles.photoRow}>
            {photos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.photoWrap}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.photoAdd} onPress={addPhotos}>
              <Text style={{ fontSize: 22 }}>🖼️</Text>
              <Text style={{ fontSize: 10.5, color: colors.textSoft, marginTop: 4, fontWeight: '600' }}>Add</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Button title="Raise issue" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
});
