import React, { useState } from 'react';
import { Badge, DataTable, ProgressBar, fmtDate, fmtMoney } from '../components/ui';
import { useFetch } from '../hooks/useFetch';

/**
 * Read-focused overview of projects, wings, floors and units for admins.
 * Full editing happens in the Web App / via API with proper permissions.
 */
export default function ProjectsAdmin() {
  const { data: projects } = useFetch<any>('/projects', { limit: 100 });
  const [selected, setSelected] = useState<number | null>(null);
  const { data: wings } = useFetch<any>('/wings', selected ? { projectId: selected } : {});
  const { data: floors } = useFetch<any>('/floors', selected ? { projectId: selected } : {});

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Projects ({projects?.pagination?.total ?? 0})</h3></div>
        <DataTable
          rows={projects?.data || []}
          onRowClick={(p: any) => setSelected(p.id === selected ? null : p.id)}
          columns={[
            { key: 'code', label: 'Code', render: (p: any) => <span className="mono">{p.code}</span> },
            { key: 'name', label: 'Project', render: (p: any) => <strong>{p.name}</strong> },
            { key: 'city', label: 'City' },
            { key: 'wing_count', label: 'Wings', align: 'right' },
            { key: 'status', label: 'Status', render: (p: any) => <Badge value={p.status} /> },
            { key: 'overall_progress', label: 'Progress', render: (p: any) => <ProgressBar value={p.overall_progress} /> },
            { key: 'budget', label: 'Budget', align: 'right', render: (p: any) => fmtMoney(p.budget) },
            { key: 'manager_name', label: 'Manager' },
          ]}
        />
      </div>
      {selected && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><h3>Wings</h3></div>
            <DataTable
              rows={wings || []}
              columns={[
                { key: 'code', label: 'Code', render: (w: any) => <span className="mono">{w.code}</span> },
                { key: 'name', label: 'Wing' },
                { key: 'floors_count', label: 'Floors', align: 'right' },
                { key: 'units_count', label: 'Units', align: 'right' },
                { key: 'progress', label: 'Progress', render: (w: any) => <ProgressBar value={w.progress} /> },
                { key: 'status', label: 'Status', render: (w: any) => <Badge value={w.status} /> },
              ]}
            />
          </div>
          <div className="card" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <div className="card-header"><h3>Floors</h3></div>
            <DataTable
              rows={floors || []}
              columns={[
                { key: 'wing_name', label: 'Wing' },
                { key: 'name', label: 'Floor' },
                { key: 'status', label: 'Status', render: (f: any) => <Badge value={f.status === 'pending' ? 'planning' : f.status} label={f.status.replace(/_/g, ' ')} /> },
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}
