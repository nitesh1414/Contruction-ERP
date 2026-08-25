import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg } from '../api/client';
import type { Paged, ProgressEntry } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useStructure } from '../hooks/useStructure';
import { Badge, Card, EmptyState, ErrorText, Field, LoadingBlock, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProgressListScreen() {
  const navigation = useNavigation<Nav>();
  const { can } = useAuth();
  const structure = useStructure();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<Paged<ProgressEntry>>('/progress', {
        projectId: structure.projectId ?? undefined,
        wingId: structure.wingId ?? undefined,
        limit: 50,
      });
      setEntries(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [structure.projectId, structure.wingId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.filters}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field label="Project">
            <PickerField
              value={structure.projectId}
              options={structure.projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={structure.selectProject}
              placeholder="All projects"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Wing">
            <PickerField
              value={structure.wingId}
              options={structure.wings.map((w) => ({ value: w.id, label: w.name }))}
              onChange={structure.selectWing}
              placeholder="All wings"
            />
          </Field>
        </View>
      </View>

      <ErrorText message={error} />
      {loading && !entries.length ? (
        <LoadingBlock />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              colors={[colors.brand]}
            />
          }
          ListEmptyComponent={<EmptyState title="No progress reports" subtitle="Capture today's site progress with photos & GPS." />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('ProgressDetail', { id: item.id })} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowTop}>
                  <Text style={styles.cardTitle}>{dayjs(item.report_date).format('ddd, D MMM YYYY')}</Text>
                  <Text style={styles.pct}>{Number(item.percentage).toFixed(0)}%</Text>
                </View>
                <Text style={styles.desc} numberOfLines={2}>
                  {item.work_description || '—'}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.project_name}
                    {item.wing_name ? ` • ${item.wing_name}` : ''}
                    {item.floor_name ? ` • ${item.floor_name}` : ''}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>👷 {item.labour_count} workers</Text>
                  {item.photos?.length ? <Text style={styles.meta}>📷 {item.photos.length}</Text> : null}
                  {item.latitude && item.longitude ? (
                    <Badge status="synced" label="📍 GPS" />
                  ) : (
                    <Text style={styles.meta}>by {item.created_by_name || '—'}</Text>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      {can('progress', 'create') ? (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('ProgressCapture')} activeOpacity={0.9}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  pct: { fontSize: 17, fontWeight: '800', color: colors.brand },
  desc: { fontSize: 13, color: colors.textSoft, marginTop: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 7, flexWrap: 'wrap' },
  meta: { fontSize: 11.5, color: colors.textFaint },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '600' },
});
