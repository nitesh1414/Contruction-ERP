import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useFetch } from '../hooks/useFetch';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Badge, ConfirmDialog, DataTable, Field, Modal, PaginationBar, ProgressBar, StatCard, fmtDate, fmtMoney, useToast,
} from '../components/ui';
import type { Wing, Floor, UnitInfo } from '../api/types';

const PIE_COLORS = ['#2563eb', '#06b6d4', '#0ea878', '#e79a09', '#e24545'];

export default function ProjectDetail() {
  const { id, wingId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(wingId ? 'wing' : 'overview');
  const { data: project, reload } = useFetch<any>(id ? `/projects/${id}` : null);
  const { data: overviewWing } = useFetch<any>(wingId ? `/dashboard/wing/${wingId}` : null);

  if (!project) return <div className="spinner-wrap"><div className="spinner" /></div>;

  const tabs: { key: string; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'wings', label: `Wings (${project.wings?.length ?? 0})` },
    ...(wingId ? [{ key: 'wing', label: 'Wing Dashboard' }] : []),
    { key: 'progress', label: 'Progress Timeline' },
    { key: 'structure', label: 'Floors & Units' },
  ];

  return (
    <>
      <div className="card card-pad">
        <div className="flex gap" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="flex gap-sm">
              <h2 style={{ margin: 0 }}>{project.name}</h2>
              <Badge value={project.status} />
              <Badge value="info" label={project.project_type} />
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              <span className="mono">{project.code}</span> · {project.client_name || 'no client'} · {project.city}, {project.state}
              {project.manager_name ? ` · Manager: ${project.manager_name}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12 }} className="muted">Overall progress</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand)' }}>{Number(project.overall_progress).toFixed(0)}%</div>
            <ProgressBar value={project.overall_progress} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, color: 'var(--ink-2)', fontSize: 13 }}>
          <span>📅 <strong>Start:</strong> {fmtDate(project.start_date)}</span>
          <span>🏁 <strong>Due:</strong> {fmtDate(project.expected_completion_date)}</span>
          <span>💰 <strong>Budget:</strong> {fmtMoney(project.budget)}</span>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ padding: '0 10px' }}>
          {tabs.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {tab === 'overview' && <OverviewTab project={project} onEdit={reload} />}
        {tab === 'wings' && <WingsTab project={project} reload={reload} />}
        {tab === 'wing' && wingId && overviewWing && <WingDashboardTab data={overviewWing} />}
        {tab === 'progress' && <ProgressTab projectId={project.id} />}
        {tab === 'structure' && <StructureTab project={project} navigate={navigate} />}
      </div>
    </>
  );
}

function OverviewTab({ project }: { project: any; onEdit: () => void }) {
  const { data: summary } = useFetch<any[]>(`/billing/summary?projectId=${project.id}`);
  const cost = summary?.[0];
  return (
    <div className="card-pad">
      <div className="kv">
        <dt>Developer</dt><dd>{project.developer_name || '—'}</dd>
        <dt>Address</dt><dd>{project.address || '—'}, {project.city} {project.state} {project.pincode}</dd>
        <dt>Description</dt><dd>{project.description || '—'}</dd>
        <dt>Budget</dt><dd>{fmtMoney(project.budget)}</dd>
        <dt>Actual cost</dt><dd>{fmtMoney(cost?.total_cost)} <span className="muted">({cost?.budget_used_percent ?? 0}% of budget)</span></dd>
        <dt>Paid / Pending</dt><dd>{fmtMoney(cost?.total_paid)} / {fmtMoney(cost?.total_pending)}</dd>
      </div>
      {project.images?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Project Images</h3>
          <div className="photo-grid">
            {project.images.map((img: any) => (
              <div className="ph" key={img.id}>
                {img.file_path ? <ProtectedImage fileId={img.file_id} alt={img.title} /> : null}
                <div className="meta">{img.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectedImage({ fileId, alt }: { fileId: number; alt?: string }) {
  const [src, setSrc] = useState('');
  React.useEffect(() => {
    let revoke: string | null = null;
    import('../api/client').then(async ({ fileObjectUrl }) => {
      try { const url = await fileObjectUrl(fileId); revoke = url; setSrc(url); } catch { /* ignore */ }
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [fileId]);
  return src ? <img src={src} alt={alt || ''} /> : null;
}

export { ProtectedImage };

/* ------------------------------ Wings tab ------------------------------- */
function WingsTab({ project, reload }: { project: any; reload: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [edit, setEdit] = useState<Partial<Wing> | null>(null);
  const [deleting, setDeleting] = useState<Wing | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const payload = { ...edit, project_id: project.id };
      if ((edit as Wing).id) await api.put(`/wings/${(edit as Wing).id}`, payload);
      else await api.post('/wings', payload);
      toast.push('Wing saved');
      setEdit(null);
      reload();
    } catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="filter-bar" style={{ justifyContent: 'flex-end' }}>
        {can('wings.create') && <button className="btn primary sm" onClick={() => setEdit({ status: 'planning' })}>+ Add Wing</button>}
      </div>
      <DataTable<Wing>
        columns={[
          { key: 'code', label: 'Code', render: (w) => <span className="mono">{w.code}</span> },
          { key: 'name', label: 'Wing', render: (w) => <strong>{w.name}</strong> },
          { key: 'floors_count', label: 'Floors', align: 'right' },
          { key: 'units_count', label: 'Units', align: 'right' },
          { key: 'progress', label: 'Progress', render: (w) => <ProgressBar value={w.progress} /> },
          { key: 'status', label: 'Status', render: (w) => <Badge value={w.status} /> },
          { key: 'expected_completion_date', label: 'Due', render: (w) => fmtDate(w.expected_completion_date) },
          {
            key: '_actions', label: '', align: 'right',
            render: (w) => (
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}/wings/${w.id}`); }}>Dashboard</button>
                {can('wings.edit') && <button className="btn outline sm" onClick={(e) => { e.stopPropagation(); setEdit(w); }}>Edit</button>}
                {can('wings.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setDeleting(w); }}>Delete</button>}
              </div>
            ),
          },
        ]}
        rows={project.wings || []}
        emptyMessage="No wings yet — add the first wing."
      />
      {edit !== null && (
        <Modal title={(edit as Wing).id ? 'Edit Wing' : 'New Wing'} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
          <div className="form-grid">
            <Field config={{ key: 'name', label: 'Wing name', type: 'text', required: true }} value={edit.name} onChange={(v) => setEdit((s) => ({ ...s, name: v }))} />
            <Field config={{ key: 'code', label: 'Wing code', type: 'text', required: true }} value={edit.code} onChange={(v) => setEdit((s) => ({ ...s, code: v }))} />
            <Field config={{ key: 'floors_count', label: 'Floors', type: 'number' }} value={edit.floors_count} onChange={(v) => setEdit((s) => ({ ...s, floors_count: v }))} />
            <Field config={{ key: 'units_count', label: 'Units', type: 'number' }} value={edit.units_count} onChange={(v) => setEdit((s) => ({ ...s, units_count: v }))} />
            <Field config={{ key: 'start_date', label: 'Start date', type: 'date' }} value={edit.start_date} onChange={(v) => setEdit((s) => ({ ...s, start_date: v }))} />
            <Field config={{ key: 'expected_completion_date', label: 'Expected completion', type: 'date' }} value={edit.expected_completion_date} onChange={(v) => setEdit((s) => ({ ...s, expected_completion_date: v }))} />
            <Field config={{ key: 'status', label: 'Status', type: 'select', options: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: s })) }} value={edit.status} onChange={(v) => setEdit((s) => ({ ...s, status: v }))} />
            <Field config={{ key: 'progress', label: 'Progress % (auto-calculated if blank)', type: 'number' }} value={edit.progress} onChange={(v) => setEdit((s) => ({ ...s, progress: v }))} />
            <div className="full"><Field config={{ key: 'description', label: 'Description', type: 'textarea' }} value={edit.description} onChange={(v) => setEdit((s) => ({ ...s, description: v }))} /></div>
          </div>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog message={`Delete wing "${deleting.name}" and all its floors/units?`}
          onCancel={() => setDeleting(null)}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try { await api.delete(`/wings/${deleting.id}`); toast.push('Wing deleted'); setDeleting(null); reload(); }
            catch (e) { toast.push(errMsg(e), 'error'); } finally { setBusy(false); }
          }} />
      )}
    </div>
  );
}

