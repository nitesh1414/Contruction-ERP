import React, { useMemo, useState } from 'react';
import { api, errMsg } from '../api/client';
import { useFetch } from '../hooks/useFetch';
import { useDebounce } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { fmtDate, fmtMoney, Modal, PaginationBar, DataTable, ConfirmDialog, useToast, Field } from '../components/ui';
import type { ColumnConfig, FieldConfig } from '../api/types';

type Tab = 'employees' | 'leave' | 'salary' | 'payroll';

/* Employees tab */
function EmployeesTab() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const debounced = useDebounce(search);
  const params = useMemo(() => ({ page, limit: 20, search: debounced, ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')) }), [page, debounced, filters]);
  const { data, loading, reload } = useFetch<any>('/hrms/employees', params);
  const rows = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const EMPLOYEE_FIELDS: FieldConfig[] = [
    { key: 'employee_code', label: 'Employee code' },
    { key: 'name', label: 'Full name', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'date_of_joining', label: 'Date of joining', type: 'date' },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }] },
    { key: 'employment_type', label: 'Type', type: 'select', options: [
      { value: 'permanent', label: 'Permanent' }, { value: 'contract', label: 'Contract' }, { value: 'probation', label: 'Probation' }, { value: 'intern', label: 'Intern' } ] },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'resigned', label: 'Resigned' }, { value: 'terminated', label: 'Terminated' } ] },
    { key: 'project_id', label: 'Project', type: 'select', options: (projects?.data || []).map((p: any) => ({ value: p.id, label: `${p.name} · ${p.code}` })) },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' },
  ];

  const openNew = () => { setForm({ is_active: 1, status: 'active', employment_type: 'permanent' }); setEdit('new'); };
  const openEdit = (row: any) => { setForm({ ...row }); setEdit(row); };
  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, is_active: form.is_active === 1 || form.is_active === true ? 1 : 0 };
      if (edit === 'new') { await api.post('/hrms/employees', payload); toast.push('Employee added'); }
      else { await api.put(`/hrms/employees/${edit.id}`, payload); toast.push('Updated'); }
      setEdit(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setSaving(false); }
  };

  const cols: ColumnConfig<any>[] = [
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Name', render: (r) => <div style={{ fontWeight: 650 }}>{r.name}</div> },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Dept' },
    { key: 'project_name', label: 'Project' },
    { key: 'status', label: 'Status', render: (r) => (
      <span className={`badge ${r.status === 'active' ? 'green' : r.status === 'on_leave' ? 'orange' : 'red'}`}>{r.status}</span>
    ) },
    { key: 'date_of_joining', label: 'Joined', render: (r) => fmtDate(r.date_of_joining) },
    { key: '_a', label: '', align: 'right',
      render: (row) => (
        <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
          {can('hrms.edit') && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</button>}
        </div>
      ) },
  ];

  return (
    <>
      <div className="filter-bar">
        <div className="field grow">
          <label>Search</label>
          <input className="input" placeholder="Name, code, email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label>Department</label>
          <input className="input" value={filters.department || ''} onChange={(e) => { setFilters((s) => ({ ...s, department: e.target.value })); setPage(1); }} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={filters.status || ''} onChange={(e) => { setFilters((s) => ({ ...s, status: e.target.value })); setPage(1); }}>
            <option value="">All</option>
            <option value="active">Active</option><option value="on_leave">On leave</option><option value="resigned">Resigned</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <h3>Employees</h3>
          {can('hrms.create') && <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={openNew}>+ Add employee</button>}
        </div>
        <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" />
        <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
      </div>
      {edit !== null && (
        <Modal title={edit === 'new' ? 'Add employee' : `Edit · ${edit.name}`} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
                  <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="form-grid">
            {EMPLOYEE_FIELDS.map((f) => <div style={{ gridColumn: f.width === 'full' ? '1 / -1' : 'auto' }} key={f.key}><Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} /></div>)}
          </div>
        </Modal>
      )}
    </>
  );
}

