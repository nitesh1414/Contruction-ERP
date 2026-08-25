import React from 'react';

/**
 * BuildTrack landing page — a small React app that explains what the
 * product does and links to the web demo. Copy is original and written
 * specifically for this project; module names match the actual app.
 */

const CORE_MODULES = [
  {
    icon: '🏗️',
    title: 'Projects',
    body:
      'Track projects → wings → floors → units with automatic progress roll-up. Site teams never have to re-enter the same number twice.',
  },
  {
    icon: '📋',
    title: 'Daily progress & DPR',
    body:
      'Engineers post work description, percentage, labour count and materials used from site. Auto-rolls up to wing and project completion.',
  },
  {
    icon: '👷',
    title: 'Attendance',
    body:
      'Mark labour and staff on site with a single tap. Wages are computed from the same data; no retyping.',
  },
  {
    icon: '🚜',
    title: 'Equipment',
    body:
      'Track hire, deployed hours, breakdowns and fuel. Monthly hire billing rolls up straight into payroll.',
  },
  {
    icon: '🧱',
    title: 'Materials & inventory',
    body:
      'Requirement → PO → receipt → consumption, with a signed quantity ledger. Live stock and low-stock alerts.',
  },
  {
    icon: '💰',
    title: 'Petty cash',
    body:
      'Top-ups, expenses and replenishments by site. Category split for cash-on-hand reporting.',
  },
  {
    icon: '🧑‍💼',
    title: 'HR & payroll',
    body:
      'Employees, leave, salary structures and monthly payroll generation — derived from approved leave and the salary component tree.',
  },
  {
    icon: '🏠',
    title: 'CRM & sales',
    body:
      'Units, bookings, payments and GST. Staged collection plan with overdue tracking.',
  },
  {
    icon: '⚠️',
    title: 'Issues & quality',
    body:
      'Geo-tagged photos, priority routing, workflow transitions, and inspection/test report sign-off.',
  },
];

const STEPS = [
  {
    n: 1,
    h: 'Onboard the project',
    p: 'Create the project, add wings and floors, and invite the site engineers and store team.',
  },
  {
    n: 2,
    h: 'Capture the work',
    p: 'Site engineers post daily progress, mark attendance, raise issues and book materials — all from the mobile app.',
  },
  {
    n: 3,
    h: 'Pay and report',
    body: 'Wages and vendor bills are computed from real attendance and material consumption. Reports roll up automatically.',
    p:
      'Accountants run payroll, petty-cash tally, and A4-ready weekly reports for owners and PMC.',
  },
];

const USE_CASES = [
  {
    who: 'Project managers',
    icon: '🏗️',
    h: 'See the whole site at a glance',
    p:
      'Live progress %, tenders, and pending approvals on one screen. No more Saturday morning phone calls.',
  },
  {
    who: 'Site engineers',
    icon: '📱',
    h: 'Submit work from the gate',
    p:
      'Offline-capable mobile app captures progress, photos, attendance and issues without flaking on bad signal.',
  },
  {
    who: 'Accounts & salaries',
    icon: '💵',
    h: 'Pay based on what actually happened',
    p:
      'Wages flow from attendance, contractor bills flow from materials and days, petty cash reconciles by category.',
  },
  {
    who: 'Owners & PMC',
    icon: '📊',
    h: 'A4 reports, not voicemails',
    p:
      'Weekly budget-vs-actual, milestone drift and pending collections, all exportable to PDF for the client meeting.',
  },
];

export default function App() {
  return (
    <>
      <header className="hero">
        <div className="ct">
          <span className="brand"><span className="brand-mark">B</span> BuildTrack</span>
          <div style={{ height: 26 }} />
          <span className="eyebrow">One platform · four apps · every project</span>
          <h1>
            Site operations, projects, accounts and people —<br />
            in <em>one ERP</em> your site team actually uses.
          </h1>
          <p className="lead">
            BuildTrack is a construction project tracking platform built from
            production code: a web operator console, an admin panel,
            an offline-first mobile app, and a single MySQL backend. Every
            module — daily progress, attendance, materials, billing, HR,
            equipment, quality — talks to the same database, so the office
            sees what site recorded without a phone call.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="http://localhost:5173" target="_blank" rel="noreferrer">Open the web app →</a>
            <a className="btn btn-ghost" href="#modules">See the modules</a>
            <a className="btn btn-ghost" href="http://localhost:5173/login" target="_blank" rel="noreferrer">Sign in</a>
          </div>
        </div>
      </header>

      <div className="trust-strip">
        <div className="ct">
          <span>Originally drafted from a working 4-app codebase</span>
          <span>React 18 · React Native (Expo) · Node + Express · MySQL 8</span>
          <span>JWT auth · RBAC · Audit log · Offline-first mobile capture</span>
        </div>
      </div>

      <main>
        <section className="section" id="modules">
          <div className="ct">
            <span className="eyebrow-dark">Modules</span>
            <h2>Eleven module areas, <span className="accent">one connected system</span></h2>
            <p className="lede">
              Each module is sized for the people who use it — engineers,
              store keepers, accountants, owners — and stitched together so a
              number entered once shows up everywhere it should.
            </p>
            <div className="module-grid">
              {CORE_MODULES.map((m) => (
                <div className="module-card" key={m.title}>
                  <div className="icon-box" aria-hidden>{m.icon}</div>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="ct">
            <span className="eyebrow-dark">How it runs</span>
            <h2>Three steps from <span className="accent">idea to invoice</span></h2>
            <p className="lede">
              The same flow that powers multi-tower residential builds:
              set up once, run it from the gate, pay it from the office.
            </p>
            <div className="steps">
              {STEPS.map((s) => (
                <div className="step" key={s.n}>
                  <div className="num">{s.n}</div>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="audiences">
          <div className="ct">
            <span className="eyebrow-dark">Who it&apos;s for</span>
            <h2>Built for the whole jobsite</h2>
            <p className="lede">
              Four roles, four ways into the same data. Site team in the
              field, project office in front of a screen, accounts in the
              back office, owners needing a one-pager.
            </p>
            <div className="uses-grid">
              {USE_CASES.map((u) => (
                <div className="use-card" key={u.h}>
                  <div className="avatar">{u.icon}</div>
                  <div>
                    <div className="who">{u.who}</div>
                    <h3>{u.h}</h3>
                    <p>{u.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="ct">
            <h2>Want to see it on your own site?</h2>
            <p>
              The seeded demo includes two projects, three wings, ten workers,
              suppliers, POs and a QC report — enough to click through every
              module without typing data. Sign in as a project manager or
              accountant to see the most useful screens first.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="http://localhost:5173" target="_blank" rel="noreferrer">Open the demo →</a>
              <a className="btn btn-secondary" href="http://localhost:5174" target="_blank" rel="noreferrer">Admin panel</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="ct">
          <span>BuildTrack · Construction project tracking</span>
          <span>v1.0 · Originally drafted from production code</span>
        </div>
      </footer>
    </>
  );
}
