import React, { useMemo, useState } from 'react';
import CrudPage, { CrudConfig } from '../components/CrudPage';
import { api, errMsg, downloadExport } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, DataTable, Field, Modal, PaginationBar, StatCard, fmtDate, fmtMoney, useToast,
} from '../components/ui';

export default function Workforce() {
  const [tab, setTab] = useState<'workers' | 'attendance' | 'payments'>('attendance');
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tabs" style={{ padding: '0 10px' }}>
          <button className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>Attendance</button>
          <button className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}>Workers</button>
          <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Labour Payments</button>
        </div>
      </div>
      {tab === 'workers' && <WorkersTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'payments' && <PaymentsTab />}
    </>
  );
}

/* --------------------------------- Workers ------------------------------- */
const workersConfig: CrudConfig<any> = {
  title: 'Workers',
  singularLabel: 'Worker',
  endpoint: '/workers',
  module: 'workers',
  columns: [
    { key: 'worker_code', label: 'Code', render: (w: any) => <span className="mono">{w.worker_code}</span> },
    { key: 'name', label: 'Name', render: (w: any) => <strong>{w.name}</strong> },
    { key: 'category_name', label: 'Category' },
    { key: 'contractor_name', label: 'Contractor' },
    { key: 'phone', label: 'Mobile' },
    { key: 'daily_wage', label: 'Daily wage', align: 'right', render: (w: any) => `₹${Number(w.daily_wage)}` },
    { key: 'overtime_rate', label: 'OT/hr', align: 'right', render: (w: any) => `₹${Number(w.overtime_rate)}` },
    { key: 'project_name', label: 'Project' },
    { key: 'is_active', label: 'Status', render: (w: any) => <Badge value={w.is_active ? 'completed' : 'cancelled'} label={w.is_active ? 'Active' : 'Inactive'} /> },
  ],
  filters: [
    { key: 'projectId', label: 'Project', type: 'select', optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'categoryId', label: 'Category', type: 'select', optionsEndpoint: '/worker-categories', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
  ],
  fields: () => [
    { key: 'name', label: 'Worker name', type: 'text', required: true },
    { key: 'worker_code', label: 'Worker code (auto if blank)', type: 'text' },
    { key: 'phone', label: 'Mobile', type: 'text' },
    { key: 'category_id', label: 'Category', type: 'select', optionsEndpoint: '/worker-categories', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'contractor_id', label: 'Contractor', type: 'select', optionsEndpoint: '/contractors', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'daily_wage', label: 'Daily wage (₹)', type: 'number' },
    { key: 'overtime_rate', label: 'Overtime rate (₹/hr)', type: 'number' },
    { key: 'project_id', label: 'Project', type: 'select', optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'wing_id', label: 'Wing', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'joining_date', label: 'Joining date', type: 'date' },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
    { key: 'id_proof', label: 'ID proof (Aadhaar etc.)', type: 'text' },
  ],
  defaults: { is_active: true },
};

function WorkersTab() {
  return <CrudPage config={workersConfig} />;
}

/* ------------------------------- Attendance ------------------------------ */
function AttendanceTab() {
  const toast = useToast();
  const { can } = useAuth();
  const [projectId, setProjectId] = useState<number | ''>('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: workers, reload } = useFetch<any>('/workers', projectId ? { projectId, is_active: 1, limit: 500 } : { limit: 0 });
  const { data: attendanceData, reload: reloadAttendance } = useFetch<any>('/attendance', projectId ? { projectId, date, limit: 500 } : { limit: 0 });
  const { data: summary } = useFetch<any>(projectId ? `/attendance/summary?projectId=${projectId}&date=${date}` : null);
  const [marks, setMarks] = useState<Record<number, { status: string; overtime_hours: number }>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    const map: Record<number, { status: string; overtime_hours: number }> = {};
    (attendanceData?.data || []).forEach((a: any) => { map[a.worker_id] = { status: a.status, overtime_hours: Number(a.overtime_hours) }; });
    setMarks(map);
  }, [attendanceData]);

  const totalPay = useMemo(() => (attendanceData?.data || []).reduce((s: number, a: any) => s + Number(a.daily_amount) + Number(a.overtime_amount), 0), [attendanceData]);

  const saveAll = async () => {
    const records = Object.entries(marks).map(([workerId, m]) => ({ worker_id: Number(workerId), status: m.status, overtime_hours: m.overtime_hours }));
    if (!records.length) { toast.push('Nothing to save', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.post('/attendance', { project_id: projectId, date, records });
      toast.push(res.data.message || 'Attendance saved');
      reloadAttendance();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setSaving(false); }
  };

  const markAll = (status: string) => {
    const map: any = {};
    (workers?.data || []).forEach((w: any) => { map[w.id] = { status, overtime_hours: 0 }; });
    setMarks(map);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Daily Attendance</h3>
        <div className="actions">
          {can('attendance.export') && (
            <button className="btn outline sm" onClick={async () => { try { await downloadExport(`/attendance/export${projectId ? `?projectId=${projectId}` : ''}`, 'attendance.csv'); } catch (e) { toast.push(errMsg(e), 'error'); } }}>⬇ Export</button>
          )}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field"><label>Project</label>
          <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value ? Number(e.target.value) : ''); setMarks({}); }}>
            <option value="">Select project…</option>
            {(projects?.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {summary && (
          <div className="flex gap-sm" style={{ paddingBottom: 2 }}>
            {(summary.byStatus || []).map((s: any) => <Badge key={s.status} value={s.status} label={`${s.count} ${s.status.replace('_', ' ')}`} />)}
            {attendanceData && <Badge value="purple" label={`pay roll ${fmtMoney(totalPay)}`} />}
          </div>
        )}
      </div>

      {!projectId ? (
        <div className="empty"><div className="big">👷</div>Select a project to mark attendance</div>
      ) : (
        <>
          <div className="filter-bar" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span className="muted" style={{ fontSize: 12, marginRight: 'auto' }}>Quick mark:</span>
            <button className="btn outline sm" onClick={() => markAll('present')}>All present</button>
            <button className="btn outline sm" onClick={() => markAll('absent')}>All absent</button>
            {can('attendance.create') && <button className="btn primary sm" onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : `Save attendance (${Object.keys(marks).length})`}</button>}
          </div>
          <DataTable
            rows={workers?.data || []}
            columns={[
              { key: 'worker_code', label: 'Code', render: (w: any) => <span className="mono">{w.worker_code}</span> },
              { key: 'name', label: 'Worker', render: (w: any) => <div><strong>{w.name}</strong><div className="muted" style={{ fontSize: 12 }}>{w.category_name} · ₹{w.daily_wage}/day</div></div> },
              {
                key: '_status', label: 'Status',
                render: (w: any) => (
                  <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                    {['present', 'absent', 'half_day', 'leave', 'overtime'].map((s) => (
                      <button
                        key={s}
                        className={`btn sm ${marks[w.id]?.status === s ? 'primary' : 'outline'}`}
                        style={{ padding: '4px 9px', fontSize: 12 }}
                        onClick={() => setMarks((m) => ({ ...m, [w.id]: { ...(m[w.id] || { overtime_hours: 0 }), status: s } }))}
                      >
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                ),
              },
              {
                key: '_ot', label: 'OT hrs',
                render: (w: any) => (
                  <input
                    className="input" type="number" style={{ width: 74 }}
                    value={marks[w.id]?.overtime_hours ?? 0}
                    onChange={(e) => setMarks((m) => ({ ...m, [w.id]: { status: m[w.id]?.status || 'present', overtime_hours: Number(e.target.value) || 0 } }))}
                  />
                ),
              },
              {
                key: '_pay', label: 'Day pay', align: 'right',
                render: (w: any) => {
                  const st = marks[w.id]?.status;
                  const daily = st === 'present' || st === 'overtime' ? w.daily_wage : st === 'half_day' ? w.daily_wage / 2 : 0;
                  const ot = (marks[w.id]?.overtime_hours || 0) * (w.overtime_rate || 0);
                  return st ? <strong>₹{(daily + ot).toLocaleString('en-IN')}</strong> : <span className="muted">—</span>;
                },
              },
            ]}
            emptyMessage="No active workers assigned to this project. Add workers first."
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------- Payments ------------------------------- */
function PaymentsTab() {
  const toast = useToast();
  const { can } = useAuth();
  const [projectId, setProjectId] = useState<number | ''>('');
  const { data, reload } = useFetch<any[]>('/labour-payments', projectId ? { projectId } : {});
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: workers } = useFetch<any>('/workers', projectId ? { projectId, limit: 500 } : { limit: 0 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const pendingTotal = (data || []).reduce((s: number, p: any) => s + (Number(p.net_amount) - Number(p.paid_amount)), 0);

  const generate = async () => {
    if (!form.worker_id || !form.period_start || !form.period_end || !projectId) { toast.push('Select worker and period', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/labour-payments', { ...form, project_id: projectId });
      toast.push('Payment generated from attendance');
      setOpen(false);
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const markPaid = async (p: any) => {
    try {
      await api.put(`/labour-payments/${p.id}`, { paid_amount: p.net_amount, payment_date: new Date().toISOString().slice(0, 10), payment_mode: 'cash' });
      toast.push('Marked paid');
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Labour Payments</h3>
        <div className="actions">
          <StatCard icon="⏳" label="Pending" value={fmtMoney(pendingTotal)} color="#fee8e8" />
          {can('attendance.create') && <button className="btn primary sm" onClick={() => setOpen(true)}>＋ Generate Payment</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field"><label>Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All projects</option>
            {(projects?.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        rows={data || []}
        columns={[
          { key: 'worker_name', label: 'Worker', render: (p: any) => <div><strong>{p.worker_name}</strong><div className="muted mono" style={{ fontSize: 11 }}>{p.worker_code}</div></div> },
          { key: 'period_start', label: 'Period', render: (p: any) => <span className="nowrap">{fmtDate(p.period_start)} → {fmtDate(p.period_end)}</span> },
          { key: 'total_days', label: 'Days', align: 'right' },
          { key: 'total_overtime_hours', label: 'OT hrs', align: 'right' },
          { key: 'net_amount', label: 'Net', align: 'right', render: (p: any) => fmtMoney(p.net_amount) },
          { key: 'paid_amount', label: 'Paid', align: 'right', render: (p: any) => fmtMoney(p.paid_amount) },
          { key: 'status', label: 'Status', render: (p: any) => <Badge value={p.status} /> },
          {
            key: '_actions', label: '', align: 'right',
            render: (p: any) => (p.status !== 'paid' && can('attendance.edit') ? <button className="btn success sm" onClick={() => markPaid(p)}>Mark paid</button> : null),
          },
        ]}
      />
      {open && (
        <Modal title="Generate Labour Payment" onClose={() => setOpen(false)} size="md"
          footer={<><button className="btn outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={generate} disabled={busy}>{busy ? 'Working…' : 'Generate'}</button></>}>
          <div className="form-grid">
            <div className="full">
              <Field config={{ key: 'worker_id', label: 'Worker', type: 'select', options: (workers?.data || []).map((w: any) => ({ value: w.id, label: `${w.name} (${w.worker_code})` })), required: true }} value={form.worker_id} onChange={(v) => setForm((s) => ({ ...s, worker_id: v }))} />
            </div>
            <Field config={{ key: 'period_start', label: 'Period start', type: 'date', required: true }} value={form.period_start} onChange={(v) => setForm((s) => ({ ...s, period_start: v }))} />
            <Field config={{ key: 'period_end', label: 'Period end', type: 'date', required: true }} value={form.period_end} onChange={(v) => setForm((s) => ({ ...s, period_end: v }))} />
            <Field config={{ key: 'deductions', label: 'Deductions (₹)', type: 'number' }} value={form.deductions} onChange={(v) => setForm((s) => ({ ...s, deductions: v }))} />
            <Field config={{ key: 'paid_amount', label: 'Pay now (₹, optional)', type: 'number' }} value={form.paid_amount} onChange={(v) => setForm((s) => ({ ...s, paid_amount: v }))} />
          </div>
          <p className="form-hint">Amounts are computed automatically from attendance (days × daily wage + overtime hours × OT rate − deductions).</p>
        </Modal>
      )}
    </div>
  );
}
