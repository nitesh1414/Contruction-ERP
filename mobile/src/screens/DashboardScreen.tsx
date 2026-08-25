import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errMsg } from '../api/client';
import type { ApiOk, DashboardOverview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card, ErrorText, LoadingBlock, SectionTitle, StatTile } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
  const { user, can, canAny } = useAuth();
  const navigation = useNavigation<Nav>();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<ApiOk<DashboardOverview>>('/dashboard/overview');
      setData(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <LoadingBlock />;

  const presentToday = data?.attendanceToday?.find((a) => a.status === 'present')?.count ?? 0;
  const totalMarked = (data?.attendanceToday || []).reduce((s, a) => s + Number(a.count), 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
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
    >
      <Text style={styles.hello}>Hello, {user?.name?.split(' ')[0] || 'there'} 👋</Text>
      <Text style={styles.date}>{dayjs().format('dddd, D MMMM YYYY')}</Text>

      <ErrorText message={error} />

      <SectionTitle title="Site at a glance" />
      <View style={styles.statRow}>
        <StatTile label="Projects" value={data?.projects.total ?? '—'} />
        <View style={{ width: 10 }} />
        <StatTile label="Avg Progress" value={`${data?.projects.avgProgress ?? 0}%`} accent={colors.success} />
        <View style={{ width: 10 }} />
        <StatTile label="Wings / Blocks" value={data?.wings.total ?? '—'} accent={colors.info} />
      </View>
      <View style={[styles.statRow, { marginTop: 10 }]}>
        <StatTile
          label="Open Issues"
          value={data?.issues.open ?? '—'}
          accent={colors.danger}
          onPress={() => navigation.navigate('Main', { screen: 'Issues' })}
        />
        <View style={{ width: 10 }} />
        <StatTile
          label="Workers Present"
          value={`${presentToday}/${totalMarked || 0}`}
          accent={colors.purple}
          onPress={() => navigation.navigate('Main', { screen: 'Attendance' })}
        />
        <View style={{ width: 10 }} />
        <StatTile
          label="Pending Inspections"
          value={data?.inspections.pending ?? '—'}
          accent="#a97e00"
          onPress={() => navigation.navigate('Inspections')}
        />
      </View>

      <SectionTitle title="Quick actions" />
      <View style={styles.actionsRow}>
        {can('progress', 'create') ? (
          <QuickAction glyph="📸" label="Capture Progress" onPress={() => navigation.navigate('ProgressCapture')} />
        ) : null}
        {canAny('issues.create', 'issues.view') ? (
          <QuickAction glyph="⚠️" label="Raise Issue" onPress={() => navigation.navigate('IssueCreate')} />
        ) : null}
        {can('attendance', 'create') ? (
          <QuickAction glyph="✅" label="Mark Attendance" onPress={() => navigation.navigate('Main', { screen: 'Attendance' })} />
        ) : null}
        {can('inspections', 'view') ? (
          <QuickAction glyph="🔍" label="Inspections" onPress={() => navigation.navigate('Inspections')} />
        ) : null}
      </View>

      <SectionTitle title="Recent progress reports" />
      <Card>
        {data?.recentProgress?.length ? (
          data.recentProgress.map((p, idx) => (
            <View key={p.id} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle} numberOfLines={1}>
                  {p.work_description || 'Progress update'}
                </Text>
                <Text style={styles.listSub}>
                  {p.project_name}
                  {p.wing_name ? ` • ${p.wing_name}` : ''} • {p.created_by_name || 'site team'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.pct}>{Number(p.percentage).toFixed(0)}%</Text>
                <Text style={styles.listSub}>{dayjs(p.report_date).format('D MMM')}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No progress reported yet.</Text>
        )}
      </Card>

      <SectionTitle title="Attention needed" />
      <Card>
        {data?.recentIssues?.length ? (
          data.recentIssues.map((i, idx) => (
            <View key={i.id} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.listTitle} numberOfLines={1}>
                  {i.issue_number} — {i.title}
                </Text>
                <Text style={styles.listSub}>{i.project_name}</Text>
              </View>
              <Badge status={i.priority} />
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No open issues. Great job! 🎉</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function QuickAction({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <View style={styles.actionWrap}>
      <Text style={styles.actionGlyph} onPress={onPress}>
        {glyph}
      </Text>
      <Text style={styles.actionLabel} onPress={onPress} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hello: { fontSize: 21, fontWeight: '800', color: colors.text },
  date: { fontSize: 12.5, color: colors.textFaint, marginBottom: 14, marginTop: 2 },
  statRow: { flexDirection: 'row' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  actionWrap: { width: '25%', alignItems: 'center', marginBottom: 14, paddingHorizontal: 4 },
  actionGlyph: {
    fontSize: 22,
    backgroundColor: colors.card,
    width: 52,
    height: 52,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 52,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: { fontSize: 10.5, color: colors.textSoft, marginTop: 5, textAlign: 'center', fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listTitle: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  listSub: { fontSize: 11.5, color: colors.textFaint, marginTop: 2 },
  pct: { fontSize: 16, fontWeight: '800', color: colors.brand },
  empty: { color: colors.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
});
