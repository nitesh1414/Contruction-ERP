# Construction ERP — Complete User Manual

| | |
|---|---|
| **Document** | User Manual — complete screen guide with full data flow |
| **Version** | 2.0 (supersedes 1.0) |
| **Product** | BuildTrack — Construction Project Tracking · v1.0 |
| **Covers** | Web Portal (`web-app`), Admin Console (`admin-panel`), Mobile App (`mobile`), Marketing site, Backend API & MySQL data model |
| **Last updated** | 18 September 2026 |

## Contents

1. System overview
2. Roles, permissions & access control
3. Logging in & account basics
4. Web Portal — complete screen & tab guide
5. Admin Console — complete screen & tab guide
6. Mobile App — screen guide
7. End-to-end data flows (complete)
8. Data dictionary — all database tables
9. Status & workflow reference
10. Tips, FAQ & troubleshooting

**How to read this manual.** Every screen section follows the same pattern: what the screen is for, how to operate it step by step, and a **Data flow** table tracing each user action from the UI, through the REST API endpoint, to the exact MySQL tables written or read, including side effects (notifications, stock updates, status changes, audit entries). Chapter 7 combines these into the complete cross-module data flows a site team actually runs day to day.

---

## 1. System overview

Construction ERP is a complete project-tracking platform for construction companies. It is built from five deployable applications that all talk to one backend and one MySQL database:

| App | Stack | Who uses it | Purpose |
|---|---|---|---|
| **Backend API** (`backend/`) | Node.js 18+, Express, raw `mysql2` (no ORM) | — | REST API: JWT auth, RBAC, project/wing scoping, file uploads, audit trail, 65-table schema |
| **Web Portal** (`web-app/`) | React 18 + Vite + TypeScript | PMs, engineers, store, sales, accounts, quality & safety | Day-to-day project work: progress, workforce, materials, BOQ, quality, HR & payroll, petty cash, sales, reports |
| **Admin Console** (`admin-panel/`) | React 18 + Vite + TypeScript | Super Admin / Admin | Users & employees, roles & permission matrix, master data, audit logs, broadcasts |
| **Mobile App** (`mobile/`) | React Native + Expo SDK 54 | Site engineers & field staff | Offline-first daily progress with camera + GPS, attendance, issues, inspections, sync queue, push notifications |
| **Marketing site** (`marketing/`) | React 18 + Vite + TypeScript | Visitors | Public landing page describing the ERP's actual capabilities |

### 1.1 Key concepts you must know first

- **Project structure.** Every project is organised as **Projects → Wings/Blocks → Floors → Units**. This hierarchy drives progress roll-up, access scoping and reporting.
- **Automatic progress roll-up.** When a daily progress report is saved, the server recomputes: **wing progress** = average of all `daily_progress.percentage` rows for that wing; **project overall progress** = average of its wings' progress. You never type project % by hand.
- **Role-based access (RBAC).** Every module has up to 8 permission actions: `view · create · edit · delete · approve · export · upload · download`. Roles bundle permissions; users get roles. The UI hides menu items and buttons you cannot use — and the API re-checks every single request.
- **Project & wing scoping.** Beyond module permissions, each user is assigned specific **projects (and optionally wings)** in `user_projects`. Scoped users only see and act on their own projects. A row with `wing_id = 0` means "all wings of that project". Super Admin and the Admin role are global.
- **One shared employee directory.** The Admin Console and the Web Portal read and write the **same** `hrms_employees` records. A login account and its employee record represent the same person, linked by `hrms_employees.user_id`. You can create either side and offer to create/link the other; the link is one-to-one and never bypasses RBAC.
- **Everything is audited.** Every create / update / delete / export writes a row to `audit_logs` with who, when, which module and record, the IP, and the full old/new JSON values.
- **Event-driven notifications.** Assignments, approvals, rejections, low stock, overdue issues, failing tests, expiring documents and pending collections raise in-app notifications (and Expo push on mobile). Every event can be switched off in Admin → Masters → Notification Events.
- **Offline-first mobile.** The mobile app queues progress reports and issues locally (with a unique `client_ref`) when there is no network and auto-syncs in the background. The server de-duplicates by `client_ref`, so re-syncing never creates double entries.

### 1.2 Architecture & data flow (big picture)

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  Web Portal (React)  │   │ Admin Console (React)│   │ Mobile (Expo, offline│
│  localhost:5173 dev  │   │  localhost:5174 dev  │   │  queue + Expo push)  │
└──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │  HTTPS /api (JWT Bearer) │  HTTPS /api (JWT Bearer) │ HTTPS /api
           ▼                          ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND  ·  Express REST API :4000                     │
