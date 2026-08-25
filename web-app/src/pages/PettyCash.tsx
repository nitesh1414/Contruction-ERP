import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api/client';
import { useFetch } from '../hooks/useFetch';
import { useDebounce } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { fmtDate, fmtMoney, Modal, PaginationBar, DataTable, ConfirmDialog, useToast, Field } from '../components/ui';
import type { ColumnConfig, FieldConfig } from '../api/types';

const CATEGORIES = [
  { v: 'travel',           l: 'Travel / conveyance' },
  { v: 'food_catering',    l: 'Food / catering' },
  { v: 'fuel',             l: 'Fuel & lubricants' },
  { v: 'labour_incentive', l: 'Labour incentives' },
  { v: 'tools',            l: 'Tools & consumables' },
  { v: 'office_admin',     l: 'Office & admin' },
  { v: 'misc',             l: 'Misc' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

const FIELDS: FieldConfig[] = [
  { key: 'txn_type', label: 'Txn type', type: 'select', required: true, options: [
    { value: 'topup', label: 'Top-up (cash in)' }, { value: 'expense', label: 'Expense' }, { value: 'replenish', label: 'Replenish / return' } ] },
  { key: 'txn_date', label: 'Date', type: 'date', required: true },
  { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => ({ value: c.v, label: c.l })) },
  { key: 'paid_to', label: 'Paid to', placeholder: 'Vendor / person' },
  { key: 'received_by', label: 'Received by', placeholder: 'Site staff' },
  { key: 'description', label: 'Description' },
  { key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' },
];

function SummaryCards({ projectId }: { projectId?: number }) {
  const { data, loading } = useFetch<any>(projectId ? `/petty-cash/summary?projectId=${projectId}` : null);
  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (!data) return <div className="card card-pad empty">Choose a project to view petty-cash summary.</div>;
  const { balance, total_topup, total_expense, byCategory = [], recent = [] } = data;
  const topCat = byCategory[0];
  return (
    <div className="grid-3">
      <div className="card">
        <div className="card-header"><h3>Cash on hand</h3></div>
        <div className="card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--brand-soft)', display: 'grid', placeItems: 'center', fontSize: 32 }}>💵</div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 780, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{fmtMoney(balance)}</div>
            <div className="muted" style={{ fontSize: 13 }}>Top-ups {fmtMoney(total_topup)} − Expenses {fmtMoney(total_expense)}</div>
          </div>
        </div>
      </div>
      <div className="card col-12">
        <div className="card-header"><h3>Spend by category (this project)</h3></div>
        {byCategory.length === 0 ? <div className="empty">No expenses recorded yet.</div> : (
          <div className="card-pad">
            {byCategory.map((c: any) => (
              <div key={c.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)', gap: 12 }}>
                <div style={{ fontWeight: 600 }}>{CATEGORY_LABEL[c.category] || c.category}</div>
                <div className="flex gap-sm" style={{ flex: 1 }}>
                  <div style={{ height: 8, borderRadius: 100, background: 'var(--brand)', width: `${Math.min(100, (Number(c.amount) / Number(byCategory[0].amount)) * 100)}%` }} />
                </div>
                <div style={{ minWidth: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{fmtMoney(c.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card col-12">
        <div className="card-header"><h3>Recent activity</h3></div>
        {recent.length === 0 ? <div className="empty">No activity yet.</div> : (
          <ul className="pending-list">
            {recent.slice(0, 5).map((r: any) => (
              <li key={r.id}>
                <span className={`badge ${r.txn_type === 'topup' ? 'green' : r.txn_type === 'replenish' ? 'blue' : 'orange'}`}>{r.txn_type}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{r.description || (r.paid_to || 'Top-up')}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{fmtDate(r.txn_date)}{r.paid_to ? ` · Paid to ${r.paid_to}` : ''}</div>
                </div>
                <strong>{fmtMoney(r.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function PettyCash() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [projectId, setProjectId] = useState<string>('');
  const debounced = useDebounce(search);
  const params = useMemo(() => ({
    page, limit: 20, search: debounced,
    projectId: projectId || undefined,
    ...Object.fromEntries(Object.entries(filterValues).filter(([_, v]) => v !== '')),
  }), [page, debounced, projectId, filterValues]);
  const { data, loading, reload } = useFetch<any>('/petty-cash', params);
  const rows = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<any>(null);
  const [delBusy, setDelBusy] = useState(false);

  const openNew = () => { setForm({ txn_type: 'expense', txn_date: new Date().toISOString().slice(0, 10), project_id: projectId ? Number(projectId) : undefined }); setEdit('new'); };
  const openEdit = (row: any) => { setForm({ ...row }); setEdit(row); };
  const save = async () => {
    setSaving(true);
    try {
      if (!form.project_id) { toast.push('Pick a project', 'error'); setSaving(false); return; }
      const payload = { ...form, project_id: Number(form.project_id) };
      if (edit === 'new') { await api.post('/petty-cash', payload); toast.push('Entry created'); }
      else { await api.put(`/petty-cash/${edit.id}`, payload); toast.push('Entry saved'); }
      setEdit(null); reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setSaving(false); }
  };
  const doDel = async () => {
    if (!del) return;
    setDelBusy(true);
    try { await api.delete(`/petty-cash/${del.id}`); toast.push('Deleted'); setDel(null); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
    finally { setDelBusy(false); }
  };
  const columns: ColumnConfig<any>[] = [
    { key: 'txn_date', label: 'Date', render: (r) => fmtDate(r.txn_date) },
    { key: 'txn_type', label: 'Type', render: (r) => <span className={`badge ${r.txn_type === 'topup' ? 'green' : r.txn_type === 'replenish' ? 'blue' : 'orange'}`}>{r.txn_type}</span> },
    { key: 'category', label: 'Category', render: (r) => CATEGORY_LABEL[r.category] || '—' },
    { key: 'paid_to', label: 'Paid to', render: (r) => r.paid_to || '—' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    { key: 'amount', label: 'Amount (₹)', render: (r) => <span className="num right" style={{ display: 'block' }}>{fmtMoney(r.amount)}</span>, align: 'right' },
    { key: 'project_name', label: 'Project' },
    { key: '_a', label: '', align: 'right',
      render: (row) => (
        <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
          {can('billing.edit') && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</button>}
          {can('billing.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setDel(row); }}>Delete</button>}
        </div>
      ) },
  ];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Site petty cash</h3>
          <div className="actions muted" style={{ fontSize: 12, marginRight: 10 }}>Record top-ups, expenses, and replenishments by site</div>
          {can('billing.create') && <button className="btn primary sm" onClick={openNew}>+ Add entry</button>}
        </div>
        <div className="filter-bar">
          <div className="field">
            <label>Project ID</label>
            <input className="input" type="number" placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
          </div>
          <div className="field grow">
            <label>Search</label>
            <input className="input" placeholder="Description, paid to…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" value={filterValues.txn_type || ''} onChange={(e) => { setFilterValues((s) => ({ ...s, txn_type: e.target.value })); setPage(1); }}>
              <option value="">All</option><option value="topup">Top-up</option><option value="expense">Expense</option><option value="replenish">Replenish</option>
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            <select className="input" value={filterValues.category || ''} onChange={(e) => { setFilterValues((s) => ({ ...s, category: e.target.value })); setPage(1); }}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
        </div>
      </div>
      {projectId && <SummaryCards projectId={Number(projectId)} />}
      <div className="card">
        <div className="card-header"><h3>Entries</h3></div>
        <DataTable columns={columns} rows={rows} loading={loading} rowKey="id" />
        <PaginationBar page={page} total={total} limit={20} onPage={setPage} />
      </div>

      {edit !== null && (
        <Modal title={edit === 'new' ? 'New petty-cash entry' : 'Edit petty-cash entry'} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
                  <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="form-grid">
            {!projectId && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Project ID</label>
                <input className="input" type="number" value={form.project_id || ''} onChange={(e) => setForm({ ...form, project_id: e.target.value })} />
              </div>
            )}
            {FIELDS.map((f) => <div style={{ gridColumn: f.width === 'full' ? '1 / -1' : 'auto' }} key={f.key}><Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} /></div>)}
          </div>
        </Modal>
      )}
      {del && <ConfirmDialog message={`Delete petty-cash entry "${del.description || del.paid_to}"? This cannot be undone.`} onCancel={() => setDel(null)} onConfirm={doDel} busy={delBusy} />}
    </>
  );
}
