import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api/client';
import { useFetch } from '../hooks/useFetch';
import { fmtDate, fmtMoney, Modal, PaginationBar, DataTable, ConfirmDialog, useToast, Field } from '../components/ui';
import type { ColumnConfig, FieldConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useDebounce } from '../hooks/useFetch';

const EQUIPMENT_TYPE_LABEL: Record<string, string> = {
  excavator: 'Excavator', crane: 'Crane', concrete_mixer: 'Concrete mixer',
  tower_crane: 'Tower crane', bulldozer: 'Bulldozer', loader: 'Loader',
  generator: 'Generator', compactor: 'Compactor', dumper: 'Dumper / tipper',
  scaffolding: 'Scaffolding', pump: 'Pump', other: 'Other equipment',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'Available', deployed: 'Deployed', maintenance: 'Maintenance',
  breakdown: 'Breakdown', idle: 'Idle',
};

const STATUS_TONE: Record<string, string> = {
  available: 'green', deployed: 'blue', maintenance: 'orange', breakdown: 'red', idle: 'orange',
};

const TYPE_OPTIONS = Object.keys(EQUIPMENT_TYPE_LABEL).map((v) => ({ value: v, label: EQUIPMENT_TYPE_LABEL[v] }));
const STATUS_OPTIONS = Object.keys(STATUS_LABEL).map((v) => ({ value: v, label: STATUS_LABEL[v] }));
const OWNERSHIP_OPTIONS = [
  { value: 'owned', label: 'Owned by company' },
  { value: 'rented', label: 'Rented' },
  { value: 'contractor_supplied', label: 'Contractor supplied' },
];