│  authenticate (JWT access 15min + rotating refresh)  →  attachProjectScope    │
│  requirePermission(module.action)   →  controller   →  raw SQL (mysql2)       │
│  side effects: audit_logs · notifications · stock_transactions · roll-up      │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       ▼
                 ┌──────────────────────────────────────────┐
                 │      MySQL 8 · 65 tables + files on disk │
                 │  identity · projects · materials · HRMS  │
                 │  quality · sales · finance · audit       │
                 └──────────────────────────────────────────┘
```

Data-flow rule of thumb for every screen in this manual:

**UI action → one REST call → controller validates (permission + project scope) → transactional SQL writes the business tables → side effects (stock ledger, progress roll-up, notifications, audit row) → JSON response → UI refreshes.**

---

## 2. Roles, permissions & access control

### 2.1 Permission model

- A **permission** is a code `module.action`, e.g. `materials.approve`, `hrms.create`, `attendance.export`.
- A **role** is a named set of permission ids (`role_permissions` join table).
- A **user** has one or more **roles** (`user_roles`) and an optional list of **project/wing assignments** (`user_projects`).
- The **Super Admin** role (`super_admin`) bypasses every check. The **Admin** role (`admin`) is global across projects.
- All other users must hold the specific `module.action` permission **and** be inside their project/wing scope for any record-level operation.

Permission codes are managed centrally (Admin Console → Roles → Permissions matrix); custom roles can be created at any time from any combination of checkboxes.

### 2.2 Seeded roles

The installer seeds 12 ready-made roles. Admins can create further **custom** roles.

| Role (code) | Typical daily work |
|---|---|
| Super Admin (`super_admin`) | Full unrestricted access to both apps, all data, role matrix |
| Admin (`admin`) | System administration: users, masters, audit, broadcasts (global project visibility) |
| Project Manager (`project_manager`) | Owns assigned projects: structure, milestones, approvals (requirements, POs, BOQ), reports, billing, workforce |
| Site Engineer (`site_engineer`) | Daily progress with GPS photos, attendance, issues, inspections, consumption — on assigned projects/wings |
| Civil / Electrical / Plumbing Engineer (`civil_engineer`, `electrical_engineer`, `plumbing_engineer`) | Same as Site Engineer, scoped to their discipline (demo accounts are wing-scoped to demonstrate scoping) |
| Sales Executive (`sales_executive`) | Unit sales, booking-to-payment tracking, collections, sales export |
| Store Manager (`store_manager`) | Material master, requirement → PO → GRN → stock, suppliers, returns, low-stock follow-up |
| Accountant (`accountant`) | Cost/billing entries, vendor dues, labour payments, payroll payments, financial reports |
| Safety Officer (`safety_officer`) | Safety inspections, safety issues, documents |
| Quality Engineer (`quality_engineer`) | Material test reports (approve/reject), inspection checklists |
| Custom roles | Anything you build — e.g. "Contractor (view-only)", "Client (view-only)", "Surveyor" |

### 2.3 Demo logins (after `npm run db:setup`)

All demo accounts exist in the seeded database. **Change all passwords before any real deployment.**

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@constructionerp.com | Admin@123 |
| Admin (Console) | admin.user@constructionerp.com | Password@123 |
| Project Manager | pm@constructionerp.com | Password@123 |
| Site Engineer | engineer@constructionerp.com | Password@123 |
| Civil / Electrical / Plumbing Engineer | civil@ / electrical@ / plumbing@constructionerp.com | Password@123 |
| Sales Executive | sales@constructionerp.com | Password@123 |
| Store Manager | store@constructionerp.com | Password@123 |
| Accountant | accounts@constructionerp.com | Password@123 |
| Safety Officer | safety@constructionerp.com | Password@123 |
| Quality Engineer | quality@constructionerp.com | Password@123 |

### 2.4 How access control appears in the UI

- **Web Portal sidebar** items and **Admin Console** menu items are filtered by `canAny(perm)` — if your roles have none of the required permission for a module, the menu entry simply does not exist.
- **Route guard.** Opening a URL directly without the required permission shows a "No access — contact your administrator" card.
- **Row-level buttons.** Approve / Reject / Delete / Export buttons appear only when the matching `module.action` permission is present.
- **Server-side enforcement.** Even with a tampered client, the API returns `403 Missing permission: module.action` or `403 No access to project N / wing N` from `assertProjectAccess`.
- **Data scoping.** List queries for scoped users are filtered to `user_projects`; the demo electrical & plumbing engineers only see their wing's data.
