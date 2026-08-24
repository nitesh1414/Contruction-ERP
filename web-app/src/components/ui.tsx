import React, { createContext, useCallback, useContext, useState } from 'react';
import type { ColumnConfig, FieldConfig } from '../api/types';

/* --------------------------------- Toast -------------------------------- */
interface Toast { id: number; message: string; kind: 'success' | 'error' | 'info'; }
interface ToastCtx { push: (message: string, kind?: Toast['kind']) => void; }
const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-region">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.kind === 'success' ? '✓' : t.kind === 'error' ? '⚠' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* --------------------------------- Modal -------------------------------- */
export function Modal({
  title, onClose, children, footer, size,
}: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : size === 'sm' ? 'sm' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title = 'Are you sure?', message, confirmLabel = 'Delete', onConfirm, onCancel, danger = true, busy,
}: {
  title?: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button className="btn outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>{message}</p>
    </Modal>
  );
}

/* --------------------------------- Badge -------------------------------- */
const STATUS_COLORS: Record<string, string> = {
  planning: 'gray', in_progress: 'blue', on_hold: 'orange', completed: 'green', cancelled: 'red',
  active: 'blue', pending: 'orange', approved: 'green', rejected: 'red', draft: 'gray',
  open: 'red', assigned: 'blue', resolved: 'green', closed: 'gray', reopened: 'orange',
  passed: 'green', failed: 'red', reinspection_required: 'orange',
  low: 'gray', medium: 'blue', high: 'orange', critical: 'red',
  present: 'green', absent: 'red', leave: 'purple', half_day: 'orange', overtime: 'blue',
  paid: 'green', unpaid: 'red', partial: 'orange', partially_paid: 'orange', overdue: 'red',
  available: 'green', booked: 'orange', sold: 'blue', blocked: 'gray',
  pass: 'green', fail: 'red', inconclusive: 'purple', submitted: 'blue',
  draft_po: 'gray', pending_approval: 'orange', sent: 'blue', partially_received: 'orange', received: 'green',
  fulfilled: 'green', po_created: 'purple',
  info: 'blue', warning: 'orange', error: 'red', success: 'green', superseded: 'gray', pending_approval_rev: 'orange',
  in_stock: 'green', delayed: 'red', na: 'gray', openness: 'blue',
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const color = STATUS_COLORS[value] || 'gray';
  const text = label || value.replace(/_/g, ' ');
  return <span className={`badge ${color}`} style={{ textTransform: 'capitalize' }}>{text}</span>;
}

/* ------------------------------- Data table ------------------------------ */
export function DataTable<T extends Record<string, any>>({
  columns, rows, loading, emptyMessage = 'No records found', rowKey = 'id', onRowClick,
}: {
  columns: ColumnConfig<T>[]; rows: T[]; loading?: boolean; emptyMessage?: string; rowKey?: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return <div className="spinner-wrap"><div className="spinner" /><span>Loading…</span></div>;
  }
  if (!rows.length) {
    return (
      <div className="empty">
        <div className="big">🗂️</div>
        <div>{emptyMessage}</div>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : ''}>
                  {c.render ? c.render(row) : row[c.key] ?? <span className="muted">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaginationBar({
  page, total, limit, onPage,
}: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  return (
    <div className="pager">
      <span>{total} record{total === 1 ? '' : 's'} · page {page} of {pages}</span>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

/* -------------------------------- Fields --------------------------------- */
export function Field({
  config, value, onChange, error,
}: {
  config: FieldConfig; value: any; onChange: (v: any) => void; error?: string;
}) {
  const [opts, setOpts] = useState(config.options || []);

  // dynamic options from API (config.options via endpoint via optionsEndpoint)
  React.useEffect(() => {
    const anyCfg = config as any;
    if (anyCfg.optionsEndpoint) {
      import('../api/client').then(({ api }) => {
        api.get(anyCfg.optionsEndpoint, { params: anyCfg.optionsParams }).then((res) => {
          const list = res.data.data || [];
          setOpts(list.map((x: any) => ({ value: x[anyCfg.optionsValueKey || 'id'], label: x[anyCfg.optionsLabelKey || 'name'] })));
        }).catch(() => {});
      });
    }
  }, [config]);

  const common = { id: `f-${config.key}`, className: 'input' };
  let control: React.ReactNode;
  switch (config.type) {
    case 'select':
      control = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)))}>
          <option value="">— Select —</option>
          {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      );
      break;
    case 'textarea':
      control = <textarea {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder} />;
      break;
    case 'checkbox':
      control = (
        <label className="flex gap-sm" style={{ padding: '7px 0' }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="form-hint">{config.placeholder || 'Yes'}</span>
        </label>
      );
      break;
    case 'number':
      control = <input {...common} type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} placeholder={config.placeholder} />;
      break;
    default:
      control = <input {...common} type={config.type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder} />;
  }
  return (
    <div className="field">
      <label htmlFor={`f-${config.key}`}>{config.label} {config.required ? <span className="req">*</span> : null}</label>
      {control}
      {error ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span> : config.hint ? <span className="form-hint">{config.hint}</span> : null}
    </div>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="flex gap-sm" style={{ minWidth: 110 }}>
      <div className="progress-wrap" style={{ flex: 1 }}>
        <div className={`progress-bar ${color || ''}`} style={{ width: `${v}%` }} />
      </div>
      <span className="num muted" style={{ fontSize: 12 }}>{v.toFixed(0)}%</span>
    </div>
  );
}

export function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="ic" style={{ background: color || 'var(--brand-soft)' }}>{icon}</div>
      <div>
        <div className="val">{value}</div>
        <div className="lbl">{label}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}

export const fmtMoney = (v: number | null | undefined) =>
  v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const fmtDate = (d?: string | null) => (d ? String(d).slice(0, 10) : '—');

export const fmtQty = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
