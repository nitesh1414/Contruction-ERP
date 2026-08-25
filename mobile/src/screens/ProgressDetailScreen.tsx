import React, { useEffect, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api, errMsg, loadTokens } from '../api/client';
import { API_URL } from '../config';
import type { ApiOk, ProgressEntry } from '../api/types';
import { Card, ErrorText, LoadingBlock } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Rt = RouteProp<RootStackParamList, 'ProgressDetail'>;

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** Photo grid — files are served by the backend, so images fetch with the auth token. */
function RemotePhoto({ filePath }: { filePath: string }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const tokens = await loadTokens();
      const url = `${API_URL}/${filePath.replace(/^\//, '')}`;
      try {
        const res = await fetch(url, { headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {} });
        if (!res.ok) return;
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (alive) setUri(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch {
        /* leave placeholder */
      }
    })();
    return () => {
      alive = false;
    };
  }, [filePath]);

  if (!uri) return <View style={[styles.photo, { backgroundColor: colors.border }]} />;
  return <Image source={{ uri }} style={styles.photo} />;
}

export default function ProgressDetailScreen() {
  const route = useRoute<Rt>();
  const [entry, setEntry] = useState<ProgressEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ApiOk<ProgressEntry>>(`/progress/${route.params.id}`);
        setEntry(res.data);
      } catch (err) {
        setError(errMsg(err));
      }
    })();
  }, [route.params.id]);

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ErrorText message={error} />
        <LoadingBlock />
      </View>
    );
  }

  const openMap = () => {
    if (entry.latitude && entry.longitude) {
      Linking.openURL(`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{dayjs(entry.report_date).format('dddd, D MMMM YYYY')}</Text>
            <Text style={styles.sub}>
              {entry.project_name}
              {entry.wing_name ? ` • ${entry.wing_name}` : ''}
              {entry.floor_name ? ` • ${entry.floor_name}` : ''}
            </Text>
          </View>
          <Text style={styles.pct}>{Number(entry.percentage).toFixed(0)}%</Text>
        </View>
      </Card>

      <Card>
        <Row label="Work done" value={entry.work_description} />
        <Row label="Work completed" value={entry.work_completed} />
        <Row label="Workers on site" value={entry.labour_count} />
        <Row label="Materials used" value={entry.material_used} />
        <Row label="Weather" value={entry.weather} />
        <Row label="Work time" value={entry.work_time} />
        <Row label="Remarks" value={entry.remarks} />
        <Row label="Reported by" value={entry.created_by_name} />
        {entry.latitude && entry.longitude ? (
          <TouchableOpacity onPress={openMap} style={styles.mapLink}>
            <Text style={styles.mapLinkText}>
              📍 {Number(entry.latitude).toFixed(6)}, {Number(entry.longitude).toFixed(6)} — open in maps
            </Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      {entry.photos?.length ? (
        <Card>
          <Text style={styles.photosTitle}>Site photos ({entry.photos.length})</Text>
          <View style={styles.photoGrid}>
            {entry.photos.map((p) => (
              <View key={p.id}>
                <RemotePhoto filePath={p.file_path} />
                {p.latitude && p.longitude ? (
                  <Text style={styles.photoMeta}>
                    📍 {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                  </Text>
                ) : null}
                {p.captured_at ? <Text style={styles.photoMeta}>🕒 {dayjs(p.captured_at).format('D MMM, h:mm A')}</Text> : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textFaint, marginTop: 3 },
  pct: { fontSize: 26, fontWeight: '800', color: colors.brand },
  row: { marginBottom: 10 },
  rowLabel: { fontSize: 11.5, color: colors.textFaint, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { fontSize: 14, color: colors.text, marginTop: 2 },
  mapLink: { marginTop: 4, paddingVertical: 6 },
  mapLinkText: { color: colors.info, fontSize: 13.5, fontWeight: '600' },
  photosTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 100, height: 100, borderRadius: 10 },
  photoMeta: { fontSize: 9.5, color: colors.textFaint, marginTop: 3, width: 100 },
});
