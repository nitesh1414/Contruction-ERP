import React, { useState } from 'react';
import { api, errMsg, downloadExport } from '../api/client';
import { useFetch } from '../hooks/useFetch';
import { DataTable, useToast } from '../components/ui';

interface ReportDef { key: string; label: string; }

const DESCRIPTIONS: Record<string, string> = {
  'project-progress': 'All projects with status, wings and overall progress',
  'daily-progress': 'Site daily progress entries with labour and location',
  milestones: 'Milestone schedule with target and completion dates',
  'material-stock': 'Current stock position with received/consumed/damaged',
  'material-consumption': 'Material consumption history by location',
  'purchase-orders': 'PO register with values and status',
  billing: 'Cost entries with tax, totals and payment status',
  boq: 'BOQ summary with estimated vs actual variance',
  'test-reports': 'Lab test reports with results and approvals',
  inspections: 'Site inspection register',
  issues: 'Issue register with priority and status',
  attendance: 'Worker attendance with wages and OT',
  sales: 'Unit sales register with collections',
  'budget-vs-actual': 'Project budget vs actual cost with variance %',
  'pending-collections': 'Outstanding customer payments',
  'labour-payments': 'Labour payment register',
  'project-cost': 'Project cost rollup',
};

export default function Reports() {
  const { data: reports } = useFetch<ReportDef[]>('/reports');
  const [active, setActive] = useState<ReportDef | null>(null);

  return (
    <>
      <div className="card">
        <div className="card-header"><h3>Reports Center</h3></div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {(reports || []).map((r) => (
            <div key={r.key} className="card card-pad report-card" style={{ cursor: 'pointer' }} onClick={() => setActive(r)}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{icon(r.key)}</div>
              <div style={{ fontWeight: 650 }}>{r.label}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{DESCRIPTIONS[r.key] || 'Downloadable report'}</div>
            </div>
          ))}
        </div>
      </div>
      {active && <ReportViewer report={active} onClose={() => setActive(null)} />}
    </>
  );
}

function icon(key: string) {
  const map: Record<string, string> = {
    'project-progress': '🏗️', 'daily-progress': '📈', milestones: '🎯', 'material-stock': '🧱',
    'material-consumption': '📦', 'purchase-orders': '🛒', billing: '💰', boq: '📋',
    'test-reports': '🧪', inspections: '🔍', issues: '⚠️', attendance: '👷', sales: '🏠',
    'budget-vs-actual': '⚖️', 'pending-collections': '💸', 'labour-payments': '💵', 'project-cost': '📊',
  };
  return map[key] || '📑';
}

function ReportViewer({ report, onClose }: { report: ReportDef; onClose: () => void }) {
  const toast = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const params: Record<string, any> = {};
  if (fromDate) params.from = fromDate;
  if (toDate) params.to = toDate;
  const { data, loading } = useFetch<any[]>(`/reports/${report.key}`, params);
  const rows = Array.isArray(data) ? data : [];
  const columns = rows.length
    ? Object.keys(rows[0]).slice(0, 12).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }))
    : [];

  const download = async (format: 'csv') => {
    try {
      const qs = new URLSearchParams({ format, ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) });
      await downloadExport(`/reports/${report.key}?${qs}`, `${report.key}.csv`);
      toast.push('Downloaded');
    } catch (e) { toast.push(errMsg(e), 'error'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal xl" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>{icon(report.key)} {report.label}</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="filter-bar">
          <div className="field"><label>From</label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="field"><label>To</label><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn primary sm" onClick={() => download('csv')}>⬇ Export CSV / Excel</button>
            <button className="btn outline sm" onClick={() => window.print()}>🖨 Print / PDF</button>
          </div>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No data for this report" />
        </div>
      </div>
    </div>
  );
}
