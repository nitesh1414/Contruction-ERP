import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errMsg, downloadExport } from '../api/client';
import type { ColumnConfig, FieldConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, ConfirmDialog, DataTable, Field, Modal, PaginationBar, useToast } from './ui';
import { useDebounce } from '../hooks/useFetch';

export interface CrudConfig<T = any> {
  title: string;
  singularLabel?: string;
  endpoint: string;
  module: string;                       // permission module code
  idKey?: string;
  columns: ColumnConfig<T>[];
  fields: (item?: T | null) => FieldConfig[];
  filters?: FieldConfig[];
  exportPath?: string;
  searchPlaceholder?: string;
  createLabel?: string;
  defaults?: Record<string, any>;
  transformForSave?: (data: any, isEdit: boolean) => any;
  transformForEdit?: (item: T) => any;
  onRowClick?: (row: T) => void;
  createDisabled?: boolean;
  extraActions?: (row: T, reload: () => void) => React.ReactNode;
  paginated?: boolean;                  // default true
}

export default function CrudPage<T extends Record<string, any>>({ config }: { config: CrudConfig<T> }) {
  const toast = useToast();
  const { can } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [editItem, setEditItem] = useState<T | null | 'new'>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const paginated = config.paginated !== false;
  const idKey = config.idKey || 'id';
  const limit = 20;

  const params = useMemo(() => {
    const p: Record<string, any> = paginated ? { page, limit } : { limit: 1000 };
    if (debouncedSearch) p.search = debouncedSearch;
    for (const [k, v] of Object.entries(filterValues)) if (v !== '' && v != null) p[k] = v;
    return p;
  }, [page, debouncedSearch, filterValues, paginated]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(config.endpoint, { params });
      const body = res.data;
      setRows(body.data || []);
      setTotal(body.pagination?.total ?? (body.data || []).length);
    } catch (e) {
      toast.push(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, JSON.stringify(params)]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ ...(config.defaults || {}) });
    setEditItem('new');
  };

  const openEdit = (item: T) => {
    setForm(config.transformForEdit ? config.transformForEdit(item) : { ...item });
    setEditItem(item);
  };

  const save = async () => {
    // basic required validation
    const fields = config.fields(editItem === 'new' ? null : (editItem as T));
    for (const f of fields) {
      if (f.required && (form[f.key] === undefined || form[f.key] === null || form[f.key] === '')) {
        toast.push(`${f.label} is required`, 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = config.transformForSave ? config.transformForSave(form, editItem !== 'new') : form;
      if (editItem === 'new') {
        await api.post(config.endpoint, payload);
        toast.push(`${config.singularLabel || config.title} created`);
      } else {
        await api.put(`${config.endpoint}/${(editItem as T)[idKey]}`, payload);
        toast.push('Saved successfully');
      }
      setEditItem(null);
      load();
    } catch (e) {
      toast.push(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`${config.endpoint}/${deleting[idKey]}`);
      toast.push('Deleted');
      setDeleting(null);
      load();
    } catch (e) {
      toast.push(errMsg(e), 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: ColumnConfig<T>[] = useMemo(() => {
    const cols = [...config.columns];
    const showActions = can(`${config.module}.edit`) || can(`${config.module}.delete`) || !!config.extraActions;
    if (showActions && !config.onRowClick) {
      cols.push({
        key: '_actions', label: '', align: 'right',
        render: (row) => (
          <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
            {config.extraActions?.(row, load)}
            {can(`${config.module}.edit`) && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</button>}
            {can(`${config.module}.delete`) && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>Delete</button>}
          </div>
        ),
      });
    }
    return cols;
  }, [config, load]);

  return (
    <div className="card">
      <div className="card-header">
        <h3>{config.title}</h3>
        <div className="actions">
          {config.exportPath && can(`${config.module}.export`) && (
            <button className="btn outline sm" onClick={() => downloadExport(config.exportPath!, `${config.module}-export.csv`).catch((e) => toast.push(errMsg(e), 'error'))}>⬇ Export CSV</button>
          )}
          {can(`${config.module}.create`) && !config.createDisabled && (
            <button className="btn primary sm" onClick={openNew}>+ {config.createLabel || 'New'}</button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="field grow">
          <label>Search</label>
          <input className="input" placeholder={config.searchPlaceholder || 'Search…'} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {(config.filters || []).map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <FilterInput config={f} value={filterValues[f.key]} onChange={(v) => { setFilterValues((s) => ({ ...s, [f.key]: v })); setPage(1); }} />
          </div>
        ))}
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} rowKey={idKey} onRowClick={config.onRowClick || ((can(`${config.module}.edit`)) ? openEdit : undefined)} />
      {paginated && <PaginationBar page={page} total={total} limit={limit} onPage={setPage} />}

      {editItem !== null && (
        <Modal
          title={`${editItem === 'new' ? 'New' : 'Edit'} ${config.singularLabel || config.title}`}
          onClose={() => setEditItem(null)}
          size="lg"
          footer={
            <>
              <button className="btn outline" onClick={() => setEditItem(null)} disabled={saving}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="form-grid">
            {config.fields(editItem === 'new' ? null : (editItem as T)).map((f) => (
              <div key={f.key} className={f.width === 'full' ? 'full' : ''}>
                <Field config={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete this ${config.singularLabel?.toLowerCase() || 'record'}? This action cannot be undone.`}
          onCancel={() => setDeleting(null)}
          onConfirm={doDelete}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}

function FilterInput({ config, value, onChange }: { config: FieldConfig; value: any; onChange: (v: any) => void }) {
  const [options, setOptions] = useState(config.options || []);
  useEffect(() => {
    const anyCfg = config as any;
    if (anyCfg.optionsEndpoint) {
      api.get(anyCfg.optionsEndpoint, { params: anyCfg.optionsParams }).then((res) => {
        const list = res.data.data || [];
        setOptions(list.map((x: any) => ({ value: x[anyCfg.optionsValueKey || 'id'], label: x[anyCfg.optionsLabelKey || 'name'] })));
      }).catch(() => {});
    }
  }, [config]);

  if (config.type === 'select') {
    return (
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)))}>
        <option value="">All</option>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    );
  }
  return <input className="input" type={config.type === 'date' ? 'date' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

/* Helper for status-<Badge> columns */
export const statusColumn = <T,>(key = 'status', label = 'Status'): ColumnConfig<T> => ({
  key, label, render: (row: any) => (row[key] ? <Badge value={row[key]} /> : '—'),
});
