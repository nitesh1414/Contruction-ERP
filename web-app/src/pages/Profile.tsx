import React, { useState } from 'react';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge, Field, useToast } from '../components/ui';

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const saveProfile = async () => {
    setBusy(true);
    try {
      await api.put('/auth/profile', form);
      await refreshUser();
      toast.push('Profile updated');
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (pw.newPassword !== pw.confirm) { toast.push('Passwords do not match', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.push('Password changed — please log in again');
      await logout();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h2>My Profile</h2>
        <div className="user-chip" style={{ marginBottom: 14, cursor: 'default' }}>
          <span className="avatar" style={{ width: 38, height: 38, fontSize: 16 }}>{user.name.slice(0, 1)}</span>
          <span>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{user.email}{user.employee_code ? ` · ${user.employee_code}` : ''}</div>
          </span>
        </div>
        <div className="flex gap-sm" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {user.roles?.map((r) => <Badge key={r.id} value="purple" label={r.name} />)}
          {user.isSuperAdmin && <Badge value="high" label="SUPER ADMIN" />}
        </div>
        <Field config={{ key: 'name', label: 'Full name', type: 'text' }} value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
        <Field config={{ key: 'phone', label: 'Phone', type: 'text' }} value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} />
        <button className="btn primary sm" onClick={saveProfile} disabled={busy}>Save profile</button>

        {user.employee && (
          <div className="card" style={{ marginTop: 16, padding: 14, background: 'var(--bg-tint)' }}>
            <h3 style={{ marginTop: 0 }}>HR & Payroll profile</h3>
            <div className="form-hint" style={{ marginBottom: 8 }}>Your login and employee record are synchronized.</div>
            <div className="compact-kv">
              <span>Employee code</span><strong>{user.employee.employee_code}</strong>
              <span>Department</span><strong>{user.employee.department || '—'}</strong>
              <span>Designation</span><strong>{user.employee.effective_designation || user.employee.designation || '—'}</strong>
              <span>Employment</span><strong>{user.employee.employment_type || '—'}</strong>
              <span>Project</span><strong>{user.employee.project_name || '—'}</strong>
              <span>Status</span><Badge value={user.employee.status || 'active'} />
            </div>
          </div>
        )}

        {!!user.projectAccess?.length && (
          <div style={{ marginTop: 16 }}>
            <h3>Project Access</h3>
            <ul className="pending-list card">
              {user.projectAccess.map((p: any, i: number) => (
                <li key={i}>🏗️ {p.project_name} {p.wing_id ? `— ${p.wing_name || `Wing #${p.wing_id}`}` : <span className="muted">(all wings)</span>}</li>
              ))}
            </ul>
          </div>
        )}
        {user.isSuperAdmin && !user.projectAccess?.length && <p className="muted">As Super Admin you have access to all projects and modules.</p>}
      </div>

      <div className="card card-pad">
        <h2>Change Password</h2>
        <Field config={{ key: 'current', label: 'Current password', type: 'password' }} value={pw.currentPassword} onChange={(v) => setPw((s) => ({ ...s, currentPassword: v }))} />
        <Field config={{ key: 'new', label: 'New password (min 8 chars)', type: 'password' }} value={pw.newPassword} onChange={(v) => setPw((s) => ({ ...s, newPassword: v }))} />
        <Field config={{ key: 'confirm', label: 'Confirm new password', type: 'password' }} value={pw.confirm} onChange={(v) => setPw((s) => ({ ...s, confirm: v }))} />
        <button className="btn primary sm" onClick={changePassword} disabled={busy}>Change password</button>
      </div>
    </div>
  );
}