/* --------------------------- Wing dashboard tab -------------------------- */
function WingDashboardTab({ data }: { data: any }) {
  const insp = (data.inspections || []).reduce((acc: any[], i: any) => {
    const f = acc.find((x) => x.name === i.status);
    if (f) f.value += Number(i.count); else acc.push({ name: i.status, value: Number(i.count) });
    return acc;
  }, []);
  return (
    <div className="card-pad">
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard icon="📈" label="Wing progress" value={`${Number(data.wing.progress).toFixed(0)}%`} color="#e8f0fe" />
        <StatCard icon="⚠️" label="Active issues" value={data.activeIssues?.length ?? 0} color="#fef3d8" />
        <StatCard icon="🏠" label="Units sold" value={data.salesStatus?.units_sold ?? 0} sub={fmtMoney(data.salesStatus?.value)} color="#f1e9fe" />
        <StatCard icon="💰" label="Collections" value={fmtMoney(data.salesStatus?.received)} sub={`pending ${fmtMoney(data.salesStatus?.pending)}`} color="#dcfcee" />
      </div>
      <div className="grid-2">
        <div>
          <h3>Floor Progress</h3>
          <div className="card" style={{ padding: 10 }}>
            {(data.floors || []).map((f: any) => (
              <div key={f.id} className="flex gap" style={{ padding: '6px 4px' }}>
                <span style={{ width: 110, fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                <ProgressBar value={f.progress} />
                <Badge value={f.status === 'pending' ? 'planning' : f.status} label={f.status.replace(/_/g, ' ')} />
              </div>
            ))}
            {!data.floors?.length && <div className="empty">No floors defined</div>}
          </div>
          <h3 style={{ marginTop: 16 }}>Recent Updates</h3>
          <ul className="pending-list card">
            {(data.recentProgress || []).slice(0, 6).map((p: any) => (
              <li key={p.id}><div style={{ flex: 1 }}>{p.work_description}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(p.report_date)} · {p.created_by_name}</div></div><span className="badge green">{Number(p.percentage)}%</span></li>
            ))}
            {!data.recentProgress?.length && <div className="empty">No progress updates</div>}
          </ul>
        </div>
        <div>
          <h3>Inspections by Status</h3>
          <div className="card-pad" style={{ height: 220 }}>
            {insp.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={insp} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {insp.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty">No inspections</div>}
          </div>
          <h3>Material Status</h3>
          <DataTable
            columns={[
              { key: 'material_name', label: 'Material' },
              { key: 'current_stock', label: 'In Stock', align: 'right', render: (r: any) => `${Number(r.current_stock).toLocaleString()} ${r.unit}` },
              { key: 'low_stock', label: '', render: (r: any) => (r.low_stock ? <Badge value="high" label="LOW" /> : <Badge value="green" label="OK" />) },
            ]}
            rows={(data.materialStatus || []).slice(0, 8)} emptyMessage="No stock data" />
        </div>
      </div>
      {!!data.activeIssues?.length && (
        <div style={{ marginTop: 16 }}>
          <h3>Active Issues</h3>
          <DataTable
            columns={[
              { key: 'issue_number', label: '#', render: (i: any) => <span className="mono">{i.issue_number}</span> },
              { key: 'title', label: 'Issue' },
              { key: 'priority', label: 'Priority', render: (i: any) => <Badge value={i.priority} /> },
              { key: 'status', label: 'Status', render: (i: any) => <Badge value={i.status} /> },
            ]}
            rows={data.activeIssues} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Progress tab ------------------------------ */
function ProgressTab({ projectId }: { projectId: number }) {
  const { data } = useFetch<any[]>('/progress/timeline', { projectId });
  const chart = (data || []).map((p: any) => ({ date: String(p.date).slice(5), pct: +(Number(p.avg_percentage) || 0).toFixed(1), labour: Number(p.total_labour), reports: p.reports }));
  return (
    <div className="card-pad" style={{ height: 340 }}>
      {chart.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 10, right: 16, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
            <XAxis dataKey="date" fontSize={11} stroke="#8296ab" />
            <YAxis fontSize={11} unit="%" stroke="#8296ab" domain={[0, 100]} />
            <Tooltip />
            <Area type="monotone" dataKey="pct" name="Progress %" stroke="#2563eb" strokeWidth={2} fill="url(#gP)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : <div className="empty">No daily progress yet for this project</div>}
    </div>
  );
}

/* ----------------------------- Structure tab ----------------------------- */
function StructureTab({ project, navigate }: { project: any; navigate: (to: string) => void }) {
  const [wingFilter, setWingFilter] = useState<number | ''>('');
  const { data: floors } = useFetch<Floor[]>('/floors', { projectId: project.id, ...(wingFilter ? { wingId: wingFilter } : {}) });
  const { data: units } = useFetch<UnitInfo[]>('/units', { projectId: project.id, ...(wingFilter ? { wingId: wingFilter } : {}) });
  const summary = useMemo(() => {
    const s: Record<string, number> = {};
    (units || []).forEach((u) => { s[u.status] = (s[u.status] || 0) + 1; });
    return s;
  }, [units]);

  return (
    <div>
      <div className="filter-bar">
        <div className="field">
          <label>Wing</label>
          <select className="input" value={wingFilter} onChange={(e) => setWingFilter(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">All wings</option>
            {project.wings.map((w: Wing) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex gap" style={{ marginLeft: 8 }}>
          {['available', 'booked', 'sold'].map((s) => <Badge key={s} value={s} label={`${summary[s] || 0} ${s}`} />)}
        </div>
      </div>
      <div className="grid-2" style={{ padding: 18 }}>
        <div>
          <h3>Floors</h3>
          <DataTable<Floor>
            columns={[
              { key: 'wing_name', label: 'Wing' },
              { key: 'name', label: 'Floor' },
              { key: 'progress', label: 'Progress', render: (f) => <ProgressBar value={f.progress} /> },
              { key: 'status', label: 'Status', render: (f) => <Badge value={f.status === 'pending' ? 'planning' : f.status} label={f.status.replace(/_/g, ' ')} /> },
            ]}
            rows={floors || []} emptyMessage="No floors" />
        </div>
        <div>
          <h3>Units ({units?.length ?? 0})</h3>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            <DataTable<UnitInfo>
              columns={[
                { key: 'unit_number', label: 'Unit', render: (u) => <strong>{u.unit_number}</strong> },
                { key: 'wing_name', label: 'Wing' },
                { key: 'unit_type', label: 'Type' },
                { key: 'saleable_area', label: 'Area (sqft)', align: 'right' },
                { key: 'price', label: 'Price', align: 'right', render: (u) => fmtMoney(u.price) },
                { key: 'status', label: 'Status', render: (u) => <Badge value={u.status} /> },
              ]}
              rows={units || []} emptyMessage="No units" />
          </div>
        </div>
      </div>
    </div>
  );
}
