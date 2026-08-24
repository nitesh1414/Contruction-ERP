import React from 'react';
import CrudPage, { CrudConfig, statusColumn } from '../components/CrudPage';
import { Badge, ProgressBar, fmtDate } from '../components/ui';
import type { Milestone } from '../api/types';

const config: CrudConfig<Milestone> = {
  title: 'Milestones',
  singularLabel: 'Milestone',
  endpoint: '/milestones',
  module: 'milestones',
  createLabel: 'New Milestone',
  columns: [
    { key: 'name', label: 'Milestone', render: (m) => <div><div style={{ fontWeight: 600 }}>{m.name}</div><div className="muted" style={{ fontSize: 12 }}>{m.project_name}{m.wing_name ? ` · ${m.wing_name}` : ''}</div></div> },
    { key: 'start_date', label: 'Start', render: (m) => fmtDate(m.start_date) },
    { key: 'target_date', label: 'Target', render: (m) => fmtDate(m.target_date) },
    { key: 'percentage', label: 'Progress', render: (m) => <ProgressBar value={m.percentage} color={m.percentage >= 100 ? 'green' : undefined} /> },
    statusColumn<Milestone>(),
    { key: 'responsible_name', label: 'Responsible' },
  ],
  filters: [
    { key: 'projectId', label: 'Project', type: 'select', optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'completed', 'delayed'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
  ],
  fields: () => [
    { key: 'project_id', label: 'Project', type: 'select', required: true, optionsEndpoint: '/projects', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'name', label: 'Milestone name', type: 'text', required: true, width: 'full' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'target_date', label: 'Target date', type: 'date' },
    { key: 'percentage', label: 'Progress %', type: 'number', hint: '100 auto-completes the milestone' },
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'completed', 'delayed'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
    { key: 'responsible_user_id', label: 'Responsible person', type: 'select', optionsEndpoint: '/auth/user-directory', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
    { key: 'completion_date', label: 'Completion date', type: 'date' },
    { key: 'description', label: 'Description', type: 'textarea', width: 'full' },
    { key: 'remarks', label: 'Remarks', type: 'text', width: 'full' },
  ],
  defaults: { status: 'pending', percentage: 0 },
  transformForSave: (data) => ({ ...data, wing_id: null }),
};

export default function Milestones() {
  return <CrudPage config={config} />;
}
