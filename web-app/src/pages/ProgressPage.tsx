import React, { useEffect, useMemo, useState } from 'react';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getBrowserLocation, useFetch } from '../hooks/useFetch';
import {
  Badge, ConfirmDialog, DataTable, Field, Modal, PaginationBar, fmtDate, useToast,
} from '../components/ui';
import type { ProgressEntry } from '../api/types';

interface PhotoItem { file: File; preview: string; }

export default function ProgressPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [projectId, setProjectId] = useState<number | ''>('');
  const [wingId, setWingId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params: Record<string, any> = { page, limit: 15 };
  if (projectId) params.projectId = projectId;
  if (wingId) params.wingId = wingId;
  if (search) params.search = search;
  const { data, loading, reload } = useFetch<any>('/progress', params);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: wings } = useFetch<any>('/wings', projectId ? { projectId } : undefined as any);

  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ProgressEntry | null>(null);

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Daily Progress Reports</h3>
          <div className="actions">
            {can('progress.export') && <ExportButton />}
            {can('progress.create') && <button className="btn primary sm" onClick={() => setOpen(true)}>＋ New Report</button>}
          </div>
        </div>
        <div className="filter-bar">
          <div className="field grow"><label>Search</label><input className="input" placeholder="Search descriptions…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
          <div className="field">
            <label>Project</label>
            <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value === '' ? '' : Number(e.target.value)); setWingId(''); setPage(1); }}>
              <option value="">All projects</option>
              {(projects?.data || projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Wing</label>
            <select className="input" value={wingId} onChange={(e) => { setWingId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1); }}>
              <option value="">All wings</option>
              {(wings || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
        <DataTable<ProgressEntry>
          loading={loading}
          columns={[
            { key: 'report_date', label: 'Date', render: (r) => fmtDate(r.report_date) },
            {
              key: 'work_description', label: 'Work',
              render: (r) => (
                <div style={{ maxWidth: 320 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work_description || '—'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{[r.project_name, r.wing_name, r.floor_name].filter(Boolean).join(' · ')}</div>
                </div>
              ),
            },
            { key: 'percentage', label: 'Progress', align: 'right', render: (r) => <span className="badge green">{Number(r.percentage)}%</span> },
            { key: 'labour_count', label: 'Labour', align: 'right' },
            { key: 'photos', label: 'Photos', align: 'right', render: (r) => (r.photos?.length ? <Badge value="info" label={`${r.photos.length} 📷`} /> : <span className="muted">—</span>) },
            { key: 'latitude', label: 'GPS', render: (r) => (r.latitude && r.longitude ? <a href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`} target="_blank" rel="noreferrer">📍 map</a> : <span className="muted">—</span>) },
            { key: 'created_by_name', label: 'By' },
          ]}
          rows={data?.data || []}
          onRowClick={(row) => setDetail(row)}
        />
        <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />
      </div>

      {open && <ProgressFormModal projects={projects?.data || projects || []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {detail && <ProgressDetailModal row={detail} onClose={() => setDetail(null)} onDeleted={() => { setDetail(null); reload(); }} />}
    </>
  );
}

function ExportButton() {
  const toast = useToast();
  return (
    <button className="btn outline sm" onClick={async () => {
      try {
        const { downloadExport } = await import('../api/client');
        await downloadExport('/progress/export', 'daily-progress.csv');
      } catch (e) { toast.push(errMsg(e), 'error'); }
    }}>⬇ Export</button>
  );
}

function ProgressFormModal({ projects, onClose, onSaved }: { projects: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, any>>({ percentage: 40, labour_count: 10, report_date: new Date().toISOString().slice(0, 10) });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : { projectId: undefined });
  const { data: floors } = useFetch<any>('/floors', form.wing_id ? { wingId: form.wing_id } : { wingId: undefined });
  const [duplicateInfo, setDuplicateInfo] = useState('');

  // offline queue fallback key
  const OFFLINE_KEY = 'cerp.offlineProgress';

  useEffect(() => { void captureGps(); }, []);

  const captureGps = async () => {
    setGpsBusy(true);
    const loc = await getBrowserLocation();
    setGps(loc);
    setGpsBusy(false);
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= 8) break;
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setPhotos(next);
  };

  const save = async () => {
    if (!form.project_id || !form.report_date) { toast.push('Project and date are required', 'error'); return; }
    setSaving(true);
    const clientRef = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const fd = new FormData();
    const payload = { ...form, client_ref: clientRef, ...(gps ? { latitude: gps.latitude, longitude: gps.longitude } : {}) };
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
    }
    const meta = photos.map(() => ({ latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null, captured_at: new Date().toISOString(), source: 'upload' }));
    fd.append('photosMeta', JSON.stringify(meta));
    photos.forEach((p) => fd.append('photos', p.file));

    try {
      await api.post('/progress', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.push('Progress report saved');
      onSaved();
    } catch (e) {
      if (!navigator.onLine || (e as any)?.message === 'Network Error') {
        // queue offline
        const q = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
        q.push({ payload, queuedAt: new Date().toISOString() });
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
        toast.push('You are offline — report queued and will sync when online', 'info');
        onSaved();
      } else {
        toast.push(errMsg(e), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  void duplicateInfo;
  return (
    <Modal title="New Daily Progress Report" onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Report'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', options: projects.map((p: any) => ({ value: p.id, label: p.name })), required: true }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v, wing_id: null, floor_id: null }))} />
        <Field config={{ key: 'wing_id', label: 'Wing', type: 'select', options: (wings || []).map((w: any) => ({ value: w.id, label: w.name })) }} value={form.wing_id} onChange={(v) => setForm((s) => ({ ...s, wing_id: v, floor_id: null }))} />
        <Field config={{ key: 'floor_id', label: 'Floor / location', type: 'select', options: (floors || []).map((f: any) => ({ value: f.id, label: `${f.name}${f.wing_name ? ` (${f.wing_name})` : ''}` })) }} value={form.floor_id} onChange={(v) => setForm((s) => ({ ...s, floor_id: v }))} />
        <div className="flex gap-sm" style={{ alignItems: 'flex-end', marginBottom: 13 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <Field config={{ key: 'report_date', label: 'Date', type: 'date', required: true }} value={form.report_date} onChange={(v) => setForm((s) => ({ ...s, report_date: v }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>GPS location</label>
            <button className="btn outline" type="button" onClick={captureGps} disabled={gpsBusy}>
              {gpsBusy ? 'Locating…' : gps ? `📍 ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : '📍 Capture GPS'}
            </button>
          </div>
        </div>
        <Field config={{ key: 'work_time', label: 'Time', type: 'time' }} value={form.work_time} onChange={(v) => setForm((s) => ({ ...s, work_time: v }))} />
        <Field config={{ key: 'percentage', label: 'Overall progress %', type: 'number', required: true }} value={form.percentage} onChange={(v) => setForm((s) => ({ ...s, percentage: v }))} />
        <Field config={{ key: 'labour_count', label: 'Labour count', type: 'number' }} value={form.labour_count} onChange={(v) => setForm((s) => ({ ...s, labour_count: v }))} />
        <Field config={{ key: 'weather', label: 'Weather', type: 'select', options: ['Clear', 'Cloudy', 'Rainy', 'Hot', 'Cold'].map((s) => ({ value: s, label: s })) }} value={form.weather} onChange={(v) => setForm((s) => ({ ...s, weather: v }))} />
        <div className="full"><Field config={{ key: 'work_description', label: 'Work description', type: 'textarea', required: true }} value={form.work_description} onChange={(v) => setForm((s) => ({ ...s, work_description: v }))} /></div>
        <div className="full"><Field config={{ key: 'work_completed', label: 'Work completed today', type: 'textarea' }} value={form.work_completed} onChange={(v) => setForm((s) => ({ ...s, work_completed: v }))} /></div>
        <div className="full"><Field config={{ key: 'material_used', label: 'Material used', type: 'text' }} value={form.material_used} onChange={(v) => setForm((s) => ({ ...s, material_used: v }))} /></div>
        <div className="full"><Field config={{ key: 'remarks', label: 'Remarks', type: 'text' }} value={form.remarks} onChange={(v) => setForm((s) => ({ ...s, remarks: v }))} /></div>
        <div className="full">
          <div className="field">
            <label>Site photos (up to 8) — GPS & timestamp are attached to every photo</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addPhotos(e.target.files)} />
          </div>
          {!!photos.length && (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div className="ph" key={i}>
                  <img src={p.preview} alt="" />
                  <div className="meta">
                    {gps ? `📍 ${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : 'no GPS'}<br />
                    {new Date().toLocaleDateString()}
                    <button type="button" style={{ position: 'absolute', top: 4, right: 4 }} className="btn danger sm" onClick={() => setPhotos((s) => s.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProgressDetailModal({ row, onClose, onDeleted }: { row: ProgressEntry; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const photoUrl = (p: any) => p.file_id ? null : null; // images load through <PhotoImg/>

  void photoUrl;
  return (
    <Modal title={`Progress Report — ${fmtDate(row.report_date)}`} onClose={onClose} size="lg"
      footer={can('progress.delete') ? <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete report</button> : undefined}>
      <div className="kv" style={{ marginBottom: 12 }}>
        <dt>Project</dt><dd>{row.project_name}{row.wing_name ? ` · ${row.wing_name}` : ''}{row.floor_name ? ` · ${row.floor_name}` : ''}</dd>
        <dt>Progress</dt><dd><span className="badge green">{Number(row.percentage)}%</span></dd>
        <dt>Labour</dt><dd>{row.labour_count}</dd>
        <dt>Weather</dt><dd>{row.weather || '—'}</dd>
        <dt>GPS</dt><dd>{row.latitude && row.longitude ? <a href={`https://www.openstreetmap.org/?mlat=${row.latitude}&mlon=${row.longitude}#map=18/${row.latitude}/${row.longitude}`} target="_blank" rel="noreferrer">📍 {row.latitude}, {row.longitude}</a> : '—'}</dd>
        <dt>Reported by</dt><dd>{row.created_by_name || '—'}</dd>
        <dt>Description</dt><dd>{row.work_description || '—'}</dd>
        <dt>Completed</dt><dd>{row.work_completed || '—'}</dd>
        <dt>Material used</dt><dd>{row.material_used || '—'}</dd>
        <dt>Remarks</dt><dd>{row.remarks || '—'}</dd>
      </div>
      {!!row.photos?.length && (
        <>
          <h3>Site Photos</h3>
          <div className="photo-grid">
            {row.photos.map((p) => <PhotoImg key={p.id} photo={p} />)}
          </div>
        </>
      )}
      {confirmDel && (
        <ConfirmDialog
          message="Delete this progress report?"
          busy={busy}
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.delete(`/progress/${row.id}`); toast.push('Deleted'); onDeleted(); }
            catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
          }} />
      )}
    </Modal>
  );
}

function PhotoImg({ photo }: { photo: any }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    if (photo.file_id) {
      import('../api/client').then(async ({ fileObjectUrl }) => {
        try { revoke = await fileObjectUrl(photo.file_id); setSrc(revoke); } catch { /* ignore */ }
      });
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [photo.file_id]);
  return (
    <div className="ph">
      {src && <img src={src} alt="" />}
      <div className="meta">
        {photo.source === 'camera' ? '📷 app camera' : '🖼 uploaded'}<br />
        {photo.latitude && photo.longitude ? `📍 ${Number(photo.latitude).toFixed(4)}, ${Number(photo.longitude).toFixed(4)}` : ''}
      </div>
    </div>
  );
}
