import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { useAuth } from '../auth/AuthContext';
import { api, errMsg, downloadExport } from '../api/client';
import { fmtMoney, useToast } from '../components/ui';

const config: CrudConfig<any> = {
  title: 'Bill of Quantities',
  singularLabel: 'BOQ',
  endpoint: '/boq',
  module: 'boq',
  exportPath: '/boq/export',
  createLabel: 'New BOQ',
  columns: [
    { key: 'boq_number', label: 'BOQ No.', render: (b: any) => <span className="mono">{b.boq_number}</span> },
    { key: 'title', label: 'Title', render: (b: any) => <div><div style={{ fontWeight: 600 }}>{b.title}</div><div className="muted" style={{ fontSize: 12 }}>{b.project_name}{b.wing_name ? ` · ${b.wing_name}` : ''}</div></div> },
    { key: 'estimated_total', label: 'Estimated', align: 'right', render: (b: any) => fmtMoney(b.estimated_total) },
    { key: 'actual_total', label: 'Actual', align: 'right', render: (b: any) => fmtMoney(b.actual_total) },
    {
      key: 'variance_total', label: 'Variance', align: 'right',
      render: (b: any) => {
        const v = Number(b.variance_total) || 0;
        return <span style={{ color: v > 0 ? 'var(--danger)' : 'var(--success)' }}>{v > 0 ? '+' : ''}{fmtMoney(Math.abs(v))}</span>;
      },
    },
    statusColumn<any>(),
  ],
  filters: [{ key: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'completed', 'cancelled'].map((s) => ({ value: s, label: s })) }],
  fields: () => [
    { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'wing_id', label: 'Wing (optional)', type: 'select', optionsEndpoint: '/wings', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'title', label: 'Title', type: 'text', required: true, width: 'full' },
    { key: 'tax_percent', label: 'Tax %', type: 'number' },
    { key: 'discount', label: 'Discount (₹)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'completed', 'cancelled'].map((s) => ({ value: s, label: s })) },
    { key: 'description', label: 'Description', type: 'textarea', width: 'full' },
  ],
  defaults: { status: 'draft', tax_percent: 18, discount: 0 },
};

export default function BoqList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [importTarget, setImportTarget] = useState<any>(null);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    if (!importTarget || !importText.trim()) return;
    setBusy(true);
    try {
      const lines = importText.trim().split('\n').filter((l) => l.trim());
      const rows = lines.slice(1).map((line) => {
        const c = line.split(',').map((s) => s.trim());
        return { item_code: c[0], description: c[1], unit: c[2] || 'nos', estimated_qty: Number(c[3]) || 0, rate: Number(c[4]) || 0, actual_qty: Number(c[5]) || 0 };
      }).filter((r) => r.description);
      await api.post(`/boq/${importTarget.id}/import-json`, { rows });
      toast.push(`${rows.length} items imported`);
      setImportTarget(null);
      setImportText('');
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <CrudPage
        config={{
          ...config,
          onRowClick: (row) => navigate(`/boq/${row.id}`),
          extraActions: (row) => can('boq.create') ? (
            <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); setImportTarget(row); }}>⇪ Import items</button>
          ) : null,
        }}
      />
      {importTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header"><h3>Import BOQ items — {importTarget.boq_number}</h3><button className="close" onClick={() => setImportTarget(null)}>✕</button></div>
            <div className="modal-body">
              <p className="muted" style={{ fontSize: 12 }}>
                Paste CSV rows: <code>item_code, description, unit, estimated_qty, rate, actual_qty</code> — first line is treated as header.
                Download a <button className="btn ghost sm" onClick={async () => { try { await downloadExport('/boq/template-csv', 'boq-template.csv'); } catch (e) { toast.push(errMsg(e), 'error'); } }}>template</button>.
              </p>
              <textarea className="input mono" rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="item_code,description,unit,estimated_qty,rate,actual_qty" />
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={() => setImportTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={doImport} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
