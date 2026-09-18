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
  const { data: departments } = useFetch<any>('/hrms/departments', { limit: 200, is_active: 1 });
  const { data: designations } = useFetch<any>('/hrms/designations', { limit: 200, is_active: 1 });
  const { data: loginRoles } = useFetch<any>('/hrms/login-roles');
  const debounced = useDebounce(search);
  const params = useMemo(() => ({ page, limit: 20, search: debounced, ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')) }), [page, debounced, filters]);
  const { data, loading, reload } = useFetch<any>('/hrms/employees', params);
  const rows = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [login, setLogin] = useState<{ enabled: boolean; password: string; roleIds: number[] }>({ enabled: false, password: '', roleIds: [] });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const { data: wings } = useFetch<any>('/wings', form.project_id ? { projectId: form.project_id } : undefined);
  const linkedDesignation = (designations?.data || []).find((row: any) => row.name === form.designation);
  const effectiveLoginRoleIds = [...new Set([
    ...login.roleIds,
    ...(linkedDesignation?.role_id ? [Number(linkedDesignation.role_id)] : []),
  ])];

  const EMPLOYEE_FIELDS: FieldConfig[] = [
    { key: 'employee_code', label: 'Employee code' },
    { key: 'name', label: 'Full name', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone' },
    { key: 'designation', label: 'Designation / role', type: 'select', required: true, options: (designations?.data || []).map((row: any) => ({ value: row.name, label: row.role_name ? `${row.name} · ${row.role_name}` : row.name })) },
    { key: 'department', label: 'Department', type: 'select', required: true, options: (departments?.data || []).map((row: any) => ({ value: row.name, label: row.name })) },
    { key: 'date_of_joining', label: 'Date of joining', type: 'date' },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }] },
    { key: 'employment_type', label: 'Type', type: 'select', options: [
      { value: 'permanent', label: 'Permanent' }, { value: 'contract', label: 'Contract' }, { value: 'probation', label: 'Probation' }, { value: 'intern', label: 'Intern' } ] },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'resigned', label: 'Resigned' }, { value: 'terminated', label: 'Terminated' } ] },
    { key: 'project_id', label: 'Project', type: 'select', options: (projects?.data || []).map((p: any) => ({ value: p.id, label: `${p.name} · ${p.code}` })) },
    { key: 'wing_id', label: 'Wing', type: 'select', options: (wings?.data || []).map((w: any) => ({ value: w.id, label: `${w.name} · ${w.code}` })) },
    { key: 'bank_account', label: 'Bank account' },
    { key: 'pan_number', label: 'PAN' },
    { key: 'aadhaar_number', label: 'Aadhaar' },
    { key: 'address', label: 'Address', width: 'full' },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' },
  ];

  const openNew = () => {
    setForm({ is_active: 1, status: 'active', employment_type: 'permanent' });
    setLogin({ enabled: false, password: '', roleIds: [] });
    setEdit('new');
  };
  const openEdit = (row: any) => {
    setForm({ ...row, date_of_joining: fmtDate(row.date_of_joining) === '—' ? '' : fmtDate(row.date_of_joining), date_of_birth: fmtDate(row.date_of_birth) === '—' ? '' : fmtDate(row.date_of_birth) });
    setLogin({ enabled: false, password: '', roleIds: [] });
    setEdit(row);
  };
  const openDetails = async (row: any) => {
    try {
      const response = await api.get(`/hrms/employees/${row.id}`);
      setDetail(response.data.data);
    } catch (error) { toast.push(errMsg(error), 'error'); }
  };
  const removeEmployee = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.delete(`/hrms/employees/${deleting.id}`);
      toast.push('Employee deleted');
      setDeleting(null);
      reload();
    } catch (error) { toast.push(errMsg(error), 'error'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    if (login.enabled) {
      if (!can('users.create')) { toast.push('You need Users → Create permission to provision a login', 'error'); return; }
      if (!form.email) { toast.push('Add an email address for the login', 'error'); return; }
      if (login.password.length < 8) { toast.push('Login password must be at least 8 characters', 'error'); return; }
      if (!effectiveLoginRoleIds.length) { toast.push('Select at least one login role or choose a designation linked to a role', 'error'); return; }
      if (edit !== 'new' && edit.user_id) { toast.push('This employee already has a linked login', 'error'); return; }
    }
    if (!form.department || !form.designation) {
      toast.push('Select a department and designation from HRMS master data', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...form, is_active: form.is_active === 1 || form.is_active === true ? 1 : 0 };
      if (edit === 'new') {
        if (login.enabled) {
          payload.create_login = true;
          payload.login_password = login.password;
          payload.login_role_ids = effectiveLoginRoleIds;
        }
        await api.post('/hrms/employees', payload);
        toast.push(login.enabled ? 'Employee and login created' : 'Employee added');
      } else {
        if (login.enabled) {
          payload.create_login = true;
          payload.login_password = login.password;
          payload.login_role_ids = effectiveLoginRoleIds;
        }
        await api.put(`/hrms/employees/${edit.id}`, payload);
        toast.push(login.enabled ? 'Employee updated and login linked' : 'Updated');
      }
      setEdit(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setSaving(false); }
  };

  const cols: ColumnConfig<any>[] = [
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Name', render: (r) => <div style={{ fontWeight: 650 }}>{r.name}</div> },
    { key: 'designation', label: 'Designation', render: (r) => <span>{r.designation}{r.designation_role_name ? <span className="muted"> · {r.designation_role_name}</span> : null}</span> },
    { key: 'department', label: 'Dept' },
    { key: 'project_name', label: 'Project' },
    { key: 'user_name', label: 'Login', render: (r) => r.user_id
      ? <span className="badge green">Linked{r.user_name ? ` · ${r.user_name}` : ''}</span>
      : <span className="badge gray">No login</span> },
    { key: 'status', label: 'Status', render: (r) => (
      <span className={`badge ${r.status === 'active' ? 'green' : r.status === 'on_leave' ? 'orange' : 'red'}`}>{r.status}</span>
    ) },
    { key: 'date_of_joining', label: 'Joined', render: (r) => fmtDate(r.date_of_joining) },
    { key: '_a', label: '', align: 'right',
      render: (row) => (
        <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
          <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openDetails(row); }}>Details</button>
          {can('hrms.edit') && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</button>}
          {can('hrms.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>Delete</button>}
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
          <select className="input" value={filters.department || ''} onChange={(e) => { setFilters((s) => ({ ...s, department: e.target.value })); setPage(1); }}>
            <option value="">All departments</option>
            {(departments?.data || []).map((row: any) => <option key={row.id} value={row.name}>{row.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={filters.status || ''} onChange={(e) => { setFilters((s) => ({ ...s, status: e.target.value })); setPage(1); }}>
            <option value="">All</option>
            <option value="active">Active</option><option value="on_leave">On leave</option><option value="resigned">Resigned</option><option value="terminated">Terminated</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div><h3>Employees</h3><span className="muted" style={{ fontSize: 12 }}>Shared directory · {total} total</span></div>
          {can('hrms.create') && <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={openNew}>+ Add employee</button>}
        </div>
        <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" onRowClick={openDetails} />
        <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
      </div>
      {detail && <EmployeeDetailsModal employee={detail} onClose={() => setDetail(null)} canEdit={can('hrms.edit')} onEdit={() => { setDetail(null); openEdit(detail); }} />}
      {deleting && <ConfirmDialog message={`Delete employee "${deleting.name}"? Linked login accounts are retained but unlinked.`} onCancel={() => setDeleting(null)} onConfirm={removeEmployee} busy={saving} />}
      {edit !== null && (
        <Modal title={edit === 'new' ? 'Add employee' : `Edit · ${edit.name}`} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
                  <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="form-grid">
            {EMPLOYEE_FIELDS.map((f) => <div style={{ gridColumn: f.width === 'full' ? '1 / -1' : 'auto' }} key={f.key}><Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v, ...(f.key === 'project_id' ? { wing_id: null } : {}) }))} /></div>)}
          </div>
          <div className="card" style={{ marginTop: 16, padding: 14, background: 'var(--bg-tint)' }}>
            <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>Login access</strong>
                <div className="form-hint" style={{ marginTop: 3 }}>Should this employee also be able to sign in to the ERP?</div>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={login.enabled}
                  disabled={!can('users.create') || (edit !== 'new' && !!form.user_id)}
                  onChange={(e) => setLogin((s) => ({ ...s, enabled: e.target.checked }))}
                />
                Create login credentials
              </label>
            </div>
            {!can('users.create') && <div className="form-hint" style={{ marginTop: 8 }}>Users → Create permission is required to provision login access.</div>}
            {edit !== 'new' && form.user_id && <div className="form-hint" style={{ marginTop: 8, color: 'var(--success)' }}>Already linked to {form.user_name || 'an ERP user'} — duplicate links are blocked.</div>}
            {login.enabled && (
              <div style={{ marginTop: 12 }}>
                <div className="form-grid">
                  <Field config={{ key: 'login_password', label: 'Temporary password', type: 'password', required: true, hint: 'Minimum 8 characters' }} value={login.password} onChange={(v) => setLogin((s) => ({ ...s, password: v }))} />
                </div>
                <label className="field-label" style={{ display: 'block', marginTop: 8 }}>Login roles <span className="req">*</span></label>
                <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                  {(loginRoles || []).map((role: any) => (
                    <button key={role.id} type="button" className={`btn sm ${effectiveLoginRoleIds.includes(Number(role.id)) ? 'primary' : 'outline'}`} onClick={() => setLogin((s) => ({ ...s, roleIds: s.roleIds.includes(Number(role.id)) ? s.roleIds.filter((id) => id !== Number(role.id)) : [...s.roleIds, Number(role.id)] }))}>
                      {effectiveLoginRoleIds.includes(Number(role.id)) ? '✓ ' : ''}{role.name}
                    </button>
                  ))}
                </div>
                {linkedDesignation?.role_name && <div className="form-hint" style={{ marginTop: 8 }}>The <strong>{linkedDesignation.name}</strong> designation automatically includes its linked role: <strong>{linkedDesignation.role_name}</strong>. Other selected roles are retained.</div>}
                {!loginRoles?.length && <div className="form-hint" style={{ marginTop: 8 }}>No active login roles are available.</div>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function EmployeeDetailsModal({ employee, onClose, canEdit, onEdit }: { employee: any; onClose: () => void; canEdit: boolean; onEdit: () => void }) {
  const { data: balances } = useFetch<any>('/hrms/leave-balances', { employeeId: employee.id, year: new Date().getFullYear() });
  const leaveColumns: ColumnConfig<any>[] = [
    { key: 'leave_type_name', label: 'Leave' },
    { key: 'from_date', label: 'From', render: (row) => fmtDate(row.from_date) },
    { key: 'to_date', label: 'To', render: (row) => fmtDate(row.to_date) },
    { key: 'total_days', label: 'Days' },
    { key: 'status', label: 'Status', render: (row) => <span className={`badge ${row.status === 'approved' ? 'green' : row.status === 'rejected' ? 'red' : 'orange'}`}>{row.status}</span> },
  ];
  const payrollColumns: ColumnConfig<any>[] = [
    { key: 'payroll_month', label: 'Month' },
    { key: 'gross_pay', label: 'Gross', render: (row) => fmtMoney(row.gross_pay), align: 'right' },
    { key: 'net_pay', label: 'Net', render: (row) => fmtMoney(row.net_pay), align: 'right' },
    { key: 'payment_status', label: 'Payment', render: (row) => <span className={`badge ${row.payment_status === 'paid' ? 'green' : row.payment_status === 'partial' ? 'orange' : 'red'}`}>{row.payment_status}</span> },
  ];
  return (
    <Modal title={`Employee details · ${employee.name}`} onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Close</button>{canEdit && <button className="btn primary" onClick={onEdit}>Edit employee</button>}</>}>
      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Profile</h3>
          <div className="compact-kv">
            <span>Employee code</span><strong>{employee.employee_code}</strong>
            <span>Email</span><strong>{employee.email || '—'}</strong>
            <span>Phone</span><strong>{employee.phone || '—'}</strong>
            <span>Department</span><strong>{employee.department || '—'}</strong>
            <span>Designation</span><strong>{employee.designation || '—'}{employee.designation_role_name ? ` · ${employee.designation_role_name}` : ''}</strong>
            <span>Employment</span><strong>{employee.employment_type || '—'}</strong>
            <span>Joined</span><strong>{fmtDate(employee.date_of_joining)}</strong>
            <span>Project</span><strong>{employee.project_name || '—'}{employee.wing_name ? ` · ${employee.wing_name}` : ''}</strong>
            <span>Status</span><span><span className={`badge ${employee.status === 'active' ? 'green' : employee.status === 'on_leave' ? 'orange' : 'red'}`}>{employee.status}</span></span>
          </div>
          <div className="form-hint" style={{ marginTop: 12 }}>{employee.address || 'No address on file'}</div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Login access</h3>
          {employee.user_id ? <div className="compact-kv"><span>Account</span><strong>{employee.user_name || employee.user_email}</strong><span>Email</span><strong>{employee.user_email || employee.email}</strong><span>Status</span><strong>{employee.user_status || 'active'}</strong></div> : <p className="muted">No login credentials are linked. Use Edit employee to provision access.</p>}
          {employee.bank_account && <p className="form-hint" style={{ marginBottom: 0 }}>Bank account on file: •••• {String(employee.bank_account).slice(-4)}</p>}
        </div>
      </div>
      <h3 style={{ margin: '14px 0 6px' }}>Leave balance · {new Date().getFullYear()}</h3>
      <DataTable columns={[
        { key: 'name', label: 'Leave type' },
        { key: 'annual_quota', label: 'Quota' },
        { key: 'used_days', label: 'Used' },
        { key: 'pending_days', label: 'Pending' },
        { key: 'remaining_days', label: 'Remaining', render: (row: any) => row.remaining_days == null ? '—' : <strong>{row.remaining_days}</strong> },
      ] as ColumnConfig<any>[]} rows={balances || []} rowKey="id" emptyMessage="No active leave types." />
      <h3 style={{ margin: '14px 0 6px' }}>Salary history</h3>
      <DataTable columns={[
        { key: 'effective_from', label: 'Effective', render: (row: any) => fmtDate(row.effective_from) },
        { key: 'basic', label: 'Basic', render: (row: any) => fmtMoney(row.basic), align: 'right' },
        { key: 'hra', label: 'HRA', render: (row: any) => fmtMoney(row.hra), align: 'right' },
        { key: 'pf_employee', label: 'PF', render: (row: any) => fmtMoney(row.pf_employee), align: 'right' },
      ] as ColumnConfig<any>[]} rows={employee.structures || []} rowKey="id" emptyMessage="No salary structure has been defined." />
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div><h3 style={{ marginBottom: 6 }}>Recent leave</h3><DataTable columns={leaveColumns} rows={employee.recentLeave || []} rowKey="id" emptyMessage="No leave requests." /></div>
        <div><h3 style={{ marginBottom: 6 }}>Recent payroll</h3><DataTable columns={payrollColumns} rows={employee.recentPayroll || []} rowKey="id" emptyMessage="No payroll generated." /></div>
      </div>
    </Modal>
  );
}

/* Leave requests tab */
function LeaveTab() {
  const toast = useToast();
  const { can } = useAuth();
  const { data: types } = useFetch<any>('/hrms/leave-types');
  const { data: employees } = useFetch<any>('/hrms/employees', { limit: 200, is_active: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const { data, loading, reload } = useFetch<any>('/hrms/leave-requests', { status: statusFilter || undefined, search: debouncedSearch || undefined, limit: 50 });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
  const create = async () => {
    if (!form.employee_id || !form.leave_type_id || !form.from_date || !form.to_date) { toast.push('Employee, leave type and dates are required', 'error'); return; }
    if (form.to_date < form.from_date) { toast.push('To date must be on or after from date', 'error'); return; }
    try { await api.post('/hrms/leave-requests', { ...form, employee_id: Number(form.employee_id), leave_type_id: Number(form.leave_type_id) }); toast.push('Leave request submitted'); setCreateOpen(false); setForm({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' }); reload(); }
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
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="Employee or code…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="field"><label>Status</label><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></div>
      </div>
      <div className="card">
        <div className="card-header">
          <h3>Leave requests</h3>
          {can('hrms.create') && <button className="btn primary sm" onClick={() => { setForm({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' }); setCreateOpen(true); }} style={{ marginLeft: 'auto' }}>+ Request leave</button>}
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
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
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
    try {
      if (edit === 'new') await api.post('/hrms/salary-structures', form);
      else await api.put(`/hrms/salary-structures/${edit.id}`, form);
      toast.push('Salary structure saved'); setEdit(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };
  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await api.delete(`/hrms/salary-structures/${deleting.id}`); toast.push('Salary structure deleted'); setDeleting(null); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setDeleteBusy(false); }
  };
  const cols: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee', render: (r) => <div style={{ fontWeight: 650 }}>{r.employee_name}</div> },
    { key: 'department', label: 'Dept' },
    { key: 'effective_from', label: 'Effective', render: (r) => fmtDate(r.effective_from) },
    { key: 'basic', label: 'Basic', render: (r) => fmtMoney(r.basic), align: 'right' },
    { key: 'hra', label: 'HRA', render: (r) => fmtMoney(r.hra), align: 'right' },
    { key: 'gross', label: 'Gross', render: (r) => fmtMoney(r.basic + r.hra + r.da + r.special_allowance + r.other_allowance), align: 'right' },
    { key: 'pf_employee', label: 'PF (ee)', render: (r) => fmtMoney(r.pf_employee), align: 'right' },
    { key: '_a', label: '', align: 'right', render: (r) => <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
      {can('hrms.edit') && <button className="btn outline sm" onClick={() => { setForm({ ...r, effective_from: fmtDate(r.effective_from) }); setEdit(r); }}>Edit</button>}
      {can('hrms.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(r)}>Delete</button>}
    </div> },
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
      {deleting && <ConfirmDialog message={`Delete salary structure for ${deleting.employee_name || 'this employee'}?`} onCancel={() => setDeleting(null)} onConfirm={remove} busy={deleteBusy} />}
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
  const [paymentFor, setPaymentFor] = useState<any>(null);
  const [payment, setPayment] = useState({ paid_amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_reference: '' });
  const openPayment = (row: any) => {
    setPaymentFor(row);
    setPayment({ paid_amount: row.paid_amount ? String(row.paid_amount) : String(row.net_pay || ''), payment_date: row.payment_date ? String(row.payment_date).slice(0, 10) : new Date().toISOString().slice(0, 10), payment_reference: row.payment_reference || '' });
  };
  const savePayment = async () => {
    if (!paymentFor) return;
    try {
      await api.put(`/hrms/payroll/${paymentFor.id}/payment`, { ...payment, paid_amount: Number(payment.paid_amount || 0) });
      toast.push('Payroll payment status updated');
      setPaymentFor(null);
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };
  const runBulk = async () => {
    setBusy(true);
    try {
      const response = await api.post('/hrms/payroll/generate-bulk', { payroll_month: month });
      const skipped = response.data?.skipped?.length || 0;
      toast.push(skipped ? `Generated payroll; ${skipped} employee(s) need attention` : `Generated payroll for ${month}`, skipped ? 'info' : 'success');
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
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
    { key: '_a', label: '', align: 'right', render: (r) => can('hrms.edit')
      ? <button className="btn outline sm" onClick={() => openPayment(r)}>Record payment</button> : null },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <h3>Payroll · {month}</h3>
        <div className="actions">
          <input className="input" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} style={{ width: 180 }} />
          {can('hrms.create') && <button className="btn primary sm" disabled={busy} onClick={runBulk}>{busy ? 'Generating…' : 'Generate monthly payroll'}</button>}
        </div>
      </div>
      <DataTable columns={cols} rows={rows} loading={loading} rowKey="id" />
      <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
      {paymentFor && (
        <Modal title={`Record payment · ${paymentFor.employee_name}`} onClose={() => setPaymentFor(null)} size="sm"
          footer={<><button className="btn outline" onClick={() => setPaymentFor(null)}>Cancel</button><button className="btn primary" onClick={savePayment}>Save payment</button></>}>
          <p className="form-hint" style={{ marginTop: 0 }}>Net payable: <strong>{fmtMoney(paymentFor.net_pay)}</strong>. The status is calculated from the amount paid.</p>
          <div className="form-grid">
            <Field config={{ key: 'paid_amount', label: 'Amount paid (₹)', type: 'number', required: true }} value={payment.paid_amount} onChange={(v) => setPayment((s) => ({ ...s, paid_amount: v }))} />
            <Field config={{ key: 'payment_date', label: 'Payment date', type: 'date' }} value={payment.payment_date} onChange={(v) => setPayment((s) => ({ ...s, payment_date: v }))} />
            <Field config={{ key: 'payment_reference', label: 'Reference / UTR', type: 'text' }} value={payment.payment_reference} onChange={(v) => setPayment((s) => ({ ...s, payment_reference: v }))} />
          </div>
        </Modal>
      )}
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
    { label: `Payroll due · ${data.month}`, value: fmtMoney(data.payroll?.pending_net ?? data.payroll?.net_due), ic: '🪙', color: '#dcfcee' },
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
