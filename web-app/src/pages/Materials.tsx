import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { Badge, DataTable, Field, Modal, PaginationBar, fmtDate, fmtQty, useToast } from '../components/ui';
import type { Material, StockRow } from '../api/types';

const TABS = [
  ['materials', 'Materials'], ['stock', 'Stock & Alerts'], ['requirements', 'Requirements'],
  ['pos', 'Purchase Orders'], ['receipts', 'Receipts (GRN)'], ['consumption', 'Consumption'], ['suppliers', 'Suppliers'],
] as const;

export default function Materials() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as typeof TABS[number][0]) || 'materials';
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tabs" style={{ padding: '0 10px' }}>
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setParams({ tab: key })}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'materials' && <CrudPage config={materialsConfig} />}
      {tab === 'stock' && <StockTab />}
      {tab === 'requirements' && <RequirementsTab />}
      {tab === 'pos' && <PurchaseOrdersTab />}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'consumption' && <CrudPage config={consumptionConfig} />}
      {tab === 'suppliers' && <CrudPage config={suppliersConfig} />}
    </>
  );
}

/* ------------------------------- Materials ------------------------------- */
const materialsConfig: CrudConfig<Material> = {
  title: 'Materials',
  singularLabel: 'Material',
  endpoint: '/materials',
  module: 'materials',
  exportPath: '/materials/export',
  columns: [
    { key: 'code', label: 'Code', render: (m) => <span className="mono">{m.code}</span> },
    { key: 'name', label: 'Material', render: (m) => <strong>{m.name}</strong> },
    { key: 'category_name', label: 'Category' },
    { key: 'unit', label: 'Unit' },
    { key: 'min_stock_level', label: 'Min Stock', align: 'right', render: (m) => fmtQty(m.min_stock_level) },
    { key: 'is_active', label: 'Status', render: (m) => <Badge value={m.is_active ? 'completed' : 'cancelled'} label={m.is_active ? 'Active' : 'Inactive'} /> },
  ],
  filters: [{ key: 'categoryId', label: 'Category', type: 'select', optionsEndpoint: '/materials/categories', optionsValueKey: 'id', optionsLabelKey: 'name' } as any],
  fields: () => [
    { key: 'name', label: 'Material name', type: 'text', required: true },
    { key: 'code', label: 'Material code', type: 'text', required: true },
    { key: 'category_id', label: 'Category', type: 'select', optionsEndpoint: '/materials/categories', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'unit', label: 'Unit', type: 'select', options: ['bags', 'kg', 'ton', 'cft', 'cum', 'sqft', 'sqm', 'nos', 'meter', 'litre', 'month'].map((u) => ({ value: u, label: u })) },
    { key: 'min_stock_level', label: 'Min stock level (alert)', type: 'number' },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'text', width: 'full' },
  ],
  defaults: { is_active: true, min_stock_level: 0 },
};

