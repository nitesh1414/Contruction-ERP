import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { useFetch } from '../hooks/useFetch';
import { Badge, StatCard, fmtDate, fmtMoney, fmtQty } from '../components/ui';

const CONSUMABLE_CATS = ['Cement', 'Bricks', 'Sand', 'Steel', 'Aggregate', 'Tiles', 'Pipes', 'Electrical', 'Paint', 'Other'];
const NON_CONSUMABLE_CATS = ['Machinery', 'Equipment', 'Crane charges', 'Excavator charges', 'Vehicle charges', 'Rental equipment'];

const config: CrudConfig<any> = {
  title: 'Cost / Billing Entries',
  singularLabel: 'Cost Entry',
  endpoint: '/billing/cost-entries',
  module: 'billing',
  exportPath: '/billing/cost-entries/export',
  createLabel: 'New Cost Entry',
  columns: [
    { key: 'entry_date', label: 'Date', render: (r: any) => fmtDate(r.entry_date) },
    { key: 'entry_type', label: 'Type', render: (r: any) => <Badge value={r.entry_type === 'consumable' ? 'info' : r.entry_type === 'non_consumable' ? 'purple' : r.entry_type === 'labour' ? 'issues' as any : 'gray'} label={r.entry_type.replace(/_/g, ' ')} /> },
    { key: 'description', label: 'Description', render: (r: any) => <div style={{ maxWidth: 240 }}><div style={{ fontWeight: 500 }}>{r.description || r.category || '—'}</div><div className="muted" style={{ fontSize: 12 }}>{r.project_name}{r.wing_name ? ` · ${r.wing_name}` : ''}</div></div> },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r: any) => (r.quantity ? `${fmtQty(r.quantity)} ${r.unit || ''}` : '—') },
    { key: 'total_amount', label: 'Total', align: 'right', render: (r: any) => fmtMoney(r.total_amount) },
    { key: 'paid_amount', label: 'Paid', align: 'right', render: (r: any) => fmtMoney(r.paid_amount) },
    { key: 'pending_amount', label: 'Pending', align: 'right', render: (r: any) => (Number(r.pending_amount) > 0 ? <span style={{ color: 'var(--danger)' }}>{fmtMoney(r.pending_amount)}</span> : '—') },
    statusColumn<any>('payment_status', 'Payment'),
  ],
  filters: [
    { key: 'entry_type', label: 'Type', type: 'select', options: ['consumable', 'non_consumable', 'labour', 'other'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
    { key: 'payment_status', label: 'Payment', type: 'select', options: ['unpaid', 'partial', 'paid'].map((s) => ({ value: s, label: s })) },
    { key: 'projectId', label: 'Project', type: 'select', optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
  ],
  fields: (item) => {
    const type = (item as any)?.entry_type || 'consumable';
    void type;
    return [
      { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'wing_id', label: 'Wing', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'entry_type', label: 'Type', type: 'select', required: true, options: ['consumable', 'non_consumable', 'labour', 'other'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
      { key: 'category', label: 'Category', type: 'select', options: [...CONSUMABLE_CATS, ...NON_CONSUMABLE_CATS].map((s) => ({ value: s, label: s })) },
      { key: 'description', label: 'Description', type: 'text', width: 'full' },
      { key: 'entry_date', label: 'Date', type: 'date', required: true },
      { key: 'bill_number', label: 'Bill / invoice no', type: 'text' },
      { key: 'bill_date', label: 'Bill date', type: 'date' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'rate', label: 'Rate (₹)', type: 'number' },
      { key: 'tax_percent', label: 'Tax/GST %', type: 'number' },
      { key: 'paid_amount', label: 'Paid amount (₹)', type: 'number' },
      { key: 'supplier_id', label: 'Vendor / supplier', type: 'select', optionsEndpoint: '/materials/suppliers', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
      { key: 'remarks', label: 'Remarks', type: 'text', width: 'full' },
    ];
  },
  defaults: { entry_type: 'consumable', entry_date: new Date().toISOString().slice(0, 10), tax_percent: 18 },
};

export default function Billing() {
  const { data: summary } = useFetch<any[]>('/billing/summary');
  const totalCost = (summary || []).reduce((s: number, r: any) => s + Number(r.total_cost), 0);
  const totalPaid = (summary || []).reduce((s: number, r: any) => s + Number(r.total_paid), 0);
  const totalPending = (summary || []).reduce((s: number, r: any) => s + Number(r.total_pending), 0);
  const chartData = (summary || []).map((r: any) => ({
    name: r.project_name?.length > 12 ? `${r.project_name.slice(0, 11)}…` : r.project_name,
    Consumables: +(Number(r.consumable_cost) / 100000).toFixed(1),
    Equipment: +(Number(r.non_consumable_cost) / 100000).toFixed(1),
    Labour: +(Number(r.labour_cost) / 100000).toFixed(1),
  }));

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard icon="💰" label="Total Cost" value={fmtMoney(totalCost)} color="#e8f0fe" />
        <StatCard icon="✅" label="Paid" value={fmtMoney(totalPaid)} color="#dcfcee" />
        <StatCard icon="⏳" label="Pending Payments" value={fmtMoney(totalPending)} color="#fee8e8" />
        {chartData.length > 0 && (
          <div className="card stat-card" style={{ gridColumn: 'span 2', minWidth: 300 }}>
            <div style={{ width: '100%' }}>
              <div className="lbl" style={{ marginBottom: 4 }}>Cost breakdown by project (₹ Lakhs)</div>
              <div style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                    <XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} />
                    <Tooltip formatter={(v: any) => `₹${v} L`} /><Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Consumables" stackId="a" fill="#2563eb" /><Bar dataKey="Equipment" stackId="a" fill="#06b6d4" /><Bar dataKey="Labour" stackId="a" fill="#0ea878" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
      <CrudPage config={config} />
    </>
  );
}