const FIELDS: FieldConfig[] = [
  { key: 'equipment_code', label: 'Equipment code', type: 'text', required: false, hint: 'Auto-generated if blank', placeholder: 'EQ-…' },
  { key: 'name', label: 'Equipment name', type: 'text', required: true, placeholder: 'e.g. Excavator 320D' },
  { key: 'equipment_type', label: 'Type', type: 'select', required: true, options: TYPE_OPTIONS },
  { key: 'ownership', label: 'Ownership', type: 'select', required: true, options: OWNERSHIP_OPTIONS },
  { key: 'project_id', label: 'Project ID', type: 'number', placeholder: 'Project numeric id' },
  { key: 'wing_id', label: 'Wing ID', type: 'number', placeholder: 'Wing numeric id' },
  { key: 'hourly_rate', label: 'Hourly rate (₹)', type: 'number', placeholder: '0.00' },
  { key: 'daily_rate',  label: 'Daily rate (₹)',  type: 'number', placeholder: '0.00' },
  { key: 'monthly_rate', label: 'Monthly rate (₹)', type: 'number', placeholder: '0.00' },
  { key: 'capacity', label: 'Capacity',  type: 'text', placeholder: 'e.g. 1.5 m³ bucket' },
  { key: 'registration_no', label: 'Registration / asset tag', type: 'text', placeholder: 'MH-04-XX-1234' },
  { key: 'operator_name', label: 'Operator', type: 'text', placeholder: 'Operator name' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'deployed_on', label: 'Deployed on', type: 'date' },
  { key: 'is_active', label: 'Active', type: 'checkbox' },
  { key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' },
];

function DashboardCards() {
  const { data, loading } = useFetch<any>('/equipment/summary');
  if (loading && !data) {
    return <div className="spinner-wrap"><div className="spinner" /><span>Loading equipment summary…</span></div>;
  }
  const fleet = data?.byStatus || [];
  const map: Record<string, number> = {};
  fleet.forEach((r: any) => { map[r.status] = Number(r.count); });
  const total = Object.values(map).reduce((s, c) => s + c, 0);
  const monthUsage = data?.monthUsage || {};
  const tiles = [
    { label: 'Total fleet', value: total, sub: `${map.deployed || 0} currently deployed`, color: '#fff0e6' },
    { label: 'Available', value: map.available || 0, sub: 'Ready to deploy', color: '#dcfcee' },
    { label: 'Deployed', value: map.deployed || 0, color: '#e8f3fb' },
    { label: 'Maintenance', value: map.maintenance || 0, color: '#fef3d8' },
    { label: 'Breakdown', value: map.breakdown || 0, color: '#fee8e8' },
    { label: 'Hours this month', value: +Number(monthUsage.running || 0).toFixed(1), sub: `${Number(monthUsage.fuel || 0).toFixed(0)} L fuel used` },
  ];
  return (
    <div className="stat-grid">
      {tiles.map((t) => (
        <div className="stat-card" key={t.label}>
          <div className="ic" style={{ background: t.color }}>🚜</div>
          <div style={{ minWidth: 0 }}>
            <div className="val">{t.value}</div>
            <div className="lbl">{t.label}</div>
            {t.sub && <div className="sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogForm({ equipmentId, projectId, onSaved }: { equipmentId: number; projectId: number; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    deployed_hours: 0, running_hours: 0, idle_hours: 0, breakdown_hours: 0, fuel_quantity: 0,
    work_done: '', remarks: '', status_after: 'deployed',
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post('/equipment/logs', { ...form, equipment_id: equipmentId, project_id: projectId });
      toast.push('Log saved');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setSaving(false); }
  };
  return (
    <div className="card card-pad" style={{ marginBottom: 12 }}>
      <div className="form-grid">
        <div className="field"><label>Date</label>
          <input className="input" type="date" value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} /></div>
        <div className="field"><label>Status after</label>
          <select className="input" value={form.status_after} onChange={(e) => setForm({ ...form, status_after: e.target.value })}>
            {Object.keys(STATUS_LABEL).map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
          </select></div>
        <div className="field"><label>Deployed hrs</label>
          <input className="input" type="number" step="0.1" value={form.deployed_hours} onChange={(e) => setForm({ ...form, deployed_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Running hrs</label>
          <input className="input" type="number" step="0.1" value={form.running_hours} onChange={(e) => setForm({ ...form, running_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Idle hrs</label>
          <input className="input" type="number" step="0.1" value={form.idle_hours} onChange={(e) => setForm({ ...form, idle_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Breakdown hrs</label>
          <input className="input" type="number" step="0.1" value={form.breakdown_hours} onChange={(e) => setForm({ ...form, breakdown_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Fuel (L)</label>
          <input className="input" type="number" step="0.1" value={form.fuel_quantity} onChange={(e) => setForm({ ...form, fuel_quantity: Number(e.target.value) })} /></div>
        <div className="field"><label>Operator</label>
          <input className="input" value={form.work_done} onChange={(e) => setForm({ ...form, work_done: e.target.value })} placeholder="operator name" /></div>
        <div className="field full"><label>Work done</label>
          <input className="input" value={form.work_done} onChange={(e) => setForm({ ...form, work_done: e.target.value })} /></div>
        <div className="field full"><label>Remarks</label>
          <textarea className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
      </div>
      <div className="flex gap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary sm" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save log'}</button>
      </div>
    </div>
  );
}

function EquipmentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast();
  const { data, loading, refetch } = useFetch<any>(`/equipment/${id}`);
  const [showLogForm, setShowLogForm] = useState(false);
  if (loading && !data) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (!data) return <div className="empty">Not found</div>;
  const logs = data.logs || [];
  const billing = data.billing || [];
  const generate = async () => {
    const month = prompt('Billing month (YYYY-MM):', new Date().toISOString().slice(0, 7)) || '';
    if (!/^\d{4}-\d{2}$/.test(month)) { toast.push('Bad month format', 'error'); return; }
    try {
      await api.post('/equipment/billing/generate', { equipment_id: id, billing_month: month });
      toast.push('Billing generated');
      refetch();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };
  return (
    <Modal title={`Equipment · ${data.name}`} onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Close</button><button className="btn primary" onClick={generate}>Generate monthly billing</button></>}>
      <div className="grid-12">
        <div className="card col-4 card-pad">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--brand-soft)', display: 'grid', placeItems: 'center', fontSize: 28 }}>🚜</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{data.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{data.equipment_code} · {EQUIPMENT_TYPE_LABEL[data.equipment_type] || data.equipment_type}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Status</dt><dd><span className={`badge ${STATUS_TONE[data.status]}`}>{STATUS_LABEL[data.status] || data.status}</span></dd>
            <dt>Ownership</dt><dd>{data.ownership}</dd>
            <dt>Project</dt><dd>{data.project_name || '—'}</dd>
            <dt>Wing</dt><dd>{data.wing_name || '—'}</dd>
            <dt>Hourly rate</dt><dd>{fmtMoney(data.hourly_rate)}</dd>
            <dt>Daily rate</dt><dd>{fmtMoney(data.daily_rate)}</dd>
            <dt>Monthly rate</dt><dd>{fmtMoney(data.monthly_rate)}</dd>
            <dt>Capacity</dt><dd>{data.capacity || '—'}</dd>
            <dt>Registration</dt><dd>{data.registration_no || '—'}</dd>
            <dt>Operator</dt><dd>{data.operator_name || '—'}</dd>
            <dt>Deployed on</dt><dd>{fmtDate(data.deployed_on)}</dd>
            <dt>Active</dt><dd>{data.is_active ? 'Yes' : 'No'}</dd>
          </dl>
        </div>
        <div className="card col-8">
          <div className="card-header">
            <h3>Daily logs</h3>
            <div className="actions">
              <button className="btn primary sm" onClick={() => setShowLogForm(!showLogForm)}>+ Daily log</button>
              <button className="btn outline sm" onClick={refetch}>Refresh</button>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 0 }}>
            {showLogForm && <LogForm equipmentId={id} projectId={data.project_id} onSaved={() => { setShowLogForm(false); refetch(); }} />}
          </div>
          {logs.length === 0 ? (
            <div className="empty">
              <div className="big">📝</div>
              No daily log entries yet — add the first one from above.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Deployed</th><th>Running</th><th>Idle</th><th>Breakdown</th><th>Fuel (L)</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id}>
                      <td>{fmtDate(l.log_date)}</td>
                      <td className="num">{Number(l.deployed_hours || 0).toFixed(1)}</td>
                      <td className="num">{Number(l.running_hours || 0).toFixed(1)}</td>
                      <td className="num">{Number(l.idle_hours || 0).toFixed(1)}</td>
                      <td className="num">{Number(l.breakdown_hours || 0).toFixed(1)}</td>
                      <td className="num">{Number(l.fuel_quantity || 0).toFixed(1)}</td>
                      <td><span className={`badge ${STATUS_TONE[l.status_after] || 'blue'}`}>{STATUS_LABEL[l.status_after] || l.status_after}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--ink-2)', maxWidth: 240 }}>{l.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card col-12">
          <div className="card-header"><h3>Hire billing</h3></div>
          {billing.length === 0 ? <div className="empty">No hire bills generated yet.</div> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Month</th><th>Hours</th><th>Rate</th><th className="right">Total</th><th>Status</th><th className="right">Paid</th></tr>
                </thead>
                <tbody>
                  {billing.map((b: any) => (
                    <tr key={b.id}>
                      <td>{b.billing_month}</td>
                      <td className="num">{Number(b.total_hours).toFixed(1)}</td>
                      <td className="num">{fmtMoney(b.hourly_rate)}</td>
                      <td className="num right">{fmtMoney(b.total_amount)}</td>
                      <td><span className={`badge ${b.payment_status === 'paid' ? 'green' : b.payment_status === 'partial' ? 'orange' : 'red'}`}>{b.payment_status}</span></td>
                      <td className="num right">{fmtMoney(b.paid_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Equipment() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const debouncedSearch = useDebounce(search);

  const params = useMemo(() => ({
    page, limit: 20,
    search: debouncedSearch,
    ...Object.fromEntries(Object.entries(filterValues).filter(([_, v]) => v !== '' && v != null)),
  }), [page, debouncedSearch, filterValues]);

  const { data, loading, reload } = useFetch<any>('/equipment', params);
  const rows = data?.data || [];
  const total = data?.pagination?.total ?? 0;

  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const openNew = () => { setForm({}); setEditItem('new'); };
  const openEdit = (item: any) => { setForm({ ...item }); setEditItem(item); };

  const save = async () => {
    setSaving(true);
    try {
      if (editItem === 'new') { await api.post('/equipment', form); toast.push('Equipment created'); }
      else { await api.put(`/equipment/${editItem.id}`, form); toast.push('Equipment saved'); }
      setEditItem(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setSaving(false); }
  };
  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/equipment/${deleting.id}`);
      toast.push('Deleted');
      setDeleting(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setDeleteBusy(false); }
  };

  const columns: ColumnConfig<any>[] = [
    { key: 'equipment_code', label: 'Code', width: 110 },
    { key: 'name', label: 'Equipment', render: (r: any) => <div style={{ fontWeight: 650 }}>{r.name}</div> },
    { key: 'equipment_type', label: 'Type', render: (r: any) => EQUIPMENT_TYPE_LABEL[r.equipment_type] || r.equipment_type },
    { key: 'ownership', label: 'Ownership' },
    { key: 'project_name', label: 'Project', render: (r: any) => r.project_name || '—' },
    { key: 'hourly_rate', label: 'Hourly', render: (r: any) => <span className="num">{fmtMoney(r.hourly_rate)}</span>, width: 100 },
    { key: 'status', label: 'Status', render: (r: any) => (
      <span className={`badge ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
    ) },
    { key: 'last_log_date', label: 'Last log', render: (r: any) => r.last_log_date ? fmtDate(r.last_log_date) : '—' },
    { key: '_actions', label: '', align: 'right',
      render: (row: any) => (
        <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
          <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); setDetailId(row.id); }}>Open</button>
          {can('projects.edit') && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</button>}
          {can('projects.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>Delete</button>}
        </div>
      ) },
  ];

  return (
    <>
      <DashboardCards />

      <div className="card">
        <div className="card-header">
          <h3>Equipment fleet</h3>
          <div className="actions muted" style={{ fontSize: 12 }}>Heavy machinery & site equipment</div>
          {can('projects.create') && <button className="btn primary sm" onClick={openNew} style={{ marginLeft: 'auto' }}>+ Add equipment</button>}
        </div>
        <div className="filter-bar">
          <div className="field grow">
            <label>Search</label>
            <input className="input" placeholder="Search by code, name, operator…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" value={filterValues.status || ''} onChange={(e) => { setFilterValues((s) => ({ ...s, status: e.target.value })); setPage(1); }}>
              <option value="">All</option>
              {Object.keys(STATUS_LABEL).map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" value={filterValues.equipment_type || ''} onChange={(e) => { setFilterValues((s) => ({ ...s, equipment_type: e.target.value })); setPage(1); }}>
              <option value="">All</option>
              {Object.keys(EQUIPMENT_TYPE_LABEL).map((v) => <option key={v} value={v}>{EQUIPMENT_TYPE_LABEL[v]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Ownership</label>
            <select className="input" value={filterValues.ownership || ''} onChange={(e) => { setFilterValues((s) => ({ ...s, ownership: e.target.value })); setPage(1); }}>
              <option value="">All</option>
              {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} rowKey="id" onRowClick={(r) => setDetailId(r.id)} />
        <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
      </div>

      {detailId !== null && (
        <EquipmentDetail id={detailId} onClose={() => { setDetailId(null); reload(); }} />
      )}

      {editItem !== null && (
        <Modal title={`${editItem === 'new' ? 'New' : 'Edit'} equipment`} onClose={() => setEditItem(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEditItem(null)} disabled={saving}>Cancel</button>
                  <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <div key={f.key} style={{ gridColumn: f.width === 'full' ? '1 / -1' : 'auto' }}>
                <Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete equipment "${deleting.name}"? It must not have any log entries.`}
          onCancel={() => setDeleting(null)}
          onConfirm={doDelete}
          busy={deleteBusy}
        />
      )}

      <div className="card">
        <div className="card-header"><h3>How to use this module</h3></div>
        <div className="card-pad">
          <div className="grid-3">
            <div>
              <h4 style={{ marginBottom: 4 }}>What this tracks</h4>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                Rented and company-owned machinery on site — deployed vs running hours, idle and breakdown time,
                fuel usage, hire billing rates.
              </p>
            </div>
            <div>
              <h4 style={{ marginBottom: 4 }}>Workflow</h4>
              <ol style={{ paddingLeft: 18, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.7 }}>
                <li>Add equipment record & assign to a project</li>
                <li>Operators / engineers log daily hours</li>
                <li>Status flips automatically as work logs come in</li>
                <li>End of month — generate hire billing</li>
              </ol>
            </div>
            <div>
              <h4 style={{ marginBottom: 4 }}>Rates</h4>
              <ul style={{ paddingLeft: 18, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.7 }}>
                <li><strong>Hourly rate</strong> drives monthly billing</li>
                <li>Daily / monthly kept for reference</li>
                <li>Costs to the project automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
