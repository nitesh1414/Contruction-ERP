import React, { useState } from 'react';
import { api, errMsg, downloadFile, fileObjectUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { Badge, DataTable, Field, Modal, PaginationBar, useToast } from '../components/ui';

const CATEGORIES = ['architectural', 'structural', 'electrical', 'plumbing', 'hvac', 'fire_fighting', 'interior', 'other'];

export default function Drawings() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const params: Record<string, any> = { page, limit: 15 };
  if (category) params.category = category;
  if (projectId) params.projectId = projectId;
  if (search) params.search = search;
  const { data, loading, reload } = useFetch<any>('/drawings', params);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const openDetail = async (row: any) => {
    try {
      const res = await api.get(`/drawings/${row.id}`);
      setDetail(res.data.data);
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Drawings & Document Control</h3>
        <div className="actions">
          {can('drawings.upload') && <button className="btn primary sm" onClick={() => setCreateOpen(true)}>+ Upload Drawing</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="Drawing number or title…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="field">
          <label>Project</label>
          <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {(projects?.data || projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        onRowClick={openDetail}
        columns={[
          { key: 'drawing_number', label: 'Drawing No.', render: (d: any) => <span className="mono">{d.drawing_number}</span> },
          { key: 'title', label: 'Title', render: (d: any) => <div><div style={{ fontWeight: 600 }}>{d.title}</div><div className="muted" style={{ fontSize: 12 }}>{d.project_name}{d.wing_name ? ` · ${d.wing_name}` : ''}</div></div> },
          { key: 'category', label: 'Category', render: (d: any) => <Badge value="purple" label={d.category.replace(/_/g, ' ')} /> },
          { key: 'current_revision', label: 'Rev', render: (d: any) => <span className="badge blue">{d.current_revision || d.latest_revision || '—'}</span> },
          { key: 'approval_status', label: 'Status', render: (d: any) => <Badge value={d.approval_status} /> },
          { key: 'uploaded_by_name', label: 'Uploaded by' },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />

      {createOpen && <CreateDrawingModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} projects={projects?.data || projects || []} />}
      {detail && <DrawingDetailModal drawing={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload(); }} />}
    </div>
  );
}

function CreateDrawingModal({ onClose, onSaved, projects }: { onClose: () => void; onSaved: () => void; projects: any[] }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, any>>({ category: 'architectural', revision_no: 'R0' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : {});

  const save = async () => {
    if (!form.project_id || !form.drawing_number || !form.title) { toast.push('Project, drawing number and title are required', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
      if (file) fd.append('file', file);
      await api.post('/drawings', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.push('Drawing created');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Upload Drawing" onClose={onClose} size="lg"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: projects.map((p: any) => ({ value: p.id, label: p.name })) }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v, wing_id: null }))} />
        <Field config={{ key: 'wing_id', label: 'Wing (optional)', type: 'select', options: (wings || []).map((w: any) => ({ value: w.id, label: w.name })) }} value={form.wing_id} onChange={(v) => setForm((s) => ({ ...s, wing_id: v }))} />
        <Field config={{ key: 'drawing_number', label: 'Drawing number', type: 'text', required: true }} value={form.drawing_number} onChange={(v) => setForm((s) => ({ ...s, drawing_number: v }))} />
        <Field config={{ key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })) }} value={form.category} onChange={(v) => setForm((s) => ({ ...s, category: v }))} />
        <div className="full"><Field config={{ key: 'title', label: 'Title', type: 'text', required: true }} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} /></div>
        <Field config={{ key: 'revision_no', label: 'First revision no', type: 'text' }} value={form.revision_no} onChange={(v) => setForm((s) => ({ ...s, revision_no: v }))} />
        <Field config={{ key: 'revision_date', label: 'Revision date', type: 'date' }} value={form.revision_date} onChange={(v) => setForm((s) => ({ ...s, revision_date: v }))} />
        <div className="full">
          <div className="field">
            <label>File (PDF / image)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="full"><Field config={{ key: 'remarks', label: 'Remarks', type: 'text' }} value={form.remarks} onChange={(v) => setForm((s) => ({ ...s, remarks: v }))} /></div>
      </div>
    </Modal>
  );
}

function DrawingDetailModal({ drawing, onClose, onChanged }: { drawing: any; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [revForm, setRevForm] = useState({ revision_no: '', revision_date: new Date().toISOString().slice(0, 10), remarks: '' });
  const [revFile, setRevFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const uploadRevision = async () => {
    if (!revForm.revision_no) { toast.push('Revision number required', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('revision_no', revForm.revision_no);
      fd.append('revision_date', revForm.revision_date);
      fd.append('remarks', revForm.remarks);
      if (revFile) fd.append('file', revFile);
      await api.post(`/drawings/${drawing.id}/revisions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.push('Revision added — awaiting approval');
      onChanged();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const setStatus = async (rev: any, status: 'approved' | 'rejected') => {
    try {
      await api.put(`/drawings/revisions/${rev.id}/status`, { status });
      toast.push(`Revision ${status}`);
      onChanged();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  const preview = async (fileId: number) => {
    try {
      const url = await fileObjectUrl(fileId);
      setPreviewUrl(url);
    } catch { toast.push('Preview not available', 'error'); }
  };

  return (
    <Modal title={`${drawing.drawing_number} — ${drawing.title}`} onClose={onClose} size="xl">
      <div className="kv" style={{ marginBottom: 14 }}>
        <dt>Project</dt><dd>{drawing.project_name}{drawing.wing_name ? ` · ${drawing.wing_name}` : ''}</dd>
        <dt>Category</dt><dd>{drawing.category.replace(/_/g, ' ')}</dd>
        <dt>Status</dt><dd><Badge value={drawing.approval_status} /></dd>
        <dt>Latest revision</dt><dd><span className="badge blue">{drawing.latest_revision || '—'}</span></dd>
      </div>

      <h3>Revision History</h3>
      <DataTable
        rows={drawing.revisions || []}
        columns={[
          { key: 'revision_no', label: 'Rev', render: (r: any) => <strong>{r.revision_no}</strong> },
          { key: 'revision_date', label: 'Date', render: (r: any) => (r.revision_date ? String(r.revision_date).slice(0, 10) : '—') },
          { key: 'status', label: 'Status', render: (r: any) => <Badge value={r.status} /> },
          { key: 'uploaded_by_name', label: 'By' },
          {
            key: 'file', label: 'File',
            render: (r: any) => r.file_id ? (
              <div className="flex gap-sm">
                <button className="btn outline sm" onClick={() => preview(r.file_id)}>👁 Preview</button>
                <button className="btn outline sm" onClick={() => downloadFile(r.file_id, r.original_name || `rev-${r.revision_no}`)}>⬇</button>
              </div>
            ) : <span className="muted">—</span>,
          },
          {
            key: '_actions', label: '', align: 'right',
            render: (r: any) => (can('drawings.approve') && r.status === 'pending_approval' ? (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn success sm" onClick={() => setStatus(r, 'approved')}>Approve</button>
                <button className="btn danger sm" onClick={() => setStatus(r, 'rejected')}>Reject</button>
              </div>
            ) : null),
          },
        ]}
      />

      {can('drawings.upload') && (
        <div className="card-pad" style={{ background: 'var(--bg)', borderRadius: 10, marginTop: 14 }}>
          <h3>Add New Revision</h3>
          <div className="form-grid">
            <div className="field"><label>Revision no</label><input className="input" value={revForm.revision_no} onChange={(e) => setRevForm((s) => ({ ...s, revision_no: e.target.value }))} placeholder="R1, R2, A-1…" /></div>
            <div className="field"><label>Date</label><input className="input" type="date" value={revForm.revision_date} onChange={(e) => setRevForm((s) => ({ ...s, revision_date: e.target.value }))} /></div>
            <div className="field full" style={{ gridColumn: '1 / -1' }}><label>File (PDF / image)</label><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setRevFile(e.target.files?.[0] || null)} /></div>
            <div className="field full" style={{ gridColumn: '1 / -1' }}><label>Remarks</label><input className="input" value={revForm.remarks} onChange={(e) => setRevForm((s) => ({ ...s, remarks: e.target.value }))} placeholder="What changed in this revision?" /></div>
          </div>
          <button className="btn primary sm" onClick={uploadRevision} disabled={busy}>{busy ? 'Uploading…' : 'Upload revision'}</button>
        </div>
      )}

      {previewUrl && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
          <div className="modal xl" style={{ width: 'min(1100px, 96vw)' }}>
            <div className="modal-header"><h3>File preview</h3><button className="close" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>✕</button></div>
            <div className="modal-body" style={{ padding: 0, height: '75vh' }}>
              <iframe src={previewUrl} title="preview" style={{ width: '100%', height: '100%', border: 0 }} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
