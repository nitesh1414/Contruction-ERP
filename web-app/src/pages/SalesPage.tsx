import React, { useState } from 'react';
import CrudPage, { CrudConfig } from '../components/CrudPage';
import { api, errMsg, downloadExport } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, DataTable, Field, Modal, StatCard, fmtDate, fmtMoney, useToast,
} from '../components/ui';

export default function SalesPage() {
  const { data: availability } = useFetch<any[]>('/sales/unit-availability');
  const { data: summary } = useFetch<any>('/sales/summary');
  const totals = summary?.totals;
  const tunnels = (availability || []).reduce((acc: any, r: any) => { acc[r.status] = (acc[r.status] || 0) + Number(r.count); return acc; }, {});
  const { can } = useAuth();
  const toast = useToast();

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard icon="🏠" label="Units Sold" value={totals?.units_sold ?? 0} sub={`${tunnels.available ?? 0} available`} color="#f1e9fe" />
        <StatCard icon="💰" label="Sales Value" value={fmtMoney(totals?.value)} color="#e0f2fe" />
        <StatCard icon="✅" label="Collected" value={fmtMoney(totals?.received)} color="#dcfcee" />
        <StatCard icon="⏳" label="Pending Collections" value={fmtMoney(totals?.pending)} color="#fee8e8" />
        {can('sales.export') && (
          <div className="stat-card">
            <div className="ic" style={{ background: 'var(--brand-soft)' }}>📑</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="lbl">Sales register</div>
              <button className="btn primary sm" onClick={async () => { try { await downloadExport('/sales/export', 'sales.csv'); } catch (e) { toast.push(errMsg(e), 'error'); } }}>⬇ Export CSV</button>
            </div>
          </div>
        )}
      </div>
      <SalesTable />
    </>
  );
}

function SalesTable() {
  const toast = useToast();
  const { can } = useAuth();
  const [paymentFor, setPaymentFor] = useState<any>(null);

  const config: CrudConfig<any> = {
    title: 'Unit Sales',
    singularLabel: 'Sale',
    endpoint: '/sales',
    module: 'sales',
    createLabel: 'New Sale',
    columns: [
      { key: 'unit_number', label: 'Unit', render: (s: any) => <div><strong>{s.unit_number}</strong><div className="muted" style={{ fontSize: 12 }}>{s.wing_name}{s.floor_name ? ` · ${s.floor_name}` : ''} · {s.unit_type || ''}</div></div> },
      { key: 'customer_name', label: 'Customer', render: (s: any) => <div>{s.customer_name}<div className="muted" style={{ fontSize: 12 }}>{s.customer_phone || ''}</div></div> },
      { key: 'sale_date', label: 'Sale date', render: (s: any) => fmtDate(s.sale_date) },
      { key: 'sale_amount', label: 'Amount', align: 'right', render: (s: any) => <div>{fmtMoney(s.sale_amount)}{Number(s.gst_amount) > 0 && <div className="muted" style={{ fontSize: 11 }}>incl GST {fmtMoney(s.gst_amount)}</div>}</div> },
      { key: 'amount_received', label: 'Received', align: 'right', render: (s: any) => fmtMoney(s.amount_received) },
      { key: 'pending_amount', label: 'Pending', align: 'right', render: (s: any) => (Number(s.pending_amount) > 0 ? <span style={{ color: 'var(--danger)' }}>{fmtMoney(s.pending_amount)}</span> : '—') },
      { key: 'payment_status', label: 'Payment', render: (s: any) => <Badge value={s.payment_status} /> },
      { key: 'is_gst', label: 'GST', render: (s: any) => (s.is_gst ? <Badge value="info" label="GST" /> : <span className="muted">—</span>) },
    ],
    filters: [
      { key: 'payment_status', label: 'Payment', type: 'select', options: ['pending', 'partially_paid', 'paid', 'overdue'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
      { key: 'is_gst', label: 'GST', type: 'select', options: [{ value: '1', label: 'GST' }, { value: '0', label: 'Non-GST' }] },
    ],
    fields: () => [
      { key: 'unit_id', label: 'Unit', type: 'select', required: true, optionsEndpoint: '/units', optionsParams: { status: 'available' }, optionsValueKey: 'id', optionsLabelKey: 'unit_number' } as any,
      { key: 'customer_name', label: 'Customer name', type: 'text', required: true },
      { key: 'customer_phone', label: 'Customer mobile', type: 'text' },
      { key: 'sale_amount', label: 'Sale amount (₹)', type: 'number', required: true },
      { key: 'amount_received', label: 'Amount received (₹)', type: 'number' },
      { key: 'booking_date', label: 'Booking date', type: 'date' },
      { key: 'sale_date', label: 'Sale date', type: 'date' },
      { key: 'is_gst', label: 'GST applicable (5%)', type: 'checkbox' },
      { key: 'gst_percent', label: 'GST % (if applicable)', type: 'number' },
      { key: 'other_charges', label: 'Other charges (₹)', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'booked', label: 'Booked' }, { value: 'sold', label: 'Sold' }] },
    ],
    defaults: { booking_date: new Date().toISOString().slice(0, 10), sale_date: new Date().toISOString().slice(0, 10), status: 'sold', is_gst: true },
    extraActions: (row, reload) => (
      Number(row.pending_amount) > 0 && can('sales.create') ? (
        <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); setPaymentFor({ ...row, reload }); }}>+ Payment</button>
      ) : null
    ),
  };

  return (
    <>
      <CrudPage config={config} />
      {paymentFor && <AddPaymentModal sale={paymentFor} onClose={() => { setPaymentFor(null); }} onSaved={() => { setPaymentFor(null); paymentFor.reload?.(); }} />}
    </>
  );
}

