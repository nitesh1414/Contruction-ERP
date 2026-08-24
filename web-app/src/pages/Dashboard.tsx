import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { useFetch } from '../hooks/useFetch';
import { Badge, StatCard, fmtDate, fmtMoney } from '../components/ui';

const COLORS = ['#e8651a', '#2277cc', '#1a9e5c', '#d9930d', '#d33c3c', '#7b4bd6'];

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
      <div className="stat-grid">
        <StatCard icon="🏗️" label="Total Projects" value={d.projects?.total ?? 0} sub={`avg progress ${d.projects?.avgProgress ?? 0}%`} color="#fff1e8" />
        <StatCard icon="🏢" label="Total Wings" value={d.wings?.total ?? 0} color="#e5f0fb" />
        <StatCard icon="⚠️" label="Open Issues" value={d.issues?.open ?? 0} sub={`${d.issues?.critical ?? 0} high/critical`} color="#fdf3dc" />
        <StatCard icon="🔍" label="Pending Inspections" value={d.inspections?.pending ?? 0} color="#e4f7ec" />
        <StatCard icon="🧱" label="Low-Stock Materials" value={d.materials?.lowStockCount ?? 0} color="#fdeaea" />
        <StatCard icon="🏠" label="Units Sold" value={d.sales?.unitsSold ?? 0} sub={`collection ${fmtMoney(d.sales?.received)}`} color="#f0eafd" />
        <StatCard icon="👷" label="Pending Labour Payment" value={fmtMoney(d.payments?.labour?.amount)} sub={`${d.payments?.labour?.count ?? 0} payments`} color="#fdf3dc" />
        <StatCard icon="💰" label="Vendor Dues" value={fmtMoney(d.payments?.vendors?.amount)} sub="unpaid bills" color="#e5f0fb" />
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
                      <stop offset="5%" stopColor="#e8651a" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#e8651a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                  <XAxis dataKey="date" fontSize={11} stroke="#8296ab" />
                  <YAxis fontSize={11} stroke="#8296ab" domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Area type="monotone" dataKey="pct" name="Avg progress %" stroke="#e8651a" strokeWidth={2.2} fill="url(#gPct)" />
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
                  <Bar dataKey="Actual" fill="#e8651a" radius={[4, 4, 0, 0]} />
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
                  color={{ pending: '#eef1f5', in_progress: '#e5f0fb', completed: '#e4f7ec', delayed: '#fdeaea' }[m.status as string]} />
              ))}
              {(!d.milestones || !d.milestones.length) && <div className="empty">No milestones</div>}
            </div>
            {(d.sales?.pending ?? 0) > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--warning-soft)', color: '#7a5b06', fontSize: 13 }}>
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
      </div>
    </>
  );
}
