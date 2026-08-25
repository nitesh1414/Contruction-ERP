import React, { useEffect, useState } from 'react';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { Badge, ConfirmDialog, DataTable, Field, Modal, useToast } from '../components/ui';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload', 'download'];

export default function Roles() {
  const toast = useToast();
  const { can } = useAuth();
  const { data: roles, reload } = useFetch<any[]>('/roles');
  const [createOpen, setCreateOpen] = useState(false);
  const [matrixFor, setMatrixFor] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Roles & Permissions</h3>
        <div className="actions">
          {can('roles.create') && <button className="btn primary sm" onClick={() => setCreateOpen(true)}>+ New Role</button>}
        </div>
      </div>
      <DataTable
        rows={roles || []}
        columns={[
          { key: 'name', label: 'Role', render: (r: any) => <div><div style={{ fontWeight: 650 }}>{r.name}</div><div className="muted mono" style={{ fontSize: 11 }}>{r.code}</div></div> },
          { key: 'description', label: 'Description' },
          { key: 'user_count', label: 'Users', align: 'right' },
          { key: 'permission_count', label: 'Permissions', align: 'right', render: (r: any) => <Badge value="purple" label={String(r.permission_count)} /> },
          { key: 'is_system', label: 'Type', render: (r: any) => <Badge value={r.is_system ? 'blue' : 'gray'} label={r.is_system ? 'System' : 'Custom'} /> },
          { key: 'is_active', label: 'Status', render: (r: any) => <Badge value={r.is_active ? 'completed' : 'cancelled'} label={r.is_active ? 'Active' : 'Inactive'} /> },
          {
            key: '_actions', label: '', align: 'right',
            render: (r: any) => (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                {can('roles.edit') && r.code !== 'super_admin' && (
                  <button className="btn primary sm" onClick={() => setMatrixFor(r)}>🛡 Permissions</button>
                )}
                {can('roles.delete') && !r.is_system && r.user_count === 0 && (
                  <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(r)}>Delete</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {createOpen && <CreateRoleModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} />}
      {matrixFor && <PermissionMatrixModal role={matrixFor} onClose={() => setMatrixFor(null)} onSaved={() => { setMatrixFor(null); reload(); }} />}
      {deleting && (
        <ConfirmDialog
          message={`Delete custom role "${deleting.name}"?`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.delete(`/roles/${deleting.id}`); toast.push('Role deleted'); setDeleting(null); reload(); }
            catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
          }} />
      )}
    </div>
  );
}

function CreateRoleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast.push('Role name required', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/roles', { name: name.trim(), description });
      toast.push('Role created — configure its permissions');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create Custom Role" onClose={onClose} size="sm"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button></>}>
      <Field config={{ key: 'name', label: 'Role name', type: 'text', required: true }} value={name} onChange={setName} />
      <Field config={{ key: 'description', label: 'Description', type: 'textarea' }} value={description} onChange={setDescription} />
    </Modal>
  );
}

function PermissionMatrixModal({ role, onClose, onSaved }: { role: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [permissions, setPermissions] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [permsRes, roleRes] = await Promise.all([
          api.get('/roles/permissions'),
          api.get(`/roles/${role.id}`),
        ]);
        setPermissions(permsRes.data.data.permissions);
        setGrouped(permsRes.data.data.grouped);
        setSelected(new Set(roleRes.data.data.permissionIds));
      } catch (e) {
        toast.push(errMsg(e), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [role.id]);

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toggleModule = (module: string, perms: any[]) => {
    const ids = perms.map((p) => p.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      if (allOn) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/roles/${role.id}/permissions`, { permissionIds: [...selected] });
      toast.push(`Saved "${role.name}" — ${selected.size} permissions`);
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Permissions — ${role.name}`} onClose={onClose} size="xl"
      footer={<>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>{selected.size} of {permissions.length} granted</span>
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save permissions'}</button>
      </>}>
      {loading ? <div className="spinner-wrap"><div className="spinner" /></div> : (
        <div className="table-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>Module</th>
                {ACTIONS.map((a) => <th key={a} style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'center' }}>{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([module, perms]) => {
                const byAction = new Map(perms.map((p) => [p.action, p]));
                return (
                  <tr key={module}>
                    <td>
                      <button className="btn ghost sm" onClick={() => toggleModule(module, perms)} style={{ fontWeight: 650, textTransform: 'capitalize' }}>
                        {module.replace(/_/g, ' ')}
                      </button>
                    </td>
                    {ACTIONS.map((a) => {
                      const p = byAction.get(a);
                      return (
                        <td key={a} style={{ textAlign: 'center' }}>
                          {p ? (
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                          ) : <span className="muted">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
