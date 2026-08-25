import React from 'react';
import { useNavigate } from 'react-router-dom';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { Badge, ProgressBar, fmtDate, fmtMoney } from '../components/ui';
import type { Project } from '../api/types';

const config: CrudConfig<Project> = {
  title: 'Projects',
  singularLabel: 'Project',
  endpoint: '/projects',
  module: 'projects',
  exportPath: '/projects/export',
  createLabel: 'New Project',
  searchPlaceholder: 'Search name, code, client, city…',
  columns: [
    { key: 'code', label: 'Code', render: (p) => <span className="mono">{p.code}</span> },
    {
      key: 'name', label: 'Project',
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</div>
        </div>
      ),
    },
    { key: 'project_type', label: 'Type', render: (p) => <Badge value="info" label={p.project_type} /> },
    { key: 'client_name', label: 'Client' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'wing_count', label: 'Wings', align: 'right' },
    { key: 'budget', label: 'Budget', align: 'right', render: (p) => fmtMoney(p.budget) },
    { key: 'overall_progress', label: 'Progress', render: (p) => <ProgressBar value={p.overall_progress} /> },
    statusColumn<Project>(),
    { key: 'expected_completion_date', label: 'Due', render: (p) => fmtDate(p.expected_completion_date) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'select', options: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
    { key: 'project_type', label: 'Type', type: 'select', options: ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed', 'other'].map((s) => ({ value: s, label: s })) },
  ],
  fields: () => [
    { key: 'name', label: 'Project name', type: 'text', required: true, width: 'full' },
    { key: 'code', label: 'Project code', type: 'text', hint: 'Auto-generated if left blank' },
    { key: 'project_type', label: 'Type', type: 'select', options: ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed', 'other'].map((s) => ({ value: s, label: s })) },
    { key: 'client_name', label: 'Client / owner', type: 'text' },
    { key: 'developer_name', label: 'Developer', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'pincode', label: 'PIN code', type: 'text' },
    { key: 'address', label: 'Address', type: 'text', width: 'full' },
    { key: 'manager_id', label: 'Project manager', type: 'select', optionsEndpoint: '/auth/user-directory', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'budget', label: 'Budget (₹)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'expected_completion_date', label: 'Expected completion', type: 'date' },
    { key: 'actual_completion_date', label: 'Actual completion', type: 'date' },
    { key: 'description', label: 'Description', type: 'textarea', width: 'full' },
  ],
  defaults: { status: 'planning', project_type: 'residential' },
};

export default function Projects() {
  const navigate = useNavigate();
  return <CrudPage config={{ ...config, onRowClick: (p) => navigate(`/projects/${p.id}`) }} />;
}