function AddPaymentModal({ sale, onClose, onSaved }: { sale: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: detail } = useFetch<any>(`/sales/${sale.id}`);
  const [form, setForm] = useState<Record<string, any>>({ payment_date: new Date().toISOString().slice(0, 10), payment_mode: 'bank_transfer', amount: sale.pending_amount });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.push('Enter a valid amount', 'error'); return; }
    setBusy(true);
    try {
      await api.post(`/sales/${sale.id}/payments`, form);
      toast.push('Payment recorded');
      onSaved();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Collect payment — Unit ${sale.unit_number}`} onClose={onClose} size="md"
      footer={<><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button></>}>
      <div className="kv" style={{ marginBottom: 12 }}>
        <dt>Customer</dt><dd>{sale.customer_name}</dd>
        <dt>Pending</dt><dd><strong style={{ color: 'var(--danger)' }}>{fmtMoney(sale.pending_amount)}</strong></dd>
      </div>
      <div className="form-grid">
        <Field config={{ key: 'amount', label: 'Amount (₹)', type: 'number', required: true }} value={form.amount} onChange={(v) => setForm((s) => ({ ...s, amount: v }))} />
        <Field config={{ key: 'payment_date', label: 'Payment date', type: 'date', required: true }} value={form.payment_date} onChange={(v) => setForm((s) => ({ ...s, payment_date: v }))} />
        <Field config={{ key: 'payment_mode', label: 'Mode', type: 'select', options: ['online', 'bank_transfer', 'upi', 'cheque', 'cash'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) }} value={form.payment_mode} onChange={(v) => setForm((s) => ({ ...s, payment_mode: v }))} />
        <Field config={{ key: 'is_gst', label: 'Includes GST', type: 'checkbox' }} value={form.is_gst ?? true} onChange={(v) => setForm((s) => ({ ...s, is_gst: v }))} />
        <div className="full"><Field config={{ key: 'reference_number', label: 'Reference / UTR', type: 'text' }} value={form.reference_number} onChange={(v) => setForm((s) => ({ ...s, reference_number: v }))} /></div>
      </div>
      {detail?.payments?.length > 0 && (
        <>
          <h3 style={{ marginTop: 10 }}>Payment History</h3>
          <DataTable
            rows={detail.payments}
            columns={[
              { key: 'payment_date', label: 'Date', render: (p: any) => fmtDate(p.payment_date) },
              { key: 'amount', label: 'Amount', align: 'right', render: (p: any) => fmtMoney(p.amount) },
              { key: 'payment_mode', label: 'Mode' },
              { key: 'reference_number', label: 'Ref' },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
