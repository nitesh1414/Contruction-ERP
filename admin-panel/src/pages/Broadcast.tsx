import React, { useState } from 'react';
import { api, errMsg } from '../api/client';
import { useFetch } from '../hooks/useFetch';
import { Field, useToast } from '../components/ui';

export default function Broadcast() {
  const toast = useToast();
  const { data: users } = useFetch<any[]>('/auth/user-directory');
  const [form, setForm] = useState({ title: '', message: '', type: 'info' });
  const [targets, setTargets] = useState<Set<number>>(new Set());
  const [allUsers, setAllUsers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const send = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.push('Title and message are required', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post('/notifications/broadcast', {
        ...form,
        userIds: allUsers ? [] : [...targets],
      });
      toast.push(res.data.message || 'Broadcast sent');
      setSentCount(allUsers ? (users?.length ?? 0) : targets.size);
      setForm({ title: '', message: '', type: 'info' });
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h2>Broadcast Notification</h2>
        <Field config={{ key: 'title', label: 'Title', type: 'text', required: true }} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} />
        <Field config={{ key: 'message', label: 'Message', type: 'textarea', required: true }} value={form.message} onChange={(v) => setForm((s) => ({ ...s, message: v }))} />
        <Field config={{ key: 'type', label: 'Type', type: 'select', options: [{ value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Critical' }] }} value={form.type} onChange={(v) => setForm((s) => ({ ...s, type: v }))} />
        <div className="field">
          <label className="flex gap-sm">
            <input type="checkbox" checked={allUsers} onChange={(e) => setAllUsers(e.target.checked)} />
            <span>Send to all active users</span>
          </label>
        </div>
        {!allUsers && (
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
            {(users || []).map((u: any) => (
              <label key={u.id} className="flex gap-sm" style={{ padding: '5px 6px', borderRadius: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={targets.has(u.id)} onChange={() => setTargets((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                <span>{u.name} <span className="muted" style={{ fontSize: 12 }}>{u.email}</span></span>
              </label>
            ))}
          </div>
        )}
        <button className="btn primary" style={{ marginTop: 14 }} onClick={send} disabled={busy}>{busy ? 'Sending…' : '📣 Send broadcast'}</button>
      </div>
      <div className="card card-pad">
        <h2>Preview</h2>
        <div className={`notification-preview ${form.type}`} style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, minHeight: 90 }}>
          <strong>{form.title || 'Notification title'}</strong>
          <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>{form.message || 'Your message preview appears here…'}</div>
        </div>
        {sentCount !== null && <p style={{ marginTop: 12 }}>✅ Last broadcast delivered to <strong>{sentCount}</strong> user(s).</p>}
      </div>
    </div>
  );
}
