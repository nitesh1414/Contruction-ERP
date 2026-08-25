import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api, errMsg } from '../api/client';
import type { ApiOk, Issue } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorText, Field, Input, LoadingBlock, PickerField } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Rt = RouteProp<RootStackParamList, 'IssueDetail'>;

interface IssueComment {
  id: number;
  comment: string;
  created_by_name?: string;
  created_at: string;
}

const FLOW: Record<string, string[]> = {
  open: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['reopened', 'closed'],
  reopened: ['in_progress', 'resolved', 'closed'],
  closed: ['reopened'],
};

export default function IssueDetailScreen() {
  const route = useRoute<Rt>();
  const { can, user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [nextStatus, setNextStatus] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiOk<Issue & { comments?: IssueComment[] }>>(`/issues/${route.params.id}`);
      setIssue(res.data);
      setComments(res.data.comments || []);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [route.params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!issue) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <ErrorText message={error} />
        <LoadingBlock />
      </View>
    );
  }

  const canEdit = can('issues', 'edit') || issue.assigned_to === user?.id || issue.raised_by === user?.id;
  const transitions = FLOW[issue.status] || [];

  const applyStatus = async () => {
    if (!nextStatus) return;
    setSavingStatus(true);
    try {
      await api.put(`/issues/${issue.id}`, { status: String(nextStatus) });
      setNextStatus(null);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSavingStatus(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/issues/${issue.id}/comments`, { comment: newComment.trim() });
      setNewComment('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.num}>{issue.issue_number}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Badge status={issue.priority} />
              <Badge status={issue.status} />
            </View>
          </View>
          <Text style={styles.title}>{issue.title}</Text>
          {issue.description ? <Text style={styles.desc}>{issue.description}</Text> : null}
          <View style={{ marginTop: 10, gap: 4 }}>
            <Text style={styles.meta}>
              📁 {issue.project_name}
              {issue.wing_name ? ` • ${issue.wing_name}` : ''}
              {issue.location ? ` • ${issue.location}` : ''}
            </Text>
            <Text style={styles.meta}>
              🙍 Raised by {issue.raised_by_name || '—'} on {dayjs(issue.created_at).format('D MMM YYYY, h:mm A')}
            </Text>
            {issue.assigned_to_name ? <Text style={styles.meta}>👉 Assigned to {issue.assigned_to_name}</Text> : null}
            {issue.due_date ? (
              <Text style={[styles.meta, dayjs(issue.due_date).isBefore(dayjs(), 'day') && !['resolved', 'closed'].includes(issue.status) ? { color: colors.danger, fontWeight: '700' } : null]}>
                ⏰ Due {dayjs(issue.due_date).format('D MMM YYYY')}
              </Text>
            ) : null}
            {issue.latitude && issue.longitude ? (
              <Text style={[styles.meta, { color: colors.info }]} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${issue.latitude},${issue.longitude}`)}>
                📍 {Number(issue.latitude).toFixed(5)}, {Number(issue.longitude).toFixed(5)} — open in maps
              </Text>
            ) : null}
          </View>
        </Card>

        {canEdit && transitions.length ? (
          <Card>
            <Text style={styles.sectionLabel}>Update status</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <PickerField
                  value={nextStatus}
                  options={transitions.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toUpperCase() }))}
                  onChange={setNextStatus}
                  placeholder="Choose next status…"
                />
              </View>
              <Button title="Apply" small onPress={applyStatus} loading={savingStatus} disabled={!nextStatus} />
            </View>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.sectionLabel}>Discussion ({comments.length})</Text>
          {comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.commentAuthor}>
                {c.created_by_name || 'User'} • {dayjs(c.created_at).format('D MMM, h:mm A')}
              </Text>
              <Text style={styles.commentText}>{c.comment}</Text>
            </View>
          ))}
          {!comments.length ? <Text style={styles.meta}>No comments yet.</Text> : null}
          <Field label="Add a comment">
            <Input value={newComment} onChangeText={setNewComment} placeholder="Write an update…" multiline style={{ minHeight: 52, textAlignVertical: 'top' }} />
          </Field>
          <Button title="Post comment" onPress={addComment} loading={busy} disabled={!newComment.trim()} variant="secondary" />
        </Card>
        <ErrorText message={error} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  num: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 6 },
  desc: { fontSize: 13.5, color: colors.textSoft, marginTop: 8, lineHeight: 19 },
  meta: { fontSize: 12, color: colors.textFaint },
  sectionLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: 10 },
  comment: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 8 },
  commentAuthor: { fontSize: 11, color: colors.textFaint, fontWeight: '600' },
  commentText: { fontSize: 13.5, color: colors.text, marginTop: 3 },
});
