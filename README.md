# 🏗️ Construction ERP — Construction Project Tracking System

A complete, production-ready construction project tracking platform with **four integrated applications**:

| App | Stack | Purpose |
|---|---|---|
| [`backend/`](backend/) | Node.js + Express + MySQL | REST API — JWT auth, RBAC, file uploads, audit trail, 55-table schema, HR & payroll, petty cash, equipment |
| [`web-app/`](web-app/) | React 18 + Vite + TypeScript | Project teams: progress, attendance, materials, BOQ, quality, HR & payroll, petty cash, sales, reports |
| [`admin-panel/`](admin-panel/) | React 18 + Vite + TypeScript | Administrators: users, roles & permission matrix, master data, audit logs, broadcasts |
| [`mobile/`](mobile/) | React Native + Expo SDK 54 | Site engineers: offline-first progress capture with camera + GPS, attendance, issues, inspections |
| [`marketing/`](marketing/) | React 18 + Vite + TypeScript | Public landing page — original copy describing the ERP's actual capabilities |

Everything runs against a single **MySQL** database — no MongoDB, no ORM (raw `mysql2` with parameterized queries), no monolith: the API is fully independent and each frontend talks to it over REST.

---

## ✨ Feature overview

**Project structure** — projects → wings/blocks → floors → units, with automatic progress roll-up (floor → wing → project).

**Daily progress** — date-wise reports with work description, %, labour count, materials used, weather, remarks, and **GPS geo-tagged photos** (latitude / longitude / timestamp / uploaded-by stored per photo). Offline queue on mobile with `client_ref` duplicate protection and background auto-sync.

**Materials & inventory** — full lifecycle: requirement → purchase order (auto totals: subtotal + tax − discount) → goods receipt (GRN with damaged-quantity capture) → consumption (live stock check) → returns → stock transactions ledger. Low-stock alerts.

**BOQ** — quantity × rate items, subtotal / taxes / discounts / grand total, estimated vs actual, quantity & cost variance (%), CSV template export + bulk import.

**Quality** — material test reports (approve / reject workflow), inspections with configurable checklists (pass / fail / N/A per item, GPS, photos).

**Issues / snags** — priority, assignment, due dates, discussion thread, status workflow (open → assigned → in_progress → resolved → closed, reopen), overdue alerts.

**Workforce** — worker master, categories, contractors, labour rates, daily attendance (present / absent / leave / half-day / overtime with auto wage + OT calculation), labour payment generation from attendance, monthly wage report.

**HR & payroll** — one shared employee directory is used by the Admin Console and Project Tracking web app. Admin users can add, update and delete employees, optionally provision linked login credentials, manage leave and salary structures, generate payroll and record payments. Employee identity fields stay synchronized through `hrms_employees.user_id`.

**Billing & sales** — cost entries by category/vendor with payment status, budget-vs-actual, unit sales with GST, staged payments, unit availability, pending collections.

**Documents & drawings** — version-controlled drawings with revision approval, expiring-document alerts.

**Notifications** — in-app + Expo push (mobile registers its push token), event-driven (assignments, approvals, low stock, overdue issues, expiring documents, pending collections), per-event settings, admin broadcast.

**Security** — bcrypt password hashing, JWT access + refresh tokens (rotating, revocable), fine-grained permission-based authorization (`module.action`), project/wing-level access scoping, rate limiting, helmet headers, full audit trail of every mutation.

---

## 🚀 Quick start (development)

Prerequisites: **Node.js ≥ 18**, **MySQL ≥ 8**, npm.

```bash
# 1. Backend API  → http://localhost:4000
cd backend
cp .env.example .env          # set DB_USER / DB_PASSWORD / JWT secrets
npm install
npm run db:setup              # creates schema + seeds roles, permissions & demo data
npm run dev

# 2. Web app  → http://localhost:5173
cd ../web-app
npm install
npm run dev                   # proxies /api → http://localhost:4000

# 3. Admin panel  → http://localhost:5174
cd ../admin-panel
npm install
npm run dev

# 4. Mobile app (Expo)
cd ../mobile
npm install
npx expo start                # scan the QR code with Expo Go
```

