import React, { useState } from 'react';
import CrudPage, { CrudConfig } from '../components/CrudPage';
import { useAuth } from '../auth/AuthContext';

const TABS: { key: string; label: string; perm?: string; config: CrudConfig }[] = [
  {
    key: 'hrms-departments', label: 'Departments', perm: 'hrms.view',
    config: {
      title: 'HR Departments', singularLabel: 'Department', endpoint: '/hrms/departments', module: 'hrms',
      columns: [
        { key: 'name', label: 'Department', render: (row: any) => <strong>{row.name}</strong> },
        { key: 'code', label: 'Code', render: (row: any) => <span className="mono">{row.code}</span> },
        { key: 'description', label: 'Description' },
        { key: 'is_active', label: 'Active', render: (row: any) => row.is_active ? '✅' : '⛔' },
      ],
      fields: () => [
        { key: 'name', label: 'Department name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', hint: 'Leave blank to generate from the name' },
        { key: 'description', label: 'Description', type: 'text', width: 'full' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'hrms-designations', label: 'Designations / Roles', perm: 'hrms.view',
    config: {
      title: 'HR Designations / Roles', singularLabel: 'Designation', endpoint: '/hrms/designations', module: 'hrms',
      columns: [
        { key: 'name', label: 'Designation', render: (row: any) => <strong>{row.name}</strong> },
        { key: 'code', label: 'Code', render: (row: any) => <span className="mono">{row.code}</span> },
        { key: 'role_name', label: 'Linked role', render: (row: any) => row.role_name || <span className="muted">—</span> },
        { key: 'description', label: 'Description' },
        { key: 'is_active', label: 'Active', render: (row: any) => row.is_active ? '✅' : '⛔' },
      ],
      fields: () => [
        { key: 'name', label: 'Designation name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', hint: 'Leave blank to generate from the name' },
        { key: 'role_id', label: 'Role / designation mapping', type: 'select', required: true, optionsEndpoint: '/hrms/login-roles', optionsValueKey: 'id', optionsLabelKey: 'name' },
        { key: 'description', label: 'Description', type: 'text', width: 'full' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'material-categories', label: 'Material Categories', perm: 'materials.view',
    config: {
      title: 'Material Categories', singularLabel: 'Category', endpoint: '/materials/categories', module: 'materials',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'description', label: 'Description' },
        { key: 'is_consumable', label: 'Type', render: (c: any) => (c.is_consumable ? 'Consumable' : 'Non-consumable') },
        { key: 'is_active', label: 'Active', render: (c: any) => (c.is_active ? '✅' : '⛔') },
      ],
      fields: () => [
        { key: 'name', label: 'Category name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'is_consumable', label: 'Consumable', type: 'checkbox' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_consumable: true, is_active: true },
    },
  },
  {
    key: 'worker-categories', label: 'Labour Categories', perm: 'workers.view',
    config: {
      title: 'Labour / Worker Categories', singularLabel: 'Category', endpoint: '/worker-categories', module: 'workers',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'base_daily_rate', label: 'Base daily rate', align: 'right', render: (c: any) => `₹${Number(c.base_daily_rate)}` },
        { key: 'description', label: 'Description' },
      ],
      fields: () => [
        { key: 'name', label: 'Category name', type: 'text', required: true },
        { key: 'base_daily_rate', label: 'Base daily rate (₹)', type: 'number' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'labour-rates', label: 'Labour Rates', perm: 'workers.view',
    config: {
      title: 'Labour Rates', singularLabel: 'Rate', endpoint: '/labour-rates', module: 'workers',
      columns: [
        { key: 'category_name', label: 'Category' },
        { key: 'contractor_name', label: 'Contractor' },
        { key: 'daily_rate', label: 'Daily rate', align: 'right', render: (r: any) => `₹${Number(r.daily_rate)}` },
        { key: 'overtime_rate', label: 'OT rate/hr', align: 'right', render: (r: any) => `₹${Number(r.overtime_rate)}` },
        { key: 'effective_date', label: 'Effective from', render: (r: any) => String(r.effective_date || '').slice(0, 10) },
      ],
      fields: () => [
        { key: 'worker_category_id', label: 'Worker category', type: 'select', required: true, optionsEndpoint: '/worker-categories', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
        { key: 'contractor_id', label: 'Contractor (optional)', type: 'select', optionsEndpoint: '/contractors', optionsValueKey: 'id', optionsLabelKey: 'name' } as any,
        { key: 'daily_rate', label: 'Daily rate (₹)', type: 'number', required: true },
        { key: 'overtime_rate', label: 'Overtime rate (₹/hr)', type: 'number' },
        { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
        { key: 'remarks', label: 'Remarks', type: 'text' },
      ],
      defaults: { effective_date: new Date().toISOString().slice(0, 10) },
    },
  },
  {
    key: 'contractors', label: 'Contractors', perm: 'workers.view',
    config: {
      title: 'Contractors', singularLabel: 'Contractor', endpoint: '/contractors', module: 'workers',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'contact_person', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
        { key: 'gst_number', label: 'GST' },
      ],
      fields: () => [
        { key: 'name', label: 'Contractor/company name', type: 'text', required: true },
        { key: 'contact_person', label: 'Contact person', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'gst_number', label: 'GST number', type: 'text' },
        { key: 'address', label: 'Address', type: 'text', width: 'full' },
      ],
    },
  },
  {
    key: 'boq-categories', label: 'BOQ Categories', perm: 'boq.view',
    config: {
      title: 'BOQ Categories', singularLabel: 'Category', endpoint: '/boq/categories', module: 'boq',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'description', label: 'Description' },
      ],
      fields: () => [
        { key: 'name', label: 'Category name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'test-types', label: 'Test Types', perm: 'test_reports.view',
    config: {
      title: 'Test Types', singularLabel: 'Test Type', endpoint: '/test-types', module: 'test_reports',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'description', label: 'Description' },
      ],
      fields: () => [
        { key: 'name', label: 'Test type name', type: 'text', required: true },
        { key: 'description', label: 'Description / standard', type: 'text' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'inspection-types', label: 'Inspection Types', perm: 'inspections.view',
    config: {
      title: 'Inspection Types', singularLabel: 'Type', endpoint: '/inspection-types', module: 'inspections',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'checklist_template', label: 'Checklist template', render: (c: any) => (c.checklist_template ? c.checklist_template.split(';').join(', ') : '—') },
      ],
      fields: () => [
        { key: 'name', label: 'Inspection type name', type: 'text', required: true },
        { key: 'checklist_template', label: 'Checklist items (separated by ;)', type: 'textarea', width: 'full', hint: 'e.g. PPE compliance;Housekeeping;Edge protection' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'issue-categories', label: 'Issue Categories', perm: 'issues.view',
    config: {
      title: 'Issue Categories', singularLabel: 'Category', endpoint: '/issues/categories', module: 'issues',
      columns: [
        { key: 'name', label: 'Name', render: (c: any) => <strong>{c.name}</strong> },
        { key: 'description', label: 'Description' },
      ],
      fields: () => [
        { key: 'name', label: 'Category name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ],
      defaults: { is_active: true },
    },
  },
  {
    key: 'notification-settings', label: 'Notification Events', perm: 'notifications.view',
    config: {
      title: 'Notification Event Settings', singularLabel: 'Event', endpoint: '/notifications/settings', module: 'notifications',
      columns: [
        { key: 'event_key', label: 'Event key', render: (c: any) => <span className="mono">{c.event_key}</span> },
        { key: 'label', label: 'Event', render: (c: any) => <strong>{c.label}</strong> },
        { key: 'enabled', label: 'Enabled', render: (c: any) => (c.enabled ? '✅ On' : '⛔ Off') },
      ],
      fields: () => [
        { key: 'event_key', label: 'Event key', type: 'text', required: true },
        { key: 'label', label: 'Label', type: 'text', required: true },
        { key: 'enabled', label: 'Enabled', type: 'checkbox' },
      ],
      defaults: { enabled: true },
    },
  },
];

export default function Masters() {
  const { can } = useAuth();
  const [tab, setTab] = useState('material-categories');
  const visibleTabs = TABS.filter((item) => !item.perm || can(item.perm));
  const active = visibleTabs.find((item) => item.key === tab) || visibleTabs[0];
  if (!active) return <div className="empty-state">You do not have permission to view master data.</div>;
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tabs" style={{ padding: '0 10px' }}>
          {visibleTabs.map((item) => (
            <button key={item.key} className={active.key === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>
          ))}
        </div>
      </div>
      <CrudPage key={active.key} config={active.config} />
    </>
  );
}