/* Leave requests tab */
function LeaveTab() {
  const toast = useToast();
  const { can } = useAuth();
  const { data: types } = useFetch<any>('/hrms/leave-types');
  const { data: employees } = useFetch<any>('/hrms/employees', { limit: 500, is_active: 1 });
  const { data, loading, reload } = useFetch<any>('/hrms/leave-requests');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
  const create = async () => {
    try { await api.post('/hrms/leave-requests', { ...form, employee_id: Number(form.employee_id), leave_type_id: Number(form.leave_type_id) }); toast.push('Leave request submitted'); setCreateOpen(false); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
  };
  const decide = async (id: number, status: 'approved' | 'rejected') => {
    try { await api.put(`/hrms/leave-requests/${id}/decide`, { status }); toast.push(`Leave ${status}`); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
  };
  const rows = data?.data || [];
  const cols: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee', render: (r) => r.employee_name },
    { key: 'leave_type', label: 'Type', render: (r) => <span className="badge blue">{r.leave_type_code}</span> },
    { key: 'from_date', label: 'From', render: (r) => fmtDate(r.from_date) },
    { key: 'to_date', label: 'To', render: (r) => fmtDate(r.to_date) },
    { key: 'total_days', label: 'Days' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status', render: (r) => (
      <span className={`badge ${r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : r.status === 'pending' ? 'orange' : 'gray'}`}>{r.status}</span>
    ) },
    { key: '_a', label: '', align: 'right',
      render: (row) => row.status === 'pending' && can('hrms.approve') ? (
        <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
          <button className="btn outline sm" style={{ color: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => decide(row.id, 'approved')}>Approve</button>
          <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => decide(row.id, 'rejected')}>Reject</button>
        </div>
      ) : null },
  ];
  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Leave requests</h3>
          {can('hrms.create') && <button className="btn primary sm" onClick={() => setCreateOpen(true)} style={{ marginLeft: 'auto' }}>+ Request leave</button>}
        </div>
        <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" />
      </div>
      {createOpen && (
        <Modal title="Submit leave request" onClose={() => setCreateOpen(false)} size="md"
          footer={<><button className="btn outline" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn primary" onClick={create}>Submit</button></>}>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Employee <span className="req">*</span></label>
              <select className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Choose employee…</option>
                {(employees?.data || []).map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employee_code}</option>)}
              </select></div>
            <div className="field full"><label>Leave type</label>
              <select className="input" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                <option value="">Choose…</option>
                {(types?.data || []).map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
              </select></div>
            <div className="field"><label>From</label><input className="input" type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
            <div className="field"><label>To</label><input className="input" type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
            <div className="field full"><label>Reason</label><textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* Salary structure tab */
function SalaryTab() {
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, reload } = useFetch<any>('/hrms/salary-structures');
  const { data: employees } = useFetch<any>('/hrms/employees', { limit: 500, is_active: 1 });
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const rows = data?.data || [];
  const FIELDS: FieldConfig[] = [
    { key: 'employee_id', label: 'Employee', type: 'select', required: true, options: (employees?.data || []).map((employee: any) => ({ value: employee.id, label: `${employee.name} · ${employee.employee_code}` })) },
    { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
    { key: 'basic', label: 'Basic (₹)', type: 'number' },
    { key: 'hra', label: 'HRA (₹)', type: 'number' },
    { key: 'da', label: 'DA (₹)', type: 'number' },
    { key: 'special_allowance', label: 'Special (₹)', type: 'number' },
    { key: 'other_allowance', label: 'Other (₹)', type: 'number' },
    { key: 'pf_employee', label: 'PF (employee ₹)', type: 'number' },
    { key: 'pf_employer', label: 'PF (employer ₹)', type: 'number' },
    { key: 'esic_employee', label: 'ESIC (employee)', type: 'number' },
    { key: 'esic_employer', label: 'ESIC (employer)', type: 'number' },
    { key: 'professional_tax', label: 'Prof tax', type: 'number' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' },
  ];
  const save = async () => {
    try { await api.post('/hrms/salary-structures', form); toast.push('Saved'); setEdit(null); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
  };
  const cols: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee', render: (r) => <div style={{ fontWeight: 650 }}>{r.employee_name}</div> },
    { key: 'department', label: 'Dept' },
    { key: 'effective_from', label: 'Effective', render: (r) => fmtDate(r.effective_from) },
    { key: 'basic', label: 'Basic', render: (r) => fmtMoney(r.basic), align: 'right' },
    { key: 'hra', label: 'HRA', render: (r) => fmtMoney(r.hra), align: 'right' },
    { key: 'gross', label: 'Gross', render: (r) => fmtMoney(r.basic + r.hra + r.da + r.special_allowance + r.other_allowance), align: 'right' },
    { key: 'pf_employee', label: 'PF (ee)', render: (r) => fmtMoney(r.pf_employee), align: 'right' },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <h3>Salary structures</h3>
        {can('hrms.create') && <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => { setForm({ effective_from: new Date().toISOString().slice(0, 10) }); setEdit('new'); }}>+ New structure</button>}
      </div>
      <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" />
      {edit !== null && (
        <Modal title={edit === 'new' ? 'New salary structure' : 'Edit salary structure'} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            {FIELDS.map((f) => <div style={{ gridColumn: f.width === 'full' ? '1 / -1' : 'auto' }} key={f.key}><Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} /></div>)}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Payroll tab */
function PayrollTab() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, loading, reload } = useFetch<any>(`/hrms/payroll?payroll_month=${month}&page=${page}&limit=20`);
  const [busy, setBusy] = useState(false);
  const runBulk = async () => {
    setBusy(true);
    try { await api.post('/hrms/payroll/generate-bulk', { payroll_month: month }); toast.push(`Generated payroll for ${month}`); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setBusy(false); }
  };
  const rows = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const cols: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee', render: (r) => <div style={{ fontWeight: 650 }}>{r.employee_name}</div> },
    { key: 'department', label: 'Dept' },
    { key: 'paid_days', label: 'Paid days', render: (r) => Number(r.paid_days).toFixed(1) },
    { key: 'gross_pay', label: 'Gross', render: (r) => fmtMoney(r.gross_pay), align: 'right' },
    { key: 'total_deductions', label: 'Deductions', render: (r) => fmtMoney(r.total_deductions), align: 'right' },
    { key: 'net_pay', label: 'Net', render: (r) => <strong>{fmtMoney(r.net_pay)}</strong>, align: 'right' },
    { key: 'payment_status', label: 'Status', render: (r) => (
      <span className={`badge ${r.payment_status === 'paid' ? 'green' : r.payment_status === 'partial' ? 'orange' : 'red'}`}>{r.payment_status}</span>
    ) },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <h3>Payroll · {month}</h3>
        <div className="actions">
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 180 }} />
          {can('hrms.create') && <button className="btn primary sm" disabled={busy} onClick={runBulk}>{busy ? 'Generating…' : 'Generate monthly payroll'}</button>}
        </div>
      </div>
      <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" />
      <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
    </div>
  );
}

/* Top-level summary tiles */
function SummaryTiles() {
  const { data } = useFetch<any>('/hrms/summary');
  if (!data) return null;
  const tiles = [
    { label: 'Active employees', value: data.active, ic: '👥', color: '#fff0e6' },
    { label: 'On leave (today)', value: data.onLeave, ic: '🌴', color: '#e8f3fb' },
    { label: 'Pending leave requests', value: data.pendingLeave, ic: '⏳', color: '#fef3d8' },
    { label: `Payroll · ${data.month}`, value: fmtMoney(data.payroll?.net_due), ic: '🪙', color: '#dcfcee' },
  ];
  return (
    <div className="stat-grid">
      {tiles.map((t) => (
        <div className="stat-card" key={t.label}>
          <div className="ic" style={{ background: t.color }}>{t.ic}</div>
          <div><div className="val">{t.value}</div><div className="lbl">{t.label}</div></div>
        </div>
      ))}
    </div>
  );
}

export default function HRMS() {
  const [tab, setTab] = useState<Tab>('employees');
  return (
    <>
      <SummaryTiles />
      <div className="card">
        <div className="tabs">
          <button className={tab === 'employees' ? 'active' : ''} onClick={() => setTab('employees')}>Employees</button>
          <button className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>Leave</button>
          <button className={tab === 'salary' ? 'active' : ''} onClick={() => setTab('salary')}>Salary structures</button>
          <button className={tab === 'payroll' ? 'active' : ''} onClick={() => setTab('payroll')}>Payroll</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          {tab === 'employees' && <EmployeesTab />}
          {tab === 'leave' && <LeaveTab />}
          {tab === 'salary' && <SalaryTab />}
          {tab === 'payroll' && <PayrollTab />}
        </div>
      </div>
    </>
  );
}
