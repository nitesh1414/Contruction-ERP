import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api, errMsg } from '../api/client';
import type { ApiOk, Inspection, InspectionItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorText, LoadingBlock, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Rt = RouteProp<RootStackParamList, 'InspectionDetail'>;

type Result = InspectionItem['result'];
const RESULTS: Array<{ key: Result; label: string; fg: string; bg: string }> = [
  { key: 'pass', label: 'Pass', fg: '#fff', bg: colors.success },
  { key: 'fail', label: 'Fail', fg: '#fff', bg: colors.danger },
  { key: 'na', label: 'N/A', fg: '#fff', bg: colors.textFaint },
  { key: 'pending', label: 'Pending', fg: colors.textSoft, bg: colors.border },
];

const STATUS_FLOW: Record<string, string[]> = {
  pending: ['passed', 'failed', 'reinspection_required'],
  failed: ['reinspection_required', 'closed'],
  reinspection_required: ['passed', 'failed', 'closed'],
  passed: ['closed'],
};

const RESULT_COLORS: Record<Result, { fg: string; bg: string }> = {
  pass: { fg: colors.success, bg: colors.successSoft },
  fail: { fg: colors.danger, bg: colors.dangerSoft },
  na: { fg: colors.textSoft, bg: colors.border },
  pending: { fg: colors.info, bg: colors.infoSoft },
};

export default function InspectionDetailScreen() {
  const route = useRoute<Rt>();
  const { can } = useAuth();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nextStatus, setNextStatus] = useState<string | number | null>(null);

  const canEdit = can('inspections', 'edit');

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiOk<Inspection>>(`/inspections/${route.params.id}`);
      setInspection(res.data);
      setItems(res.data.items || []);
      setDirty(false);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [route.params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!inspection) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <ErrorText message={error} />
        <LoadingBlock />
      </View>
    );
  }

  const setResult = (itemId: number, result: Result) => {
    if (!canEdit) return;
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, result } : it)));
    setDirty(true);
  };

  const save = async (statusOverride?: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/inspections/${inspection.id}`, {
        status: statusOverride ?? inspection.status,
        items: items.map((it) => ({ checklist_item: it.checklist_item, result: it.result, remarks: it.remarks })),
      });
      await load();
      if (statusOverride) Alert.alert('Updated', `Inspection marked as ${statusOverride.replace(/_/g, ' ')}.`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const transitions = STATUS_FLOW[inspection.status] || [];
  const passed = items.filter((i) => i.result === 'pass').length;
  const failed = items.filter((i) => i.result === 'fail').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: canEdit ? 110 : 40 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.num}>{inspection.inspection_number}</Text>
            <Badge status={inspection.status} />
          </View>
          <Text style={styles.title}>{inspection.inspection_type_name || 'Inspection'}</Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            <Text style={styles.meta}>
              📁 {inspection.project_name}
              {inspection.wing_name ? ` • ${inspection.wing_name}` : ''}
              {inspection.location ? ` • ${inspection.location}` : ''}
            </Text>
            <Text style={styles.meta}>
              🗓 {dayjs(inspection.inspection_date).format('D MMM YYYY')}
              {inspection.inspector_name ? ` • Inspector: ${inspection.inspector_name}` : ''}
            </Text>
            {items.length ? (
              <Text style={styles.meta}>
                ✅ {passed} passed • ❌ {failed} failed • ⏳ {items.length - passed - failed - items.filter((i) => i.result === 'na').length} pending
              </Text>
            ) : null}
            {inspection.observation ? <Text style={styles.obs}>Observation: {inspection.observation}</Text> : null}
          </View>
        </Card>

        {items.length ? (
          <Card>
            <Text style={styles.sectionLabel}>Checklist</Text>
            {items.map((it, idx) => (
              <View key={it.id} style={[styles.checkRow, idx > 0 && styles.checkRowBorder]}>
                <Text style={styles.checkText}>{it.checklist_item}</Text>
                <View style={styles.resultRow}>
                  {RESULTS.map((r) => {
                    const active = it.result === r.key;
                    return (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.resultBtn, active && { backgroundColor: r.bg === colors.border ? RESULT_COLORS.pending.fg : r.bg, borderColor: r.bg }]}
                        onPress={() => setResult(it.id, r.key)}
                        disabled={!canEdit}
                        activeOpacity={0.75}
                      >
                        <Text style={[
                          styles.resultBtnText,
                          active && { color: r.bg === colors.border ? '#fff' : r.fg },
                          !active && { color: RESULT_COLORS[r.key].fg },
                        ]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {canEdit && transitions.length ? (
          <Card>
            <Text style={styles.sectionLabel}>Close out</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <PickerField
                  value={nextStatus}
                  options={transitions.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toUpperCase() }))}
                  onChange={setNextStatus}
                  placeholder="Final outcome…"
                />
              </View>
              <Button title="Apply" small loading={saving} disabled={!nextStatus} onPress={() => save(String(nextStatus))} />
            </View>
          </Card>
        ) : null}
        <ErrorText message={error} />
      </ScrollView>

      {canEdit && dirty ? (
        <View style={styles.saveBar}>
          <Button title="Save checklist results" onPress={() => save()} loading={saving} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  num: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  title: { fontSize: 16.5, fontWeight: '800', color: colors.text, marginTop: 5 },
  meta: { fontSize: 12, color: colors.textFaint },
  obs: { fontSize: 12.5, color: colors.textSoft, marginTop: 6, fontStyle: 'italic' },
  sectionLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: 8 },
  checkRow: { paddingVertical: 10 },
  checkRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  checkText: { fontSize: 13.5, color: colors.text, marginBottom: 8, lineHeight: 18 },
  resultRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  resultBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.border },
  resultBtnText: { fontSize: 12, fontWeight: '700' },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
