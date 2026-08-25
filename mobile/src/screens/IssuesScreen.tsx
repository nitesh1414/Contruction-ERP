import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg } from '../api/client';
import type { Issue, Paged } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useStructure } from '../hooks/useStructure';
import { Badge, Card, EmptyState, ErrorText, Field, LoadingBlock, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'closed', label: 'Closed' },
];

export default function IssuesScreen() {
  const navigation = useNavigation<Nav>();
  const { can } = useAuth();
  const structure = useStructure();
  const [status, setStatus] = useState<string | number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<Paged<Issue>>('/issues', {
        projectId: structure.projectId ?? undefined,
        wingId: structure.wingId ?? undefined,
        status: status ?? undefined,
        limit: 60,
      });
      setIssues(res.data);
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
      {loading && !issues.length ? (
        <LoadingBlock />
      ) : (
        <FlatList
          data={issues}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
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
          ListEmptyComponent={<EmptyState title="No issues found" subtitle="Raise site issues with photos & location so they get fixed fast." />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('IssueDetail', { id: item.id })} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowTop}>
                  <Text style={styles.num}>{item.issue_number}</Text>
                  <Badge status={item.priority} />
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.project_name}
                    {item.wing_name ? ` • ${item.wing_name}` : ''}
                  </Text>
                  <Text style={styles.meta}>{dayjs(item.created_at).format('D MMM')}</Text>
                </View>
                <View style={[styles.metaRow, { justifyContent: 'space-between' }]}>
                  <Badge status={item.status} />
                  {item.assigned_to_name ? <Text style={styles.meta}>→ {item.assigned_to_name}</Text> : null}
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      {can('issues', 'create') ? (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('IssueCreate')} activeOpacity={0.9}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 7, alignItems: 'center' },
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
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '600' },
});
