import React, { useState } from 'react';
import { api, errMsg, downloadExport } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, ConfirmDialog, DataTable, Field, Modal, PaginationBar, useToast,
} from '../components/ui';

export default function Users() {
  const toast = useToast();
  const { can, user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const params: Record<string, any> = { page, limit: 15 };
  if (search) params.search = search;
  if (roleFilter) params.roleId = roleFilter;
  const { data, loading, reload } = useFetch<any>('/users', params);
  const { data: roles } = useFetch<any[]>('/roles');
  const { data: projects } = useFetch<any>('/projects', { limit: 100 });

  const [editUser, setEditUser] = useState<any>(null);       // user object for edit, {} for create
  const [detail, setDetail] = useState<any>(null);           // loaded from /users/:id
  const [deleting, setDeleting] = useState<any>(null);
  const [resetFor, setResetFor] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const openEdit = async (u: any) => {
    try {
      const res = await api.get(`/users/${u.id}`);
      setDetail(res.data.data);
      setEditUser(res.data.data);
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  const save = async (payload: any, isNew: boolean) => {
    setBusy(true);
    try {
      if (isNew) {
        await api.post('/users', payload);
        toast.push('User created');
      } else {
        const { roleIds, roleIdsChanged, projectAccess, password, ...rest } = payload;
        void password;
        await api.put(`/users/${payload.id}`, rest);
        if (roleIdsChanged && Array.isArray(roleIds)) await api.put(`/users/${payload.id}/roles`, { roleIds });
        if (Array.isArray(projectAccess)) await api.put(`/users/${payload.id}/project-access`, { entries: projectAccess });
        toast.push('User updated');
      }
      setEditUser(null);
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Users</h3>
        <div className="actions">
          {can('users.export') && <button className="btn outline sm" onClick={async () => { try { await downloadExport('/users/export', 'users.csv'); } catch (e) { toast.push(errMsg(e), 'error'); } }}>⬇ Export</button>}
          {can('users.create') && <button className="btn primary sm" onClick={() => { setDetail(null); setEditUser({}); }}>+ New User</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="Name, email, code, phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="field"><label>Role</label>
          <select className="input" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            {(roles || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        columns={[
          {
            key: 'name', label: 'User',
            render: (u: any) => (
              <div className="flex gap-sm">
                <span className="avatar user-chip" style={{ cursor: 'default' }}>{u.name.slice(0, 1)}</span>
                <div><div style={{ fontWeight: 650 }}>{u.name}</div><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></div>
              </div>
            ),
          },
          { key: 'employee_code', label: 'Code', render: (u: any) => <span className="mono">{u.employee_code || '—'}</span> },
          { key: 'phone', label: 'Phone' },
          { key: 'role_names', label: 'Roles', render: (u: any) => (u.role_names || '—').split(', ').filter(Boolean).map((r: string) => <Badge key={r} value="purple" label={r} />).reduce((p: any, c: any) => [p, ' ', c], <span />) },
          { key: 'employee_id', label: 'HR / Payroll', render: (u: any) => u.employee_id
            ? <span className="badge green">Linked · {u.linked_employee_code || 'employee'}</span>
            : <span className="badge gray">No employee</span> },
          { key: 'last_login_at', label: 'Last login', render: (u: any) => (u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : <span className="muted">never</span>) },
          { key: 'status', label: 'Status', render: (u: any) => <Badge value={u.status === 'active' ? 'completed' : 'cancelled'} label={u.status} /> },
          {
            key: '_actions', label: '', align: 'right',
            render: (u: any) => (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                {can('users.edit') && <button className="btn outline sm" onClick={() => openEdit(u)}>Edit</button>}
                {can('users.edit') && <button className="btn outline sm" onClick={() => setResetFor(u)}>Reset PW</button>}
                {can('users.delete') && u.id !== me?.id && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(u)}>Delete</button>}
              </div>
            ),
          },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />

      {editUser !== null && (
        <UserFormModal
          user={editUser.id ? editUser : null}
          onClose={() => setEditUser(null)}
          onSave={save}
          busy={busy}
          roles={(roles || []).filter((role: any) => me?.isSuperAdmin || me?.roles?.some((assigned: any) => assigned.code === 'admin') || !['admin', 'super_admin'].includes(role.code))}
          projects={projects?.data || []}
          canCreateEmployee={can('hrms.create')}
        />
      )}

      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete user "${deleting.name}" (${deleting.email})? Their audit history will be preserved.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.delete(`/users/${deleting.id}`); toast.push('User deleted'); setDeleting(null); reload(); }
            catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
          }} />
      )}
      {void detail}
    </div>
  );
}

function UserFormModal({ user, onClose, onSave, busy, roles, projects, canCreateEmployee }: {
  user: any | null; onClose: () => void; onSave: (payload: any, isNew: boolean) => void; busy: boolean; roles: any[]; projects: any[]; canCreateEmployee: boolean;
}) {
  const isNew = !user;
  const [form, setForm] = useState<any>({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', employee_code: user?.employee_code || '', status: user?.status || 'active', password: '' });
  const [roleIds, setRoleIds] = useState<number[]>(user?.roles?.map((r: any) => r.id) || []);
  const initialRoleIds = user?.roles?.map((r: any) => Number(r.id)).sort((a: number, b: number) => a - b) || [];
  const [createEmployee, setCreateEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<any>({
    department: '', designation: '', date_of_joining: '', employment_type: 'permanent',
    status: 'active', project_id: '', wing_id: '',
  });
  const [access, setAccess] = useState<{ project_id: number | ''; wing_id: number }[]>(
    (user?.projectAccess || []).map((p: any) => ({ project_id: p.project_id, wing_id: p.wing_id ?? 0 }))
  );
  const { data: wings } = useFetch<any>('/wings', access.length ? { projectId: access[0]?.project_id || undefined } : {});
  const toast = useToast();

  const submit = () => {
    if (isNew && (!form.password || form.password.length < 8)) { toast.push('Password must be at least 8 characters', 'error'); return; }
    if (isNew && !roleIds.length) { toast.push('Select at least one role for the user', 'error'); return; }
    const normalizedRoleIds = [...roleIds].sort((a, b) => a - b);
    const roleIdsChanged = normalizedRoleIds.length !== initialRoleIds.length || normalizedRoleIds.some((id, index) => id !== initialRoleIds[index]);
    const payload: any = { ...form, id: user?.id, roleIds, roleIdsChanged, projectAccess: access.filter((a) => a.project_id) };
    if (isNew && createEmployee) {
      payload.createEmployee = true;
      payload.employee = {
        ...employeeForm,
        employee_code: form.employee_code,
        name: form.name,
        email: form.email,
        phone: form.phone,
        project_id: employeeForm.project_id || null,
        wing_id: employeeForm.wing_id || null,
      };
    }
    onSave(payload, isNew);
  };

  return (
    <Modal title={isNew ? 'Create User' : `Edit User — ${user?.name}`} onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}</button></>}>
      <h3 style={{ marginTop: 0 }}>Account</h3>
      <div className="form-grid">
        <Field config={{ key: 'name', label: 'Full name', type: 'text', required: true }} value={form.name} onChange={(v) => setForm((s: any) => ({ ...s, name: v }))} />
        <Field config={{ key: 'email', label: 'Email (login)', type: 'email', required: true }} value={form.email} onChange={(v) => setForm((s: any) => ({ ...s, email: v }))} />
        <Field config={{ key: 'phone', label: 'Phone', type: 'text' }} value={form.phone} onChange={(v) => setForm((s: any) => ({ ...s, phone: v }))} />
        <Field config={{ key: 'employee_code', label: 'Employee code', type: 'text' }} value={form.employee_code} onChange={(v) => setForm((s: any) => ({ ...s, employee_code: v }))} />
        {isNew && <Field config={{ key: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'Min 8 characters — user should change it after first login' }} value={form.password} onChange={(v) => setForm((s: any) => ({ ...s, password: v }))} />}
        <Field config={{ key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] }} value={form.status} onChange={(v) => setForm((s: any) => ({ ...s, status: v }))} />
      </div>

      {isNew && (
        <div className="card" style={{ marginTop: 16, padding: 14, background: 'var(--bg-tint)' }}>
          <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>HR & Payroll link</strong>
              <div className="form-hint" style={{ marginTop: 3 }}>Should this user also receive an employee record for leave, salary and payroll?</div>
            </div>
            <label className="check-label">
              <input type="checkbox" checked={createEmployee} disabled={!canCreateEmployee} onChange={(e) => setCreateEmployee(e.target.checked)} />
              Create employee record
            </label>
          </div>
          {!canCreateEmployee && <div className="form-hint" style={{ marginTop: 8 }}>HRMS → Create permission is required to add the linked payroll employee record.</div>}
          {createEmployee && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field config={{ key: 'department', label: 'Department', type: 'text' }} value={employeeForm.department} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, department: v }))} />
              <Field config={{ key: 'designation', label: 'Designation', type: 'text' }} value={employeeForm.designation} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, designation: v }))} />
              <Field config={{ key: 'date_of_joining', label: 'Date of joining', type: 'date' }} value={employeeForm.date_of_joining} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, date_of_joining: v }))} />
              <Field config={{ key: 'employment_type', label: 'Employment type', type: 'select', options: [{ value: 'permanent', label: 'Permanent' }, { value: 'contract', label: 'Contract' }, { value: 'probation', label: 'Probation' }, { value: 'intern', label: 'Intern' }] }} value={employeeForm.employment_type} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, employment_type: v }))} />
              <Field config={{ key: 'project_id', label: 'Payroll project', type: 'select', options: projects.map((p: any) => ({ value: p.id, label: `${p.name} · ${p.code}` })) }} value={employeeForm.project_id} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, project_id: v, wing_id: '' }))} />
              <Field config={{ key: 'status', label: 'Employee status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }] }} value={employeeForm.status} onChange={(v) => setEmployeeForm((s: any) => ({ ...s, status: v }))} />
            </div>
          )}
        </div>
      )}
      {user?.employee && !isNew && (
        <div className="form-hint" style={{ color: 'var(--success)', margin: '12px 0' }}>
          ✓ Linked HR/payroll employee: {user.employee.employee_code} · {user.employee.status}
        </div>
      )}

      <h3>Roles</h3>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {roles.map((r: any) => (
          <button
            key={r.id}
            type="button"
            className={`btn sm ${roleIds.includes(r.id) ? 'primary' : 'outline'}`}
            onClick={() => setRoleIds((s) => s.includes(r.id) ? s.filter((id) => id !== r.id) : [...s, r.id])}
          >
            {roleIds.includes(r.id) ? '✓ ' : ''}{r.name}
          </button>
        ))}
      </div>

      <h3>Project Access <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— empty with Super Admin role means all projects</span></h3>
      {access.map((a, idx) => (
        <div key={idx} className="flex gap-sm" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ flex: 2, minWidth: 180 }} value={a.project_id} onChange={(e) => setAccess((s) => s.map((x, j) => j === idx ? { ...x, project_id: e.target.value ? Number(e.target.value) : '', wing_id: 0 } : x))}>
            <option value="">Select project…</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input" style={{ flex: 1, minWidth: 140 }} value={a.wing_id} onChange={(e) => setAccess((s) => s.map((x, j) => j === idx ? { ...x, wing_id: Number(e.target.value) } : x))}>
            <option value={0}>All wings</option>
            {(wings || []).filter((w: any) => w.project_id === a.project_id).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="btn outline sm" onClick={() => setAccess((s) => s.filter((_, j) => j !== idx))}>✕</button>
        </div>
      ))}
      <button className="btn outline sm" onClick={() => setAccess((s) => [...s, { project_id: '', wing_id: 0 }])}>+ Add project access</button>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: any; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (pw.length < 8) { toast.push('Min 8 characters', 'error'); return; }
    setBusy(true);
    try {
      await api.put(`/users/${user.id}/reset-password`, { newPassword: pw });
      toast.push('Password reset');
      onClose();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose} size="sm"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn danger" onClick={reset} disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button></>}>
      <Field config={{ key: 'pw', label: 'New password (min 8 chars)', type: 'text' }} value={pw} onChange={setPw} />
      <p className="form-hint">All active sessions for this user will be revoked.</p>
    </Modal>
  );
}
