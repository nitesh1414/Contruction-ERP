import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg } from '../api/client';
import type { Inspection, Paged } from '../api/types';
import { useStructure } from '../hooks/useStructure';
import { Badge, Card, EmptyState, ErrorText, Field, LoadingBlock, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_OPTIONS = ['pending', 'passed', 'failed', 'reinspection_required', 'closed'].map((s) => ({
  value: s,
  label: s.replace(/_/g, ' '),
}));

export default function InspectionsScreen() {
  const navigation = useNavigation<Nav>();
  const structure = useStructure();
  const [status, setStatus] = useState<string | number | null>(null);
  const [items, setItems] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<Paged<Inspection>>('/inspections', {
        projectId: structure.projectId ?? undefined,
        wingId: structure.wingId ?? undefined,
        status: status ?? undefined,
        limit: 60,
      });
      setItems(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [structure.projectId, structure.wingId, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.filters}>
        <View style={{ flex: 1.2, marginRight: 8 }}>
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
          <Field label="Status">
            <PickerField value={status} options={STATUS_OPTIONS} onChange={setStatus} placeholder="All" />
          </Field>
        </View>
      </View>

      <ErrorText message={error} />
      {loading && !items.length ? (
        <LoadingBlock />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              colors={[colors.brand]}
            />
          }
          ListEmptyComponent={<EmptyState title="No inspections" subtitle="Quality and safety inspections will appear here." />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('InspectionDetail', { id: item.id })} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowTop}>
                  <Text style={styles.num}>{item.inspection_number}</Text>
                  <Badge status={item.status} />
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {item.inspection_type_name || 'Inspection'}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.project_name}
                    {item.wing_name ? ` • ${item.wing_name}` : ''}
                  </Text>
                  <Text style={styles.meta}>🗓 {dayjs(item.inspection_date).format('D MMM YYYY')}</Text>
                </View>
                {item.inspector_name ? <Text style={styles.meta}>Inspector: {item.inspector_name}</Text> : null}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' },
  meta: { fontSize: 11.5, color: colors.textFaint, marginTop: 3 },
});
