import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errMsg, downloadExport } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { Badge, DataTable, Field, Modal, fmtMoney, fmtQty, useToast } from '../components/ui';

export default function BoqDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, reload } = useFetch<any>(id ? `/boq/${id}` : null);
  const [editItem, setEditItem] = useState<any>(null);
  const [newItem, setNewItem] = useState<any>(null);

  const totals = data?.totals;

  const saveItem = async (item: any, isNew: boolean) => {
    try {
      if (isNew) {
        const items = [...(data.items || []), item];
        await api.put(`/boq/${id}`, { items });
        toast.push('Item added');
      } else {
        await api.put(`/boq/items/${item.id}`, item);
        toast.push('Item saved');
      }
      setEditItem(null);
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  if (loading || !data) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <>
      <div className="card card-pad">
        <div className="flex gap">
          <div style={{ flex: 1 }}>
            <div className="flex gap-sm"><h2 style={{ margin: 0 }}>{data.title}</h2><Badge value={data.status} /></div>
            <div className="muted" style={{ marginTop: 2 }}><span className="mono">{data.boq_number}</span> · {data.project_name}{data.wing_name ? ` · ${data.wing_name}` : ''}</div>
          </div>
          <div className="flex gap-sm">
            {can('boq.export') && <button className="btn outline sm" onClick={async () => { try { await downloadExport(`/boq/${id}/export`, `${data.boq_number}.csv`); } catch (e) { toast.push(errMsg(e), 'error'); } }}>⬇ Export CSV</button>}
            {can('boq.edit') && <button className="btn primary sm" onClick={() => setNewItem({ unit: 'nos', estimated_qty: 0, rate: 0, actual_qty: 0 })}>+ Add item</button>}
          </div>
        </div>
        <div className="stat-grid" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          <div className="stat-card"><div><div className="lbl">Estimated</div><div className="val" style={{ fontSize: 19 }}>{fmtMoney(totals?.estimated_total)}</div></div></div>
          <div className="stat-card"><div><div className="lbl">Actual</div><div className="val" style={{ fontSize: 19 }}>{fmtMoney(totals?.actual_total)}</div></div></div>
          <div className="stat-card"><div><div className="lbl">Variance</div><div className="val" style={{ fontSize: 19, color: (totals?.variance_total ?? 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(totals?.variance_total)} {totals?.variance_percent != null ? `(${totals.variance_percent}%)` : ''}</div></div></div>
          <div className="stat-card"><div><div className="lbl">Tax ({data.tax_percent}%)</div><div className="val" style={{ fontSize: 19 }}>{fmtMoney(totals?.tax_amount)}</div></div></div>
          <div className="stat-card"><div><div className="lbl">Grand Total</div><div className="val" style={{ fontSize: 19, color: 'var(--brand)' }}>{fmtMoney(totals?.grand_total)}</div></div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>BOQ Items ({data.items?.length ?? 0})</h3></div>
        <DataTable
          rows={data.items || []}
          columns={[
            { key: 'item_code', label: 'Code', render: (i: any) => <span className="mono">{i.item_code || '—'}</span> },
            { key: 'description', label: 'Description', render: (i: any) => <div style={{ maxWidth: 320 }}><div style={{ fontWeight: 500 }}>{i.description}</div>{i.category_name && <div className="muted" style={{ fontSize: 12 }}>{i.category_name}</div>}</div> },
            { key: 'unit', label: 'Unit' },
            { key: 'estimated_qty', label: 'Est. Qty', align: 'right', render: (i: any) => fmtQty(i.estimated_qty) },
            { key: 'rate', label: 'Rate', align: 'right', render: (i: any) => `₹${Number(i.rate).toLocaleString('en-IN')}` },
            { key: 'estimated_amount', label: 'Est. Amt', align: 'right', render: (i: any) => fmtMoney(i.estimated_amount) },
            { key: 'actual_qty', label: 'Act. Qty', align: 'right', render: (i: any) => fmtQty(i.actual_qty) },
            { key: 'actual_amount', label: 'Act. Amt', align: 'right', render: (i: any) => fmtMoney(i.actual_amount) },
            {
              key: 'variance_percent', label: 'Var %', align: 'right',
              render: (i: any) => {
                const vp = i.variance_percent;
                return vp == null ? '—' : <span style={{ color: vp > 0 ? 'var(--danger)' : 'var(--success)' }}>{vp > 0 ? '+' : ''}{vp}%</span>;
              },
            },
            {
              key: '_actions', label: '', align: 'right',
              render: (i: any) => can('boq.edit') ? <button className="btn outline sm" onClick={() => setEditItem({ ...i })}>Edit</button> : null,
            },
          ]}
        />
      </div>

      {(editItem || newItem) && (
        <BoqItemModal
          item={editItem || newItem}
          isNew={!!newItem}
          onClose={() => { setEditItem(null); setNewItem(null); }}
          onSave={saveItem}
        />
      )}
    </>
  );
}

function BoqItemModal({ item, isNew, onClose, onSave }: { item: any; isNew: boolean; onClose: () => void; onSave: (i: any, isNew: boolean) => void }) {
  const [form, setForm] = useState<any>(item);
  const { data: cats } = useFetch<any[]>('/boq/categories');
  const estAmt = (Number(form.estimated_qty) || 0) * (Number(form.rate) || 0);
  const actAmt = (Number(form.actual_qty) || 0) * (Number(form.rate) || 0);
  return (
    <Modal title={isNew ? 'Add BOQ item' : 'Edit BOQ item'} onClose={onClose} size="lg"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave(form, isNew)}>Save</button></>}>
      <div className="form-grid">
        <Field config={{ key: 'item_code', label: 'Item code', type: 'text' }} value={form.item_code} onChange={(v) => setForm((s: any) => ({ ...s, item_code: v }))} />
        <Field config={{ key: 'category_id', label: 'Category', type: 'select', options: (cats || []).map((c: any) => ({ value: c.id, label: c.name })) }} value={form.category_id} onChange={(v) => setForm((s: any) => ({ ...s, category_id: v }))} />
        <div className="full"><Field config={{ key: 'description', label: 'Description', type: 'textarea', required: true }} value={form.description} onChange={(v) => setForm((s: any) => ({ ...s, description: v }))} /></div>
        <Field config={{ key: 'unit', label: 'Unit', type: 'select', options: ['nos', 'cum', 'sqm', 'sqft', 'kg', 'ton', 'meter', 'running meter', 'litre', 'bags', 'item'].map((u) => ({ value: u, label: u })) }} value={form.unit} onChange={(v) => setForm((s: any) => ({ ...s, unit: v }))} />
        <Field config={{ key: 'rate', label: 'Rate (₹)', type: 'number' }} value={form.rate} onChange={(v) => setForm((s: any) => ({ ...s, rate: v }))} />
        <Field config={{ key: 'estimated_qty', label: 'Estimated qty', type: 'number' }} value={form.estimated_qty} onChange={(v) => setForm((s: any) => ({ ...s, estimated_qty: v }))} />
        <Field config={{ key: 'actual_qty', label: 'Actual qty', type: 'number' }} value={form.actual_qty} onChange={(v) => setForm((s: any) => ({ ...s, actual_qty: v }))} />
        <div className="full">
          <div className="card-pad" style={{ background: 'var(--bg)', borderRadius: 10, display: 'flex', gap: 26 }}>
            <span>Estimated amount: <strong>{fmtMoney(estAmt)}</strong></span>
            <span>Actual amount: <strong>{fmtMoney(actAmt)}</strong></span>
            <span>Variance: <strong style={{ color: actAmt - estAmt > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(actAmt - estAmt)}</strong></span>
          </div>
        </div>
        <div className="full"><Field config={{ key: 'remarks', label: 'Remarks', type: 'text' }} value={form.remarks} onChange={(v) => setForm((s: any) => ({ ...s, remarks: v }))} /></div>
      </div>
    </Modal>
  );
}
