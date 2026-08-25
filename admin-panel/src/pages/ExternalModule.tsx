import React from 'react';

type Props = {
  slug: 'hrms' | 'petty-cash';
};

// Small handoff page for back-office modules that live entirely in the
// operator web-app. The admin panel deliberately doesn't ship its own
// editor screens here — they're managed by the project controllers.
const COPY = {
  hrms: {
    title: 'HR & Payroll',
    subtitle: 'Employees, leave, salary structures & monthly payroll',
    body:
      'These records are owned by the HR and accounts roles and edited from the project-team web app under People → HR & Payroll. ' +
      'Super admins can review leave approvals and payroll exports there. The admin panel intentionally keeps these modules read-only via the API.',
    bulletHead: 'Where to manage HR & payroll',
    bullets: [
      'Employee master, designation, department, project & wing assignment — /web/hrms/employees',
      'Leave types, requests, approvals and the leave balance — /web/hrms/leave',
      'Salary structures (basic, HRA, DA, PF, ESIC, PT) — /web/hrms/leave → Salary tab',
      'Monthly payroll generation and per-employee net pay — /web/hrms/payroll',
    ],
  },
  'petty-cash': {
    title: 'Petty Cash',
    subtitle: 'Top-ups, expenses & category spend by site',
    body:
      'Petty cash is recorded at the site level by accountants. Each transaction is project-scoped and tallies up into Cash & Petty summary cards on the dashboard. Open the operator app to add top-ups, expenses or replenishments.',
    bulletHead: 'Where to record petty cash',
    bullets: [
      'Cash on hand, top-ups, expenses and category split — /web/petty-cash',
      'Project context picker — choose a project first; numbers roll up into Reports & Dashboards',
      'Add receipts and reference files — receipts.attach',
    ],
  },
} as const;

export default function ExternalModule({ slug }: Props) {
  const c = COPY[slug];
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr' }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header" style={{ background: 'var(--brand-soft)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--brand)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {slug === 'hrms' ? '🧑‍💼' : '💵'}
            </div>
            <div>
              <h3 style={{ margin: 0 }}>{c.title}</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>{c.subtitle}</div>
            </div>
          </div>
        </div>
        <div className="card-pad">
          <p style={{ margin: 0, marginBottom: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>{c.body}</p>
          <h4 style={{ marginTop: 0, fontSize: 14 }}>{c.bulletHead}</h4>
          <ul style={{ paddingLeft: 18, margin: '8px 0 0', color: 'var(--ink-2)', lineHeight: 1.7 }}>
            {c.bullets.map((b, i) => (
              <li key={i}><code style={{ background: 'var(--bg-tint)', padding: '1px 6px', borderRadius: 5, fontSize: 12.5 }}>{b.split('—')[0].trim()}</code> {b.split('—').slice(1).join('—')}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
