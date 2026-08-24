import React, { useState } from 'react';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { api, errMsg, downloadFile } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge, DataTable, Field, Modal, fmtDate, useToast } from '../components/ui';
import { useFetch } from '../hooks/useFetch';

export default function Quality({ tab }: { tab: 'tests' | 'inspections' }) {
  return tab === 'tests' ? <TestReports /> : <Inspections />;
}

/* ------------------------------ Test Reports ----------------------------- */
function TestReports() {
  const toast = useToast();
  const { can } = useAuth();
  const config: CrudConfig<any> = {
    title: 'Test Reports',
    singularLabel: 'Test Report',
    endpoint: '/test-reports',
    module: 'test_reports',
    createLabel: 'New Test Report',
    columns: [
      { key: 'test_number', label: 'Test No.', render: (r: any) => <span className="mono">{r.test_number}</span> },
      { key: 'test_type_name', label: 'Test' },
      { key: 'project_name', label: 'Project', render: (r: any) => <div>{r.project_name}<div className="muted" style={{ fontSize: 12 }}>{r.wing_name || ''}</div></div> },
      { key: 'material_name', label: 'Material' },
      { key: 'test_date', label: 'Test date', render: (r: any) => fmtDate(r.test_date) },
      { key: 'laboratory', label: 'Laboratory' },
      { key: 'result_status', label: 'Result', render: (r: any) => <Badge value={r.result_status === 'pass' ? 'pass' : r.result_status === 'fail' ? 'fail' : 'pending'} /> },
      statusColumn<any>(),
      {
        key: 'report_file_path', label: 'Report',
        render: (r: any) => (r.file_id ? <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); downloadFile(r.file_id, r.test_number).catch((e2) => toast.push(errMsg(e2), 'error')); }}>⬇ PDF</button> : '—'),
      },
    ],
    filters: [
      { key: 'result_status', label: 'Result', type: 'select', options: ['pending', 'pass', 'fail', 'inconclusive'].map((s) => ({ value: s, label: s })) },
      { key: 'testTypeId', label: 'Test type', type: 'select', optionsEndpoint: '/test-types', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    ],
    fields: () => [
      { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'wing_id', label: 'Wing', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'test_type_id', label: 'Test type', type: 'select', required: true, optionsEndpoint: '/test-types', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'material_id', label: 'Material (optional)', type: 'select', optionsEndpoint: '/materials', optionsParams: { limit: 500 }, optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'sample_date', label: 'Sample date', type: 'date' },
      { key: 'test_date', label: 'Test date', type: 'date' },
      { key: 'laboratory', label: 'Laboratory', type: 'text' },
      { key: 'standard_spec', label: 'Standard / spec', type: 'text' },
      { key: 'result_status', label: 'Result', type: 'select', options: ['pending', 'pass', 'fail', 'inconclusive'].map((s) => ({ value: s, label: s })) },
      { key: 'test_result', label: 'Test result / values', type: 'textarea', width: 'full' },
      { key: 'remarks', label: 'Remarks', type: 'text', width: 'full' },
    ],
    defaults: { result_status: 'pending' },
    extraActions: (row, reload) => (
      can('test_reports.approve') && row.status === 'submitted' ? (
        <>
          <button className="btn success sm" onClick={async (e) => { e.stopPropagation(); try { await api.put(`/test-reports/${row.id}/status`, { status: 'approved' }); toast.push('Approved'); reload(); } catch (err) { toast.push(errMsg(err), 'error'); } }}>Approve</button>
          <button className="btn danger sm" onClick={async (e) => { e.stopPropagation(); try { await api.put(`/test-reports/${row.id}/status`, { status: 'rejected' }); toast.push('Rejected'); reload(); } catch (err) { toast.push(errMsg(err), 'error'); } }}>Reject</button>
        </>
      ) : null
    ),
  };
  return <CrudPage config={config} />;
}

