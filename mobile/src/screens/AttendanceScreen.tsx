import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { api, errMsg } from '../api/client';
import type { ApiOk, AttendanceRecord, AttendanceStatus, Paged, Worker } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useStructure } from '../hooks/useStructure';
import { Button, Card, EmptyState, ErrorText, Field, LoadingBlock, PickerField } from '../components/UI';
import { colors, STATUS_COLORS } from '../theme';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'half_day', 'leave', 'overtime'];

interface DayMark {
  status: AttendanceStatus;
  overtime_hours: number;
}

export default function AttendanceScreen() {
  const { can } = useAuth();
  const structure = useStructure();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [existing, setExisting] = useState<Map<number, DayMark>>(new Map());
  const [marks, setMarks] = useState<Map<number, DayMark>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const canMark = can('attendance', 'create') || can('attendance', 'edit');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [workersRes, attendanceRes] = await Promise.all([
        api.get<Paged<Worker>>('/workers', {
          projectId: structure.projectId ?? undefined,
          wingId: structure.wingId ?? undefined,
          is_active: 1,
          limit: 200,
        }),
        structure.projectId
          ? api.get<Paged<AttendanceRecord>>('/attendance', {
              projectId: structure.projectId,
              wingId: structure.wingId ?? undefined,
              date,
              limit: 500,
            })
          : Promise.resolve(null),
      ]);
      setWorkers(workersRes.data);
      const map = new Map<number, DayMark>();
      attendanceRes?.data.forEach((a) => {
        map.set(a.worker_id, { status: a.status, overtime_hours: Number(a.overtime_hours) || 0 });
      });
      setExisting(map);
      setDirty(false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [structure.projectId, structure.wingId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  // effective marks = local marks overlaid on server state
  const effective = useMemo(() => {
    const merged = new Map<number, DayMark>(existing);
    marks.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [existing, marks]);

  const setStatus = (workerId: number, status: AttendanceStatus) => {
    if (!canMark) return;
    setMarks((prev) => {
      const next = new Map(prev);
      const current = next.get(workerId) ?? existing.get(workerId) ?? { status: 'present' as AttendanceStatus, overtime_hours: 0 };
      next.set(workerId, {
        status,
        overtime_hours: status === 'overtime' ? current.overtime_hours || 2 : current.overtime_hours,
      });
      return next;
    });
    setDirty(true);
  };

  const cycleOt = (workerId: number) => {
    if (!canMark) return;
    setMarks((prev) => {
      const next = new Map(prev);
      const current = next.get(workerId) ?? existing.get(workerId) ?? { status: 'overtime' as AttendanceStatus, overtime_hours: 0 };
      next.set(workerId, { ...current, status: 'overtime', overtime_hours: ((current.overtime_hours || 0) + 1) % 13 });
      return next;
    });
    setDirty(true);
  };

  const markAll = (status: AttendanceStatus) => {
    if (!canMark) return;
    const next = new Map<number, DayMark>();
    workers.forEach((w) => next.set(w.id, { status, overtime_hours: effective.get(w.id)?.overtime_hours ?? 0 }));
    setMarks(next);
    setDirty(true);
  };

  const save = async () => {
    if (!structure.projectId) {
      setError('Select a project first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const records = workers.map((w) => {
        const m = effective.get(w.id);
        return {
          worker_id: w.id,
          status: m?.status ?? 'absent',
          overtime_hours: m?.status === 'overtime' ? m.overtime_hours : 0,
        };
      });
      await api.post<ApiOk<unknown>>('/attendance', {
        project_id: structure.projectId,
        wing_id: structure.wingId,
        date,
        shift: 'day',
        records,
      });
      setDirty(false);
      Alert.alert('Saved', `Attendance for ${dayjs(date).format('D MMM YYYY')} saved.`);
      void load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    effective.forEach((m) => {
      c[m.status] = (c[m.status] || 0) + 1;
    });
    return c;
  }, [effective]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Project" required>
              <PickerField
                value={structure.projectId}
                options={structure.projects.map((p) => ({ value: p.id, label: p.name }))}
                onChange={structure.selectProject}
                placeholder="Select project"
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

        <Field label="Date">
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}>
              <Text style={styles.dateBtnText}>‹</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.dateLabel}>{dayjs(date).format('ddd, D MMM YYYY')}</Text>
              {dayjs(date).isSame(dayjs(), 'day') ? <Text style={styles.todayTag}>Today</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => {
                const next = dayjs(date).add(1, 'day');
                if (!next.isAfter(dayjs(), 'day')) setDate(next.format('YYYY-MM-DD'));
              }}
            >
              <Text style={styles.dateBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        </Field>

        {structure.projectId && workers.length && canMark ? (
          <View style={styles.quickRow}>
            <Text style={styles.quickLabel}>Mark all:</Text>
            <Button title="Present" small variant="secondary" onPress={() => markAll('present')} />
            <Button title="Absent" small variant="ghost" onPress={() => markAll('absent')} />
          </View>
        ) : null}

        {Object.keys(counts).length ? (
          <View style={styles.summaryRow}>
            {STATUSES.filter((s) => counts[s]).map((s) => (
              <View key={s} style={[styles.summaryChip, { backgroundColor: STATUS_COLORS[s]?.bg || colors.border }]}>
                <Text style={[styles.summaryChipText, { color: STATUS_COLORS[s]?.fg || colors.textSoft }]}>
                  {s.replace('_', ' ')}: {counts[s]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <ErrorText message={error} />
        {loading ? (
          <LoadingBlock />
        ) : !structure.projectId ? (
          <EmptyState title="Select a project" subtitle="Choose a project to mark daily attendance." />
        ) : !workers.length ? (
          <EmptyState title="No active workers" subtitle="Workers assigned to this project will appear here." />
        ) : (
          workers.map((w) => {
            const mark = effective.get(w.id);
            return (
              <Card key={w.id} style={{ paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workerName}>{w.name}</Text>
                    <Text style={styles.workerMeta}>
                      {w.worker_code}
                      {w.category_name ? ` • ${w.category_name}` : ''} • ₹{Number(w.daily_wage).toLocaleString('en-IN')}/day
                    </Text>
                  </View>
                </View>
                <View style={styles.statusRow}>
                  {STATUSES.map((s) => {
                    const active = mark?.status === s;
                    const palette = STATUS_COLORS[s];
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusBtn,
                          active && { backgroundColor: palette.fg, borderColor: palette.fg },
                        ]}
                        onPress={() => setStatus(w.id, s)}
                        onLongPress={s === 'overtime' ? () => cycleOt(w.id) : undefined}
                        disabled={!canMark}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.statusBtnText, active && { color: '#fff' }]}>
                          {s === 'half_day' ? 'Half' : s === 'overtime' ? `OT${active && mark ? ` ${mark.overtime_hours}h` : ''}` : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {canMark && workers.length ? (
        <View style={styles.saveBar}>
          <Button
            title={dirty ? 'Save attendance *' : 'Save attendance'}
            onPress={save}
            loading={saving}
            disabled={!structure.projectId}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 8 },
  dateBtn: { paddingHorizontal: 16, paddingVertical: 4 },
  dateBtnText: { fontSize: 20, color: colors.brand, fontWeight: '700' },
  dateLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  todayTag: { fontSize: 10.5, color: colors.success, fontWeight: '700' },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  quickLabel: { fontSize: 12.5, color: colors.textSoft, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  summaryChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  summaryChipText: { fontSize: 11.5, fontWeight: '700', textTransform: 'capitalize' },
  workerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  workerMeta: { fontSize: 11.5, color: colors.textFaint, marginTop: 1 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSoft },
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
