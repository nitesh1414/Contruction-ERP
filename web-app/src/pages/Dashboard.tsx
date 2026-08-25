import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { useFetch } from '../hooks/useFetch';
import { Badge, StatCard, fmtDate, fmtMoney } from '../components/ui';

const COLORS = ['#ff5b1f', '#0d6cc4', '#0ea878', '#e79a09', '#e24545', '#7c3aed'];

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
  pending: 'Pending', delayed: 'Delayed', present: 'Present', absent: 'Absent', leave: 'Leave', half_day: 'Half Day', overtime: 'Overtime',
};

export default function Dashboard() {
  const { data, loading } = useFetch<any>('/dashboard/overview');
  const navigate = useNavigate();

  const progressTrend = useMemo(() =>
    (data?.progressTrend || []).map((p: any) => ({
      date: String(p.d).slice(5), reports: Number(p.reports), pct: +(Number(p.avg_pct) || 0).toFixed(1),
    })), [data]);

  if (loading && !data) {
    return <div className="spinner-wrap" style={{ minHeight: 300 }}><div className="spinner" /><span>Loading dashboard…</span></div>;
  }
  const d = data || {};

  return (
    <>
      <div className="hero-banner">
        <div>
          <h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'} 👋</h2>
          <p>{d.projects?.total ?? 0} active projects · {d.sales?.unitsSold ?? 0} units sold · {d.issues?.open ?? 0} open issues. Here is the most recent activity across all modules.</p>
        </div>
        <div className="actions">
          <Link to="/projects"><button className="btn cta">Projects</button></Link>
          <Link to="/progress"><button className="btn primary">+ Daily update</button></Link>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="🏗️" label="Total Projects" value={d.projects?.total ?? 0} sub={`avg progress ${d.projects?.avgProgress ?? 0}%`} color="#fff0e6" />
        <StatCard icon="🏢" label="Total Wings" value={d.wings?.total ?? 0} color="#e8f3fb" />
        <StatCard icon="⚠️" label="Open Issues" value={d.issues?.open ?? 0} sub={`${d.issues?.critical ?? 0} high/critical`} color="#fef3d8" />
        <StatCard icon="🔍" label="Pending Inspections" value={d.inspections?.pending ?? 0} color="#dcfcee" />
        <StatCard icon="🧱" label="Low-Stock Materials" value={d.materials?.lowStockCount ?? 0} color="#fee8e8" />
        <StatCard icon="🏠" label="Units Sold" value={d.sales?.unitsSold ?? 0} sub={`collection ${fmtMoney(d.sales?.received)}`} color="#f1e9fe" />
        <StatCard icon="👷" label="Pending Labour Payment" value={fmtMoney(d.payments?.labour?.amount)} sub={`${d.payments?.labour?.count ?? 0} payments`} color="#fef3d8" />
        <StatCard icon="💰" label="Vendor Dues" value={fmtMoney(d.payments?.vendors?.amount)} sub="unpaid bills" color="#e8f3fb" />
      </div>

      <div className="grid-12">
        <div className="card col-8">
          <div className="card-header"><h3>Site Progress Trend (last 30 days)</h3>
            <div className="actions"><Link to="/progress"><button className="btn outline sm">Daily progress →</button></Link></div>
          </div>
          <div className="card-pad" style={{ height: 280 }}>
            {progressTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={progressTrend} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gPct" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff5b1f" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ff5b1f" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                  <XAxis dataKey="date" fontSize={11} stroke="#8296ab" />
                  <YAxis fontSize={11} stroke="#8296ab" domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Area type="monotone" dataKey="pct" name="Avg progress %" stroke="#ff5b1f" strokeWidth={2.4} fill="url(#gPct)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="empty">No progress entries yet</div>}
          </div>
        </div>

        <div className="card col-4">
          <div className="card-header"><h3>Projects by Status</h3></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={(d.projects?.byStatus || []).map((s: any) => ({ name: STATUS_LABEL[s.status] || s.status, value: Number(s.count) }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}
                >
                  {(d.projects?.byStatus || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-header"><h3>Budget vs Actual Cost</h3>
            <div className="actions"><Link to="/reports"><button className="btn outline sm">Reports →</button></Link></div>
          </div>
          <div className="card-pad" style={{ height: 300 }}>
            {(d.budgetVsActual || []).length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(d.budgetVsActual || []).map((p: any) => ({
                  name: p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name,
                  Budget: Number(p.budget) / 100000, Actual: Number(p.actual_cost) / 100000,
                }))} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                  <XAxis dataKey="name" fontSize={11} stroke="#8296ab" />
                  <YAxis fontSize={11} stroke="#8296ab" unit=" L" />
                  <Tooltip formatter={(v: any) => `₹${Number(v).toFixed(1)} L`} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Budget" fill="#c9d4e3" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Actual" fill="#0d6cc4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty">No cost data</div>}
          </div>
        </div>

        <div className="card col-6">
          <div className="card-header"><h3>Pending Issues</h3>
            <div className="actions"><Link to="/issues"><button className="btn outline sm">All issues →</button></Link></div>
          </div>
          {(d.recentIssues || []).length === 0 ? (
            <div className="empty">🎉 No open issues</div>
          ) : (
            <ul className="pending-list">
              {(d.recentIssues || []).map((i: any) => (
                <li key={i.id} onClick={() => navigate('/issues')} style={{ cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{i.issue_number} · {i.project_name}</div>
                  </div>
                  <Badge value={i.priority} />
                  <Badge value={i.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card col-6">
          <div className="card-header"><h3>Recent Daily Updates</h3>
            <div className="actions"><Link to="/progress"><button className="btn outline sm">All updates →</button></Link></div>
          </div>
          {(d.recentProgress || []).length === 0 ? <div className="empty">No updates yet</div> : (
            <ul className="pending-list">
              {(d.recentProgress || []).map((p: any) => (
                <li key={p.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.work_description || 'Work update'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{p.project_name}{p.wing_name ? ` · ${p.wing_name}` : ''} · by {p.created_by_name || 'site team'}</div>
                  </div>
                  <span className="badge green" style={{ flexShrink: 0 }}>{Number(p.percentage)}%</span>
                  <span className="muted nowrap" style={{ fontSize: 12 }}>{fmtDate(p.report_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card col-6">
          <div className="card-header"><h3>Milestones Overview</h3>
            <div className="actions"><Link to="/milestones"><button className="btn outline sm">Milestones →</button></Link></div>
          </div>
          <div className="card-pad">
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {(d.milestones || []).map((m: any) => (
                <StatCard key={m.status} icon={{ pending: '⏳', in_progress: '🚧', completed: '✅', delayed: '⏰' }[m.status as string] || '•'}
                  label={STATUS_LABEL[m.status] || m.status} value={m.count}
                  color={{ pending: '#eef1f5', in_progress: '#e8f3fb', completed: '#dcfcee', delayed: '#fee8e8' }[m.status as string]} />
              ))}
              {(!d.milestones || !d.milestones.length) && <div className="empty">No milestones</div>}
            </div>
            {(d.sales?.pending ?? 0) > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand-dark)', fontSize: 13 }}>
                💰 <strong>{fmtMoney(d.sales.pending)}</strong> pending in sales collections · <Link to="/sales" style={{ fontWeight: 600 }}>view sales →</Link>
              </div>
            )}
            {(d.documentsExpiring || []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 13 }}>📁 Documents expiring soon</strong>
                <ul className="pending-list" style={{ marginTop: 6 }}>
                  {d.documentsExpiring.slice(0, 3).map((doc: any) => (
                    <li key={doc.id} style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <div style={{ flex: 1 }}>{doc.title}</div>
                      <Badge value="warning" label={`expires ${fmtDate(doc.expiry_date)}`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="card col-12">
          <div className="card-header"><h3>Module quick launch</h3>
            <div className="actions muted" style={{ fontSize: 12 }}>Eleven module areas · click to jump straight in</div>
          </div>
          <div className="card-pad">
            <div className="grid-4">
              <div className="feature-tile"><div className="ic">🏗️</div><h4>Projects</h4><p className="desc">Project structure with wings, floors, units and progress roll-up.</p><Link to="/projects" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">📋</div><h4>Daily Worksheet</h4><p className="desc">Site-recorded activity with geo-tagged photos and quantities.</p><Link to="/progress" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">👷</div><h4>Attendance</h4><p className="desc">Mark labour & staff on site — wages computed from attendance.</p><Link to="/workforce" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">🚜</div><h4>Equipment</h4><p className="desc">Machinery hours, breakdowns, fuel and hire billing — new.</p><Link to="/equipment" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">🧱</div><h4>Materials</h4><p className="desc">POs, GRNs, consumption, returns — stock register that builds itself.</p><Link to="/materials" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">🎯</div><h4>Tasks & Milestones</h4><p className="desc">Assign work with priority, drawings and target dates.</p><Link to="/milestones" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">⚠️</div><h4>Issues & Snags</h4><p className="desc">Priority, assignment, photos, discussion thread, over-due alerts.</p><Link to="/issues" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
              <div className="feature-tile"><div className="ic">🔍</div><h4>Quality</h4><p className="desc">Material test reports and on-site inspection checklists.</p><Link to="/inspections" className="nav-section" style={{ marginTop: 0, color: 'var(--brand)' }}>Open →</Link></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