/* ------------------------------- Inspections ----------------------------- */
function Inspections() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [projectId, setProjectId] = useState('');
  const params: Record<string, any> = { page, limit: 15 };
  if (status) params.status = status;
  if (projectId) params.projectId = projectId;
  const { data, loading, reload } = useFetch<any>('/inspections', params);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Inspection Reports</h3>
        <div className="actions">
          {can('inspections.create') && <button className="btn primary sm" onClick={() => setCreateOpen(true)}>＋ New Inspection</button>}
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
            {['pending', 'passed', 'failed', 'reinspection_required', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        columns={[
          { key: 'inspection_number', label: 'No.', render: (r: any) => <span className="mono">{r.inspection_number}</span> },
          { key: 'inspection_type_name', label: 'Type', render: (r: any) => <Badge value="purple" label={r.inspection_type_name} /> },
          { key: 'project_name', label: 'Project', render: (r: any) => <div>{r.project_name}<div className="muted" style={{ fontSize: 12 }}>{[r.wing_name, r.location].filter(Boolean).join(' · ')}</div></div> },
          { key: 'inspection_date', label: 'Date', render: (r: any) => String(r.inspection_date || '').slice(0, 16).replace('T', ' ') },
          { key: 'inspector_name', label: 'Inspector' },
          { key: 'latitude', label: 'GPS', render: (r: any) => (r.latitude ? <a href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`} target="_blank" rel="noreferrer">📍</a> : '—') },
          { key: 'status', label: 'Status', render: (r: any) => <Badge value={r.status} /> },
          {
            key: '_actions', label: '', align: 'right',
            render: (r: any) => (can('inspections.approve') && ['pending', 'failed', 'reinspection_required'].includes(r.status) ? (
              <button className="btn outline sm" onClick={async () => { try { await api.put(`/inspections/${r.id}`, { status: 'closed' }); toast.push('Closed'); reload(); } catch (e) { toast.push(errMsg(e), 'error'); } }}>Close</button>
            ) : null),
          },
        ]}
      />
      {createOpen && <InspectionCreateModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} />}
    </div>
  );
}

function InspectionCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: types } = useFetch<any[]>('/inspection-types');
  const [form, setForm] = useState<Record<string, any>>({ inspection_date: new Date().toISOString().slice(0, 16) });
  const [checklist, setChecklist] = useState<{ label: string; result: string }[]>([{ label: '', result: 'pass' }]);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : {});
  const { data: users } = useFetch<any[]>('/auth/user-directory');

  const selectedType = (types || []).find((t: any) => t.id === Number(form.inspection_type_id));

  const captureGps = () => {
    setGpsBusy(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setForm((s) => ({ ...s, latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) })); setGpsBusy(false); },
      () => setGpsBusy(false),
      { timeout: 8000 }
    );
  };

  const save = async () => {
    if (!form.project_id || !form.inspection_type_id) { toast.push('Project and inspection type are required', 'error'); return; }
    setBusy(true);
    try {
      const items = checklist.filter((c) => c.label.trim()).map((c) => ({ checklist_item: c.label.trim(), result: c.result }));
      await api.post('/inspections', { ...form, items });
      toast.push('Inspection recorded');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="New Inspection" onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'inspection_type_id', label: 'Inspection type', type: 'select', required: true, options: (types || []).map((t: any) => ({ value: t.id, label: t.name })), hint: selectedType?.checklist_template ? `Checklist: ${selectedType.checklist_template.split(';').join(', ')}` : undefined }} value={form.inspection_type_id} onChange={(v) => setForm((s) => ({ ...s, inspection_type_id: v }))} />
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: (projects?.data || []).map((p: any) => ({ value: p.id, label: p.name })) }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v, wing_id: null }))} />
        <Field config={{ key: 'wing_id', label: 'Wing', type: 'select', options: (wings || []).map((w: any) => ({ value: w.id, label: w.name })) }} value={form.wing_id} onChange={(v) => setForm((s) => ({ ...s, wing_id: v }))} />
        <Field config={{ key: 'location', label: 'Location', type: 'text' }} value={form.location} onChange={(v) => setForm((s) => ({ ...s, location: v }))} />
        <Field config={{ key: 'inspector_id', label: 'Inspector', type: 'select', options: (users || []).map((u: any) => ({ value: u.id, label: u.name })) }} value={form.inspector_id} onChange={(v) => setForm((s) => ({ ...s, inspector_id: v }))} />
        <Field config={{ key: 'inspection_date', label: 'Date & time', type: 'datetime-local', required: true }} value={form.inspection_date} onChange={(v) => setForm((s) => ({ ...s, inspection_date: v }))} />
        <div className="field">
          <label>GPS</label>
          <button className="btn outline" type="button" onClick={captureGps}>
            {gpsBusy ? '…' : form.latitude ? `📍 ${form.latitude}, ${form.longitude}` : '📍 Capture GPS'}
          </button>
        </div>
        <Field config={{ key: 'status', label: 'Status', type: 'select', options: ['pending', 'passed', 'failed', 'reinspection_required', 'closed'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) }} value={form.status || 'pending'} onChange={(v) => setForm((s) => ({ ...s, status: v }))} />
        <div className="full"><Field config={{ key: 'observation', label: 'Observation', type: 'textarea' }} value={form.observation} onChange={(v) => setForm((s) => ({ ...s, observation: v }))} /></div>
        <div className="full"><Field config={{ key: 'remarks', label: 'Remarks', type: 'text' }} value={form.remarks} onChange={(v) => setForm((s) => ({ ...s, remarks: v }))} /></div>
        <div className="full">
          <div className="field"><label>Checklist items</label></div>
          {checklist.map((c, i) => (
            <div key={i} className="flex gap-sm" style={{ marginBottom: 8 }}>
              <input className="input" placeholder={`Checklist item #${i + 1}`} value={c.label} onChange={(e) => setChecklist((s) => s.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <select className="input" style={{ width: 110 }} value={c.result} onChange={(e) => setChecklist((s) => s.map((x, j) => j === i ? { ...x, result: e.target.value } : x))}>
                <option value="pass">Pass</option><option value="fail">Fail</option><option value="na">N/A</option><option value="pending">Pending</option>
              </select>
              <button className="btn outline sm" onClick={() => setChecklist((s) => s.length > 1 ? s.filter((_, j) => j !== i) : [{ label: '', result: 'pass' }])}>✕</button>
            </div>
          ))}
          <button className="btn outline sm" onClick={() => setChecklist((s) => [...s, { label: '', result: 'pass' }])}>＋ Add checklist item</button>
        </div>
      </div>
    </Modal>
  );
}
