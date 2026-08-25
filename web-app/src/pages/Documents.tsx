import React, { useState } from 'react';
import { api, errMsg, downloadFile } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, ConfirmDialog, DataTable, Field, Modal, fmtDate, useToast,
} from '../components/ui';

const CATEGORIES = ['agreement', 'certificate', 'approval', 'noc', 'project_image', 'demo_image', 'site_photo', 'client_document', 'government_document', 'other'];

export default function Documents() {
  const toast = useToast();
  const { can } = useAuth();
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const params: Record<string, any> = { limit: 60 };
  if (category) params.category = category;
  if (projectId) params.projectId = projectId;
  if (search) params.search = search;
  const { data, loading, reload } = useFetch<any>('/documents', params);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Project Documents</h3>
        <div className="actions">
          {can('documents.upload') && <button className="btn primary sm" onClick={() => setOpen(true)}>+ Upload Document</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="Title, number, description…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="field"><label>Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All</option>
            {(projects?.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        columns={[
          { key: 'title', label: 'Document', render: (d: any) => <div style={{ maxWidth: 280 }}><div style={{ fontWeight: 600 }}>{d.title}</div><div className="muted" style={{ fontSize: 12 }}>{d.project_name}{d.wing_name ? ` · ${d.wing_name}` : ''}</div></div> },
          { key: 'category', label: 'Category', render: (d: any) => <Badge value="purple" label={d.category.replace(/_/g, ' ')} /> },
          { key: 'document_number', label: 'Doc No', render: (d: any) => <span className="mono">{d.document_number || '—'}</span> },
          { key: 'version', label: 'Ver' },
          { key: 'expiry_date', label: 'Expiry', render: (d: any) => (d.expiry_date ? <span style={{ color: new Date(d.expiry_date) < new Date(Date.now() + 30 * 86400000) ? 'var(--warning)' : undefined }}>{fmtDate(d.expiry_date)}</span> : '—') },
          { key: 'original_name', label: 'File', render: (d: any) => d.original_name ? <span style={{ fontSize: 12 }} className="muted">{d.original_name}</span> : '—' },
          { key: 'uploaded_by_name', label: 'Uploaded by' },
          {
            key: '_actions', label: '', align: 'right',
            render: (d: any) => (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                {d.file_id && <button className="btn outline sm" onClick={() => downloadFile(d.file_id, d.original_name).catch((e) => toast.push(errMsg(e), 'error'))}>⬇ Download</button>}
                {can('documents.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(d)}>Delete</button>}
              </div>
            ),
          },
        ]}
      />
      {open && <DocumentUploadModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {deleting && (
        <ConfirmDialog
          message={`Delete document "${deleting.title}"?`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.delete(`/documents/${deleting.id}`); toast.push('Deleted'); setDeleting(null); reload(); }
            catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
          }} />
      )}
    </div>
  );
}

function DocumentUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const [form, setForm] = useState<Record<string, any>>({ category: 'other' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : {});

  const save = async () => {
    if (!form.project_id || !form.title) { toast.push('Project and title are required', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
      if (file) fd.append('file', file);
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.push('Document uploaded');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Upload Document" onClose={onClose} size="lg"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: (projects?.data || []).map((p: any) => ({ value: p.id, label: p.name })) }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v, wing_id: null }))} />
        <Field config={{ key: 'wing_id', label: 'Wing (optional)', type: 'select', options: (wings || []).map((w: any) => ({ value: w.id, label: w.name })) }} value={form.wing_id} onChange={(v) => setForm((s) => ({ ...s, wing_id: v }))} />
        <div className="full"><Field config={{ key: 'title', label: 'Document title', type: 'text', required: true }} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} /></div>
        <Field config={{ key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })) }} value={form.category} onChange={(v) => setForm((s) => ({ ...s, category: v }))} />
        <Field config={{ key: 'document_number', label: 'Document number', type: 'text' }} value={form.document_number} onChange={(v) => setForm((s) => ({ ...s, document_number: v }))} />
        <Field config={{ key: 'version', label: 'Version', type: 'text' }} value={form.version} onChange={(v) => setForm((s) => ({ ...s, version: v }))} />
        <Field config={{ key: 'expiry_date', label: 'Expiry date (if any)', type: 'date' }} value={form.expiry_date} onChange={(v) => setForm((s) => ({ ...s, expiry_date: v }))} />
        <div className="full"><Field config={{ key: 'description', label: 'Description', type: 'text' }} value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></div>
        <div className="full">
          <div className="field">
            <label>File (PDF / image / Office)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
