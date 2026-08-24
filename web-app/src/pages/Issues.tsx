import React, { useState } from 'react';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, DataTable, Field, Modal, PaginationBar, fmtDate, useToast,
} from '../components/ui';
import type { Issue } from '../api/types';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'];

export default function Issues() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [projectId, setProjectId] = useState('');
  const params: Record<string, any> = { page, limit: 15 };
  if (status) params.status = status;
  if (priority) params.priority = priority;
  if (projectId) params.projectId = projectId;
  const { data, loading, reload } = useFetch<any>('/issues', params);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const openDetail = async (row: Issue) => {
    try { const res = await api.get(`/issues/${row.id}`); setDetail(res.data.data); }
    catch (e) { console.error(errMsg(e)); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Site Issues</h3>
        <div className="actions">
          {can('issues.create') && <button className="btn primary sm" onClick={() => setCreateOpen(true)}>＋ Raise Issue</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field"><label>Project</label>
          <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {(projects?.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select className="input" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <DataTable<Issue>
        loading={loading}
        rows={data?.data || []}
        onRowClick={openDetail}
        columns={[
          { key: 'issue_number', label: 'No.', render: (i) => <span className="mono">{i.issue_number}</span> },
          {
            key: 'title', label: 'Issue',
            render: (i) => (
              <div style={{ maxWidth: 280 }}>
                <div style={{ fontWeight: 600 }}>{i.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{[i.project_name, i.wing_name, i.location].filter(Boolean).join(' · ')}</div>
              </div>
            ),
          },
          { key: 'category_name', label: 'Category' },
          { key: 'priority', label: 'Priority', render: (i) => <Badge value={i.priority} /> },
          { key: 'status', label: 'Status', render: (i) => <Badge value={i.status} /> },
          { key: 'assigned_to_name', label: 'Assigned to' },
          { key: 'due_date', label: 'Due', render: (i) => (i.due_date ? <span style={{ color: new Date() > new Date(i.due_date) && !['resolved', 'closed'].includes(i.status) ? 'var(--danger)' : undefined }}>{fmtDate(i.due_date)}</span> : '—') },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />

      {createOpen && <IssueCreateModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} />}
      {detail && <IssueDetailModal issue={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload(); }} />}
    </div>
  );
}

function IssueCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: categories } = useFetch<any[]>('/issues/categories');
  const { data: users } = useFetch<any[]>('/auth/user-directory');
  const [form, setForm] = useState<Record<string, any>>({ priority: 'medium' });
  const [busy, setBusy] = useState(false);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : {});

  const save = async () => {
    if (!form.project_id || !form.title) { toast.push('Project and title are required', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
      await api.post('/issues', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.push('Issue raised');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Raise Issue" onClose={onClose} size="lg"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Raise'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: (projects?.data || []).map((p: any) => ({ value: p.id, label: p.name })) }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v, wing_id: null }))} />
        <Field config={{ key: 'wing_id', label: 'Wing', type: 'select', options: (wings || []).map((w: any) => ({ value: w.id, label: w.name })) }} value={form.wing_id} onChange={(v) => setForm((s) => ({ ...s, wing_id: v }))} />
        <div className="full"><Field config={{ key: 'title', label: 'Issue title', type: 'text', required: true }} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} /></div>
        <Field config={{ key: 'category_id', label: 'Category', type: 'select', options: (categories || []).map((c: any) => ({ value: c.id, label: c.name })) }} value={form.category_id} onChange={(v) => setForm((s) => ({ ...s, category_id: v }))} />
        <Field config={{ key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES.map((s) => ({ value: s, label: s })) }} value={form.priority} onChange={(v) => setForm((s) => ({ ...s, priority: v }))} />
        <Field config={{ key: 'assigned_to', label: 'Assign to', type: 'select', options: (users || []).map((u: any) => ({ value: u.id, label: u.name })) }} value={form.assigned_to} onChange={(v) => setForm((s) => ({ ...s, assigned_to: v }))} />
        <Field config={{ key: 'due_date', label: 'Due date', type: 'date' }} value={form.due_date} onChange={(v) => setForm((s) => ({ ...s, due_date: v }))} />
        <Field config={{ key: 'location', label: 'Location', type: 'text' }} value={form.location} onChange={(v) => setForm((s) => ({ ...s, location: v }))} />
        <div className="full"><Field config={{ key: 'description', label: 'Description', type: 'textarea' }} value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></div>
      </div>
    </Modal>
  );
}

function IssueDetailModal({ issue, onClose, onChanged }: { issue: any; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { can, user } = useAuth();
  const [status, setStatus] = useState(issue.status);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>(issue.comments || []);
  const [busy, setBusy] = useState(false);
  const { data: users } = useFetch<any[]>('/auth/user-directory');
  const [assignedTo, setAssignedTo] = useState(issue.assigned_to || '');

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/issues/${issue.id}`, { status, assigned_to: assignedTo || null });
      toast.push('Issue updated');
      onChanged();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      const res = await api.post(`/issues/${issue.id}/comments`, { comment: comment.trim() });
      setComments((s) => [...s, { ...res.data.data, user_name: user?.name }]);
      setComment('');
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  return (
    <Modal title={`${issue.issue_number} — ${issue.title}`} onClose={onClose} size="lg">
      <div className="kv" style={{ marginBottom: 14 }}>
        <dt>Project</dt><dd>{issue.project_name}{issue.wing_name ? ` · ${issue.wing_name}` : ''}{issue.location ? ` · ${issue.location}` : ''}</dd>
        <dt>Priority / Category</dt><dd><Badge value={issue.priority} /> {issue.category_name || '—'}</dd>
        <dt>Raised by</dt><dd>{issue.raised_by_name || '—'}{issue.latitude ? <> · <a href={`https://www.openstreetmap.org/?mlat=${issue.latitude}&mlon=${issue.longitude}#map=18/${issue.latitude}/${issue.longitude}`} target="_blank" rel="noreferrer">📍 GPS</a></> : null}</dd>
        <dt>Due date</dt><dd>{fmtDate(issue.due_date)}</dd>
        <dt>Description</dt><dd>{issue.description || '—'}</dd>
      </div>

      {(can('issues.edit') || issue.assigned_to === user?.id) && (
        <div className="card-pad" style={{ background: 'var(--bg)', borderRadius: 10, marginBottom: 14 }}>
          <div className="form-grid">
            <div className="field"><label>Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            {can('issues.edit') && (
              <div className="field"><label>Assigned to</label>
                <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— Unassigned —</option>
                  {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <button className="btn primary sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Update issue'}</button>
        </div>
      )}

      <h3>Discussion</h3>
      <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>
        {comments.length === 0 && <div className="empty" style={{ padding: 16 }}>No comments yet</div>}
        {comments.map((c: any) => (
          <div key={c.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.user_name || 'User'} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{new Date(c.created_at).toLocaleString()}</span></div>
            <div style={{ fontSize: 13 }}>{c.comment}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-sm">
        <input className="input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
        <button className="btn primary sm" onClick={addComment}>Send</button>
      </div>
    </Modal>
  );
}
