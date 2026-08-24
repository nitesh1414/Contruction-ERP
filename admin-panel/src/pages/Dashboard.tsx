import React, { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useFetch } from '../hooks/useFetch';
import { StatCard, DataTable, Badge, fmtMoney } from '../components/ui';

const COLORS = ['#7b4bd6', '#2277cc', '#1a9e5c', '#d9930d', '#d33c3c', '#e8651a'];

export default function Dashboard() {
  const { data: overview } = useFetch<any>('/dashboard/overview');
  const { data: users } = useFetch<any>('/users', { limit: 100 });
  const { data: roles } = useFetch<any[]>('/roles');
  const { data: audits } = useFetch<any>('/admin/audit-logs', { limit: 8 });
  const { data: projects } = useFetch<any>('/projects', { limit: 10 });

  const roleChart = useMemo(() => (roles || []).map((r: any) => ({ name: r.name, value: Number(r.user_count) })).filter((r: any) => r.value > 0), [roles]);
  const trend = (overview?.progressTrend || []).map((p: any) => ({ date: String(p.d).slice(5), reports: Number(p.reports) }));

  return (
    <>
      <div className="stat-grid">
        <StatCard icon="👤" label="Total Users" value={users?.pagination?.total ?? 0} color="#f0eafd" />
        <StatCard icon="🛡️" label="Roles" value={roles?.length ?? 0} color="#e5f0fb" />
        <StatCard icon="🏗️" label="Projects" value={overview?.projects?.total ?? projects?.pagination?.total ?? 0} color="#fff1e8" />
        <StatCard icon="🏢" label="Wings" value={overview?.wings?.total ?? 0} color="#e4f7ec" />
        <StatCard icon="💰" label="Total Budget" value={fmtMoney(overview?.projects?.totalBudget)} color="#fdf3dc" />
        <StatCard icon="⚠️" label="Open Issues" value={overview?.issues?.open ?? 0} color="#fdeaea" />
      </div>

      <div className="grid-12">
        <div className="card col-4">
          <div className="card-header"><h3>Users by Role</h3></div>
          <div className="card-pad" style={{ height: 250 }}>
            {roleChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={roleChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {roleChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty">No users assigned</div>}
          </div>
        </div>
        <div className="card col-8">
          <div className="card-header"><h3>Activity Trend ( Progress Reports )</h3></div>
          <div className="card-pad" style={{ height: 250 }}>
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 14, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="reports" name="Reports" stroke="#7b4bd6" fill="#7b4bd633" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="empty">No activity yet</div>}
          </div>
        </div>

        <div className="card col-7">
          <div className="card-header"><h3>Recent Audit Activity</h3></div>
          <DataTable
            rows={audits?.data || []}
            columns={[
              { key: 'created_at', label: 'When', render: (a: any) => new Date(a.created_at).toLocaleString() },
              { key: 'user_name', label: 'User' },
              { key: 'action', label: 'Action', render: (a: any) => <Badge value="info" label={a.action} /> },
              { key: 'module', label: 'Module' },
              { key: 'record_id', label: 'Record' },
            ]}
            emptyMessage="No audit events" />
        </div>
        <div className="card col-5">
          <div className="card-header"><h3>Role Distribution</h3></div>
          <DataTable
            rows={roles || []}
            columns={[
              { key: 'name', label: 'Role' },
              { key: 'user_count', label: 'Users', align: 'right' },
              { key: 'permission_count', label: 'Permissions', align: 'right' },
              { key: 'is_system', label: 'Type', render: (r: any) => <Badge value={r.is_system ? 'purple' : 'gray'} label={r.is_system ? 'System' : 'Custom'} /> },
            ]}
            emptyMessage="No roles" />
        </div>
      </div>
    </>
  );
}