**Seed logins** (all on the web app / admin panel / mobile):

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@constructionerp.com` | `Admin@123` |
| Project Manager | `pm@constructionerp.com` | `Password@123` |
| Site Engineer | `engineer@constructionerp.com` | `Password@123` |
| Civil / Electrical / Plumbing Engineer | `civil@`, `electrical@`, `plumbing@constructionerp.com` | `Password@123` |
| Sales Executive | `sales@constructionerp.com` | `Password@123` |
| Store Manager | `store@constructionerp.com` | `Password@123` |
| Accountant | `accounts@constructionerp.com` | `Password@123` |
| Safety Officer | `safety@constructionerp.com` | `Password@123` |
| Quality Engineer | `quality@constructionerp.com` | `Password@123` |

> The electrical & plumbing demo users are scoped to specific wings to demonstrate project-level access control. Change all passwords before deploying.

The Admin Console HR & Payroll directory and the Project Tracking web app HR & Payroll panel read and write the same `/api/hrms/employees` records. The web app shows the complete employee population with search, status filters and pagination; an Admin-role user has global project visibility plus employee create, edit and delete access. A login may be created from either the Admin Console Users flow or the web app employee flow only after the operator explicitly confirms that credentials are required.

Verify the backend end-to-end (after `db:setup` + server running):

```bash
cd backend && npm run smoke      # 16 automated checks against a live API + MySQL
```

---

## 📚 Documentation

| Document | Contents |
|---|---|
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) / [PDF](docs/Construction-ERP-User-Manual.pdf) | **User manual** — every screen of all 3 apps + step-by-step project flow |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Full installation guide — prerequisites, per-app setup, env variables |
| [docs/DATABASE.md](docs/DATABASE.md) | Database setup, schema reference (55 tables), migrations & seeding |
| [docs/API.md](docs/API.md) | REST API reference — auth, every module, query params, multipart uploads |
| [docs/MOBILE_BUILD.md](docs/MOBILE_BUILD.md) | Mobile build instructions — Expo Go, EAS Build, Android APK/AAB, iOS IPA |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment — MySQL hardening, PM2/systemd, Nginx, HTTPS, builds |
| [docs/Construction-ERP-Brochure.pptx](docs/Construction-ERP-Brochure.pptx) | Marketing presentation deck |
| [docs/Construction-ERP-Brochure.pdf](docs/Construction-ERP-Brochure.pdf) | Marketing brochure (PDF) |

---

## 🏛️ Repository layout

```
Contruction-ERP/
├── backend/               # Express REST API
│   ├── database/schema.sql # 55 tables, FKs, indexes, stock view
│   ├── scripts/            # migrate.js, seed.js, smoke.js
│   └── src/
│       ├── config/  db/  middleware/  utils/
│       └── modules/        # auth, users, roles, projects, progress, milestones,
│                           # drawings, materials(+inventory), billing, boq, quality,
│                           # issues, workforce, sales, documents, notifications,
│                           # dashboard, reports, admin, files
├── web-app/               # React + Vite project/site portal (18 screens)
├── admin-panel/           # React + Vite admin console (9 screens)
├── mobile/                # Expo SDK 54 app (15 screens, offline-first)
└── docs/ci-workflow.yml    # Ready-to-install GitHub Actions CI file (see below)
```

## 🔑 API structure (excerpt)

```
/api/auth /api/users /api/roles /api/projects /api/wings /api/floors /api/units
/api/progress /api/milestones /api/drawings /api/materials /api/purchase-orders
/api/stock /api/billing /api/boq /api/test-reports /api/inspections /api/issues
/api/workers /api/attendance /api/labour-payments /api/hrms /api/petty-cash /api/sales /api/documents
/api/notifications /api/dashboard /api/reports /api/admin /api/files
```

## ✅ CI

A ready-made GitHub Actions workflow ships at [docs/ci-workflow.yml](docs/ci-workflow.yml). To enable it, copy it to `.github/workflows/ci.yml` once:

```bash
mkdir -p .github/workflows && cp docs/ci-workflow.yml .github/workflows/ci.yml
```

> Installing a workflow file requires a token with the **workflow** permission, so this one-time copy is done by the repo owner from their machine or the GitHub web UI ("Add file").

It spins up MySQL 8.0 and runs, on every push:

1. **backend** — syntax check → migrate → seed → boot → 16-point smoke test
2. **web-app** — `tsc` + production build
3. **admin-panel** — `tsc` + production build
4. **mobile** — TypeScript type-check

---

_Tech choices by design: Express + raw SQL (mysql2) over an ORM gives transparent, index-tuned queries; Expo gives one codebase for Android/iOS with native camera, GPS and push capabilities._