/* --------------------------------- Stock --------------------------------- */
function StockTab() {
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const { data, loading, reload } = useFetch<StockRow[]>('/materials/stock', { ...(search ? { search } : {}), ...(projectId ? { projectId } : {}) });
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: txns } = useFetch<any[]>('/materials/stock/transactions', projectId ? { projectId } : {});
  const [showTxns, setShowTxns] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Stock Position</h3>
        <div className="actions">
          <button className="btn outline sm" onClick={() => setShowTxns(!showTxns)}>{showTxns ? 'Hide transactions' : '📜 Transactions'}</button>
          <button className="btn outline sm" onClick={reload}>↻ Refresh</button>
        </div>
      </div>
      <div className="filter-bar">
        <div className="field grow"><label>Search</label><input className="input" placeholder="Material name or code…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="field"><label>Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All</option>
            {(projects?.data || projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <DataTable<StockRow>
        loading={loading}
        rows={data || []}
        columns={[
          { key: 'material_name', label: 'Material', render: (r) => <div><strong>{r.material_name}</strong><div className="muted mono" style={{ fontSize: 11 }}>{r.material_code}</div></div> },
          { key: 'project_name', label: 'Project' },
          { key: 'total_received', label: 'Received', align: 'right', render: (r) => fmtQty(r.total_received) },
          { key: 'total_consumed', label: 'Consumed', align: 'right', render: (r) => fmtQty(r.total_consumed) },
          { key: 'total_damaged', label: 'Damaged', align: 'right', render: (r) => fmtQty(r.total_damaged) },
          { key: 'total_returned', label: 'Returned', align: 'right', render: (r) => fmtQty(r.total_returned) },
          { key: 'current_stock', label: 'Current Stock', align: 'right', render: (r) => <strong>{fmtQty(r.current_stock)} {r.unit}</strong> },
          { key: 'low_stock', label: 'Alert', render: (r) => (r.low_stock ? <Badge value="high" label="LOW STOCK" /> : <span className="badge green">OK</span>) },
        ]}
        emptyMessage="No stock movements recorded yet"
      />
      {showTxns && (
        <>
          <div className="card-header"><h3>Recent Stock Transactions</h3></div>
          <DataTable
            rows={txns || []}
            columns={[
              { key: 'txn_date', label: 'Date', render: (t: any) => fmtDate(t.txn_date) },
              { key: 'material_name', label: 'Material' },
              { key: 'txn_type', label: 'Type', render: (t: any) => <Badge value={t.txn_type === 'receipt' || t.txn_type === 'opening' ? 'green' : 'high'} label={t.txn_type} /> },
              { key: 'quantity', label: 'Qty', align: 'right', render: (t: any) => <span style={{ color: Number(t.quantity) < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtQty(t.quantity)}</span> },
              { key: 'reference_module', label: 'Reference' },
              { key: 'created_by_name', label: 'By' },
            ]}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------ Requirements ----------------------------- */
function RequirementsTab() {
  const toast = useToast();
  const { can } = useAuth();
  const config: CrudConfig<any> = {
    title: 'Material Requirements',
    singularLabel: 'Requirement',
    endpoint: '/materials/requirements',
    module: 'materials',
    columns: [
      { key: 'requirement_no', label: 'Req No.', render: (r) => <span className="mono">{r.requirement_no}</span> },
      { key: 'material_name', label: 'Material' },
      { key: 'project_name', label: 'Project', render: (r) => <div>{r.project_name}<div className="muted" style={{ fontSize: 12 }}>{r.wing_name || ''}</div></div> },
      { key: 'required_qty', label: 'Qty', align: 'right', render: (r) => `${fmtQty(r.required_qty)} ${r.unit}` },
      { key: 'required_date', label: 'Needed by', render: (r) => fmtDate(r.required_date) },
      { key: 'requested_by_name', label: 'Requested by' },
      statusColumn<any>(),
    ],
    filters: [{ key: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'po_created', 'fulfilled'].map((s) => ({ value: s, label: s })) }],
    fields: () => [
      { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'wing_id', label: 'Wing', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'material_id', label: 'Material', type: 'select', required: true, optionsEndpoint: '/materials', optionsParams: { limit: 500 }, optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'required_qty', label: 'Required quantity', type: 'number', required: true },
      { key: 'unit', label: 'Unit', type: 'select', required: true, options: ['bags', 'kg', 'ton', 'cft', 'cum', 'sqft', 'sqm', 'nos', 'meter', 'litre'].map((u) => ({ value: u, label: u })) },
      { key: 'required_date', label: 'Required date', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'text', width: 'full' },
    ],
    extraActions: (row, reload) => (
      row.status === 'pending' && can('materials.approve') ? (
        <>
          <button className="btn success sm" onClick={async () => { try { await api.put(`/materials/requirements/${row.id}/status`, { status: 'approved' }); toast.push('Approved'); reload(); } catch (e) { toast.push(errMsg(e), 'error'); } }}>Approve</button>
          <button className="btn danger sm" onClick={async () => { try { await api.put(`/materials/requirements/${row.id}/status`, { status: 'rejected' }); toast.push('Rejected'); reload(); } catch (e) { toast.push(errMsg(e), 'error'); } }}>Reject</button>
        </>
      ) : null
    ),
  };
  return <CrudPage config={config} />;
}

/* ----------------------------- Purchase Orders --------------------------- */
function PurchaseOrdersTab() {
  const toast = useToast();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch<any>('/materials/purchase-orders', { page, limit: 15, ...(status ? { status } : {}) });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const openDetail = async (row: any) => {
    try { const res = await api.get(`/materials/purchase-orders/${row.id}`); setDetail(res.data.data); }
    catch (e) { toast.push(errMsg(e), 'error'); }
  };

  const setPoStatus = async (row: any, s: string) => {
    try { await api.put(`/materials/purchase-orders/${row.id}/status`, { status: s }); toast.push(`PO ${s.replace(/_/g, ' ')}`); reload(); }
    catch (e) { toast.push(errMsg(e), 'error'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Purchase Orders</h3>
        <div className="actions">
          {can('materials.create') && <button className="btn primary sm" onClick={() => setCreateOpen(true)}>+ New PO</button>}
        </div>
      </div>
      <div className="filter-bar">
        <div className="field">
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        onRowClick={openDetail}
        columns={[
          { key: 'po_number', label: 'PO No.', render: (r: any) => <span className="mono">{r.po_number}</span> },
          { key: 'supplier_name', label: 'Supplier' },
          { key: 'project_name', label: 'Project' },
          { key: 'po_date', label: 'Date', render: (r: any) => fmtDate(r.po_date) },
          { key: 'expected_delivery_date', label: 'Expected', render: (r: any) => fmtDate(r.expected_delivery_date) },
          { key: 'grand_total', label: 'Total', align: 'right', render: (r: any) => `₹${Number(r.grand_total).toLocaleString('en-IN')}` },
          { key: 'status', label: 'Status', render: (r: any) => <Badge value={r.status} /> },
          {
            key: '_actions', label: '', align: 'right',
            render: (r: any) => (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                {r.status === 'draft' && can('materials.edit') && <button className="btn outline sm" onClick={() => setPoStatus(r, 'pending_approval')}>Submit</button>}
                {r.status === 'pending_approval' && can('materials.approve') && <button className="btn success sm" onClick={() => setPoStatus(r, 'approved')}>Approve</button>}
                {r.status === 'approved' && can('materials.edit') && <button className="btn outline sm" onClick={() => setPoStatus(r, 'sent')}>Mark sent</button>}
              </div>
            ),
          },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />
      {createOpen && <PoCreateModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload(); }} />}
      {detail && <PoDetailModal po={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload(); }} />}
    </div>
  );
}

interface PoItem { material_id: number | null; quantity: number | null; unit: string; rate: number | null; tax_percent: number | null; }

function PoCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data: suppliers } = useFetch<any>('/materials/suppliers', { limit: 300 });
  const { data: materials } = useFetch<any>('/materials', { limit: 500 });
  const [form, setForm] = useState<Record<string, any>>({ po_date: new Date().toISOString().slice(0, 10), discount: 0 });
  const [items, setItems] = useState<PoItem[]>([{ material_id: null, quantity: 1, unit: 'kg', rate: 0, tax_percent: 18 }]);
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0);
  const tax = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0) * ((Number(i.tax_percent) || 0) / 100), 0);
  const grand = subtotal + tax - (Number(form.discount) || 0);

  const save = async () => {
    if (!form.project_id || !form.supplier_id) { toast.push('Project and supplier are required', 'error'); return; }
    if (items.some((i) => !i.material_id || !i.quantity)) { toast.push('Complete all PO items', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/materials/purchase-orders', { ...form, items });
      toast.push('Purchase order created');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const supplierOpts = (suppliers?.data || []).map((s: any) => ({ value: s.id, label: s.name }));
  const materialOpts = (materials?.data || []).map((m: any) => ({ value: m.id, label: `${m.name} (${m.unit})` }));

  return (
    <Modal title="New Purchase Order" onClose={onClose} size="xl"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create PO'}</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: (projects?.data || []).map((p: any) => ({ value: p.id, label: p.name })) }} value={form.project_id} onChange={(v) => setForm((s) => ({ ...s, project_id: v }))} />
        <Field config={{ key: 'supplier_id', label: 'Supplier', type: 'select', required: true, options: supplierOpts }} value={form.supplier_id} onChange={(v) => setForm((s) => ({ ...s, supplier_id: v }))} />
        <Field config={{ key: 'po_date', label: 'PO date', type: 'date', required: true }} value={form.po_date} onChange={(v) => setForm((s) => ({ ...s, po_date: v }))} />
        <Field config={{ key: 'expected_delivery_date', label: 'Expected delivery', type: 'date' }} value={form.expected_delivery_date} onChange={(v) => setForm((s) => ({ ...s, expected_delivery_date: v }))} />
        <Field config={{ key: 'discount', label: 'Discount (₹)', type: 'number' }} value={form.discount} onChange={(v) => setForm((s) => ({ ...s, discount: v }))} />
        <Field config={{ key: 'remarks', label: 'Remarks', type: 'text' }} value={form.remarks} onChange={(v) => setForm((s) => ({ ...s, remarks: v }))} />
      </div>

      <h3>Items</h3>
      <div className="table-responsive table-wrap">
        <table className="table table-striped table-hover data">
          <thead><tr><th style={{ width: 260 }}>Material</th><th>Qty</th><th>Unit</th><th>Rate ₹</th><th>Tax %</th><th className="right">Amount</th><th /></tr></thead>
          <tbody>
            {items.map((item, idx) => {
              const amt = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
              const amtTax = amt * ((Number(item.tax_percent) || 0) / 100);
              return (
                <tr key={idx}>
                  <td>
                    <select className="input" value={item.material_id ?? ''} onChange={(e) => setItems((s) => s.map((x, j) => j === idx ? { ...x, material_id: e.target.value ? Number(e.target.value) : null, unit: materials?.data?.find((m: any) => m.id === Number(e.target.value))?.unit || x.unit } : x))}>
                      <option value="">Select material…</option>
                      {materialOpts.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" style={{ width: 90 }} value={item.quantity ?? ''} onChange={(e) => setItems((s) => s.map((x, j) => j === idx ? { ...x, quantity: e.target.value ? Number(e.target.value) : null } : x))} /></td>
                  <td><input className="input" style={{ width: 80 }} value={item.unit} onChange={(e) => setItems((s) => s.map((x, j) => j === idx ? { ...x, unit: e.target.value } : x))} /></td>
                  <td><input className="input" type="number" style={{ width: 100 }} value={item.rate ?? ''} onChange={(e) => setItems((s) => s.map((x, j) => j === idx ? { ...x, rate: e.target.value ? Number(e.target.value) : null } : x))} /></td>
                  <td><input className="input" type="number" style={{ width: 70 }} value={item.tax_percent ?? ''} onChange={(e) => setItems((s) => s.map((x, j) => j === idx ? { ...x, tax_percent: e.target.value ? Number(e.target.value) : null } : x))} /></td>
                  <td className="right num">₹{(amt + amtTax).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td>{items.length > 1 && <button className="btn outline sm" onClick={() => setItems((s) => s.filter((_, j) => j !== idx))}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="btn outline sm" onClick={() => setItems((s) => [...s, { material_id: null, quantity: 1, unit: 'kg', rate: 0, tax_percent: 18 }])}>+ Add item</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 26, marginTop: 14, fontSize: 14 }}>
        <span>Subtotal: <strong>₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
        <span>Tax: <strong>₹{tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
        <span style={{ color: 'var(--brand)', fontSize: 16 }}>Grand total: <strong>₹{grand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
      </div>
    </Modal>
  );
}

function PoDetailModal({ po, onClose, onChanged }: { po: any; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [receiptItems, setReceiptItems] = useState<Record<number, { received: number; damaged: number }>>({});
  const [busy, setBusy] = useState(false);

  const recordReceipt = async () => {
    const items = po.items.filter((it: any) => (receiptItems[it.id]?.received ?? 0) > 0).map((it: any) => ({
      po_item_id: it.id, material_id: it.material_id, unit: it.unit,
      received_qty: Number(receiptItems[it.id].received) || 0,
      damaged_qty: Number(receiptItems[it.id].damaged) || 0,
    }));
    if (!items.length) { toast.push('Enter at least one received quantity', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/materials/receipts', {
        po_id: po.id, project_id: po.project_id, receipt_date: new Date().toISOString().slice(0, 10), items,
      });
      toast.push('Receipt recorded — stock updated');
      onChanged();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={`PO ${po.po_number}`} onClose={onClose} size="xl">
      <div className="kv" style={{ marginBottom: 12 }}>
        <dt>Supplier</dt><dd>{po.supplier_name}</dd>
        <dt>Project</dt><dd>{po.project_name}</dd>
        <dt>Status</dt><dd><Badge value={po.status} /></dd>
        <dt>Total</dt><dd><strong>₹{Number(po.grand_total).toLocaleString('en-IN')}</strong> <span className="muted">(incl. tax ₹{Number(po.tax_amount).toLocaleString('en-IN')})</span></dd>
      </div>

      <DataTable
        rows={po.items || []}
        columns={[
          { key: 'material_name', label: 'Material' },
          { key: 'quantity', label: 'Ordered', align: 'right', render: (i: any) => `${fmtQty(i.quantity)} ${i.unit}` },
          { key: 'received_qty', label: 'Received', align: 'right', render: (i: any) => `${fmtQty(i.received_qty)} ${i.unit}` },
          { key: 'rate', label: 'Rate', align: 'right', render: (i: any) => `₹${Number(i.rate)}` },
          { key: 'amount', label: 'Amount', align: 'right', render: (i: any) => `₹${Number(i.amount).toLocaleString('en-IN')}` },
        ]}
      />

      {can('materials.create') && ['approved', 'sent', 'partially_received'].includes(po.status) && (
        <div className="card-pad" style={{ background: 'var(--bg)', borderRadius: 10, marginTop: 14 }}>
          <h3>Record Receipt (GRN)</h3>
          {(po.items || []).map((it: any) => {
            const remaining = Number(it.quantity) - Number(it.received_qty);
            return (
              <div key={it.id} className="flex gap-sm" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 160 }}>{it.material_name} <span className="muted">(pending {fmtQty(remaining)} {it.unit})</span></span>
                <input className="input" type="number" style={{ width: 110 }} placeholder="Received" value={receiptItems[it.id]?.received ?? ''} onChange={(e) => setReceiptItems((s) => ({ ...s, [it.id]: { ...(s[it.id] || { damaged: 0 }), received: Number(e.target.value) } }))} />
                <input className="input" type="number" style={{ width: 110 }} placeholder="Damaged" value={receiptItems[it.id]?.damaged ?? ''} onChange={(e) => setReceiptItems((s) => ({ ...s, [it.id]: { ...(s[it.id] || { received: 0 }), damaged: Number(e.target.value) } }))} />
              </div>
            );
          })}
          <button className="btn primary sm" onClick={recordReceipt} disabled={busy}>{busy ? 'Saving…' : 'Save GRN'}</button>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------- Receipts ------------------------------- */
function ReceiptsTab() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch<any>('/materials/receipts', { page, limit: 15 });
  const [detail, setDetail] = useState<any>(null);
  const openDetail = async (row: any) => {
    try { const res = await api.get(`/materials/receipts/${row.id}`); setDetail(res.data.data); } catch (e) { toast.push(errMsg(e), 'error'); }
  };
  return (
    <div className="card">
      <div className="card-header"><h3>Material Receipts (GRN)</h3></div>
      <DataTable
        loading={loading}
        rows={data?.data || []}
        onRowClick={openDetail}
        columns={[
          { key: 'grn_number', label: 'GRN No.', render: (r: any) => <span className="mono">{r.grn_number}</span> },
          { key: 'receipt_date', label: 'Date', render: (r: any) => fmtDate(r.receipt_date) },
          { key: 'supplier_name', label: 'Supplier' },
          { key: 'project_name', label: 'Project' },
          { key: 'po_number', label: 'PO Ref', render: (r: any) => r.po_number ? <span className="mono">{r.po_number}</span> : '—' },
          { key: 'challan_number', label: 'Challan' },
        ]}
      />
      <PaginationBar page={page} total={data?.pagination?.total ?? 0} limit={15} onPage={setPage} />
      {detail && (
        <Modal title={`GRN ${detail.grn_number}`} onClose={() => setDetail(null)} size="lg">
          <div className="kv" style={{ marginBottom: 12 }}>
            <dt>Supplier</dt><dd>{detail.supplier_name || '—'}</dd>
            <dt>Project</dt><dd>{detail.project_name}</dd>
            <dt>Challan</dt><dd>{detail.challan_number || '—'}</dd>
          </div>
          <DataTable
            rows={detail.items || []}
            columns={[
              { key: 'material_name', label: 'Material' },
              { key: 'received_qty', label: 'Received', align: 'right', render: (i: any) => `${fmtQty(i.received_qty)} ${i.unit}` },
              { key: 'damaged_qty', label: 'Damaged', align: 'right', render: (i: any) => (Number(i.damaged_qty) > 0 ? <span style={{ color: 'var(--danger)' }}>{fmtQty(i.damaged_qty)}</span> : '0') },
              { key: 'accepted_qty', label: 'Accepted', align: 'right', render: (i: any) => <strong>{fmtQty(i.accepted_qty)} {i.unit}</strong> },
            ]}
          />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------ Consumption ------------------------------ */
const consumptionConfig: CrudConfig<any> = {
  title: 'Material Consumption',
  singularLabel: 'Consumption',
  endpoint: '/materials/consumption',
  module: 'materials',
  columns: [
    { key: 'consumption_date', label: 'Date', render: (r: any) => fmtDate(r.consumption_date) },
    { key: 'material_name', label: 'Material' },
    { key: 'project_name', label: 'Project' },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r: any) => `${fmtQty(r.quantity)} ${r.unit}` },
    { key: 'location', label: 'Location' },
    { key: 'wing_name', label: 'Wing' },
    { key: 'used_by_name', label: 'By' },
  ],
  fields: () => [
    { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'wing_id', label: 'Wing', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'material_id', label: 'Material', type: 'select', required: true, optionsEndpoint: '/materials', optionsParams: { limit: 500 }, optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'unit', label: 'Unit', type: 'select', required: true, options: ['bags', 'kg', 'ton', 'cft', 'cum', 'sqft', 'sqm', 'nos', 'meter', 'litre'].map((u) => ({ value: u, label: u })) },
    { key: 'consumption_date', label: 'Date', type: 'date', required: true },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'remarks', label: 'Remarks', type: 'text' },
  ],
  defaults: { consumption_date: new Date().toISOString().slice(0, 10), unit: 'kg' },
};

/* ------------------------------- Suppliers ------------------------------- */
const suppliersConfig: CrudConfig<any> = {
  title: 'Suppliers',
  singularLabel: 'Supplier',
  endpoint: '/materials/suppliers',
  module: 'materials',
  columns: [
    { key: 'name', label: 'Supplier', render: (s: any) => <strong>{s.name}</strong> },
    { key: 'code', label: 'Code', render: (s: any) => <span className="mono">{s.code || '—'}</span> },
    { key: 'contact_person', label: 'Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'gst_number', label: 'GST No', render: (s: any) => <span className="mono" style={{ fontSize: 11 }}>{s.gst_number || '—'}</span> },
    { key: 'city', label: 'City' },
  ],
  fields: () => [
    { key: 'name', label: 'Supplier name', type: 'text', required: true },
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'contact_person', label: 'Contact person', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'gst_number', label: 'GST number', type: 'text' },
    { key: 'address', label: 'Address', type: 'text', width: 'full' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'pincode', label: 'PIN', type: 'text' },
  ],
};
