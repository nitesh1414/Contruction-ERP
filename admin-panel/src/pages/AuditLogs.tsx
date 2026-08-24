import React, { useState } from 'react';
import { api, downloadExport, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { Badge, DataTable, Modal, PaginationBar, useToast } from '../components/ui';

const MODULES = ['auth', 'users', 'roles', 'projects', 'wings', 'floors', 'units', 'progress', 'milestones', 'drawings', 'materials', 'inventory', 'purchase_orders', 'billing', 'boq', 'test_reports', 'inspections', 'issues', 'workers', 'attendance', 'labour_payments', 'sales', 'documents', 'reports', 'notifications', 'system'];

export default function AuditLogs() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [search, setSearch] = useState('');
  const params: Record<string, any> = { page, limit: 30 };
  if (moduleFilter) params.module = moduleFilter;
  if (userFilter) params.userId = userFilter;
  if (search) params.search = search;
  const { data, loading } = useFetch<any>('/admin/audit-logs', params);
  const { data: users } = useFetch<any[]>('/auth/user-directory');
  const [detail, setDetail] = useState<any>(null);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Audit Logs</h3>
        <div className="actions">
          {can('admin.export') && (
            <button className="btn outline sm" onClick={async () => { try { await downloadExport('/admin/audit-logs/export', 'audit-logs.csv'); } catch (e) { toast.push(errMsg(e), 'error'); } }}>⬇ Export</button>
          )}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="User or record id…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="field"><label>Module</label>
          <select className="input" value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field"><label>User</label>
          <select className="input" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}>
            <option value="">All users</option>
            {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        onRowClick={setDetail}
        columns={[
          { key: 'created_at', label: 'When', render: (a: any) => <span className="nowrap muted">{new Date(a.created_at).toLocaleString()}</span> },
          { key: 'user_name', label: 'User' },
          { key: 'action', label: 'Action', render: (a: any) => <Badge value={a.action === 'delete' ? 'red' : a.action === 'create' ? 'green' : a.action === 'export' ? 'purple' : 'blue'} label={a.action} /> },
          { key: 'module', label: 'Module', render: (a: any) => <span className="mono">{a.module}</span> },
          { key: 'record_id', label: 'Record' },
          { key: 'ip_address', label: 'IP', render: (a: any) => <span className="muted mono" style={{ fontSize: 11 }}>{a.ip_address || '—'}</span> },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={30} onPage={setPage} />
      {detail && (
        <Modal title={`Audit #${detail.id} — ${detail.action} on ${detail.module}`} onClose={() => setDetail(null)} size="lg">
          <div className="kv" style={{ marginBottom: 12 }}>
            <dt>User</dt><dd>{detail.user_name || `user #${detail.user_id}`}</dd>
            <dt>When</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd>
            <dt>IP / agent</dt><dd className="mono" style={{ fontSize: 12 }}>{detail.ip_address || '—'} · {detail.user_agent || '—'}</dd>
          </div>
          {detail.old_value && <><h3>Old value</h3><pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(JSON.parse(detail.old_value), null, 2)}</pre></>}
          {detail.new_value && <><h3>New value</h3><pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(JSON.parse(detail.new_value), null, 2)}</pre></>}
        </Modal>
      )}
    </div>
  );
}
