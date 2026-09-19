---

## 3. Logging in & account basics

### 3.1 Sign in (Web Portal and Admin Console)

Both applications use the same login flow.

1. Open the app URL. If you are not signed in you are redirected to **Login**.
2. Enter your **email** and **password** and press **Sign in**.
3. On success you land on your default screen: the Web Portal Dashboard or the Admin Console Dashboard.

**What happens behind the scene (data flow):**

| Step | UI | API | Database tables | Effect |
|---|---|---|---|---|
| 1 | Submit email + password | `POST /api/auth/login` | `users` (bcrypt hash check), `refresh_tokens` (insert hashed token), `users.last_login_at` updated | Access token (short-lived) + rotating refresh token returned; JWT carries user id, roles, permission set |
| 2 | App stores tokens, calls `/api/auth/me` | `GET /api/auth/me` | `users`, `user_roles`, `role_permissions`, `permissions`, `user_projects`, `hrms_employees` (via `user_id`) | Full profile: roles, permission codes, project/wing access, linked employee (if any) |
| 3 | Sidebar renders | — | — | Menu items filtered by permission codes |

- **Token refresh.** The API client automatically calls `POST /api/auth/refresh` when the access token expires. The old refresh token is **revoked and a new one issued** (rotation); a stolen refresh token can therefore only be used once.
- **Session revocation.** Logging out (`POST /api/auth/logout`) or an admin resetting your password revokes all of your refresh tokens immediately — every device is signed out.
- **Rate limiting.** Login endpoints are rate-limited to block credential brute force.

### 3.2 Forgot password

1. On the login screen click **Forgot password?**.
2. Enter your email and submit. If the account exists, the server creates a **password reset token** (single-use, time-limited) and an email link is produced by the mail pipeline configured in `backend/.env`.
3. Open the link, enter a new password (min 8 characters) on the **Reset password** screen, submit — you are back at login, and all previous sessions are revoked.

| Step | UI | API | Database tables |
|---|---|---|---|
| Request | Email form | `POST /api/auth/forgot-password` | `password_reset_tokens` (new token row) |
| Reset | New password form | `POST /api/auth/reset-password` | `users.password` updated, `password_reset_tokens` consumed, `refresh_tokens` for the user revoked |

### 3.3 My Profile (Web Portal)

Open the user chip (top right) → **My Profile**.

- **Left card — profile.** Shows avatar, name, email, employee code (if linked), role badges and **SUPER ADMIN** badge when applicable. You can edit **Full name** and **Phone** (saved via `PUT /api/auth/profile` → `users`).
  - **HR & Payroll profile block** (only when your login is linked to an employee): employee code, department, effective designation, employment type, project, status. Changes made by HR on the employee record appear here automatically.
  - **Project Access list:** every project (and wing, if wing-scoped) you are assigned to; Super Admins with no entries see "access to all projects".
- **Right card — change password.** Current password, new password (min 8 chars), confirm. On success you are logged out and must sign in again.

| Action | API | Tables |
|---|---|---|
| Save name/phone | `PUT /api/auth/profile` | `users` |
| Change password | `POST /api/auth/change-password` | `users.password`, all `refresh_tokens` revoked |

---

## 4. Web Portal — complete screen & tab guide

The Web Portal is where construction work happens. The sidebar (left) is grouped into four work areas; every entry is permission-gated:

| Sidebar group | Menu items |
|---|---|
| Site Operations | Dashboard · Projects · Daily Progress · Workforce & Attendance · Equipment |
| Project Management | Tasks & Milestones · Drawings · Inspections · Test Reports · Documents · Issues / Snags |
| Accounts & Sales | Materials & Inventory · BOQ · Payments · Petty Cash · CRM & Sales · HR & Payroll |
| Insights | Reports & Dashboards |

### 4.0 Global chrome: top bar, search, notifications bell, user menu

- **Top bar.** Page title for the current screen, a global search field (projects, tasks, materials), the notifications bell, and the user chip (name + primary role) opening **My Profile** and **Logout**.
- **Notifications bell.** Polls `GET /api/notifications?limit=12` on open and every 60 seconds; unread count shown as a badge (capped at 99+).
  - Clicking a notification marks it read (`PUT /api/notifications/:id/read`) and **deep-links** you into the module: issues → Issues, milestones → Tasks, materials/inventory/purchase_orders → Materials (PO tab), inspections, test reports, sales, documents, drawings, hrms, petty_cash, system → home.
  - **Mark all read** via `POST /api/notifications/mark-all-read`.
  - Notification rows are tinted by type: success (green), warning (orange), error (red), info (blue).
- **User menu.** My Profile / Logout (`POST /api/auth/logout` revokes sessions).

| Action | API | Tables |
|---|---|---|
| Open bell | `GET /api/notifications?limit=12` | `notifications` (per current user, unread count) |
| Click item | `PUT /api/notifications/:id/read` | `notifications.is_read = 1` |
| Mark all | `POST /api/notifications/mark-all-read` | `notifications.is_read = 1` for all of user's rows |

### 4.1 Dashboard

The landing page gives a cross-module snapshot of everything the organisation is doing.

**Elements**

- **Hero banner** — greeting, active project count, units sold, open issues; quick buttons to Projects and a new Daily update.
- **8 KPI tiles** — Total Projects (with average progress), Total Wings, Open Issues (with high/critical count), Pending Inspections, Low-Stock Materials, Units Sold (with collections), Pending Labour Payment (amount + count), Vendor Dues (unpaid bills).
- **Charts & lists** — Site Progress Trend (avg daily progress % over last 30 days), Projects by Status (donut), Budget vs Actual Cost per project (₹ lakhs), Pending Issues list (priority + status badges), Recent Daily Updates (with %), Milestones Overview (counts by status), Sales collections callout, Documents expiring soon (top 3).
- **Module quick launch** — 10 tiles deep-linking into the core modules.

**Data flow.** One call powers the whole page:

| UI | API | Tables read (join/aggregate) |
|---|---|---|
| Entire dashboard | `GET /api/dashboard/overview` | `projects`, `wings`, `units`, `daily_progress` (30-day trend), `issues`, `inspections`, `materials` + `stock_transactions` (low stock), `sales` + `sales_payments` (sold/value/pending), `labour_payments` (pending), `cost_entries` (vendor dues), `milestones`, `project_documents` (expiring) |

Nothing on this page is editable — it is a read-only aggregate.

![Web Portal dashboard](assets/screenshots/web-01-dashboard.png)

### 4.2 Projects

The register of all projects you can see (scoped users see only their assignments).

**Elements**

- **Table columns** — Code, Project (name + city/state), Type badge, Client, Manager, Wing count, Budget, Progress bar, Status badge, Expected completion.
- **Filters** — Status (planning / in_progress / on_hold / completed / cancelled), Type (residential / commercial / industrial / infrastructure / mixed / other).
- **Search** — name, code, client, city.
- **CRUD modal (New Project)** — Name, Code (auto-generated if blank), Type, Client/owner, Developer, City, State, PIN, Address, Project manager (user directory), Budget (₹), Status, Start / Expected / Actual completion dates, Description.
- **Actions** — Export CSV (when `projects.export`), Edit / Delete per row. Row click opens **Project Details** (4.3).

**Data flow**

| Action | API | Tables |
|---|---|---|
| List + search + filter | `GET /api/projects?search=&status=&project_type=&page=&limit=` | `projects` (+ `wings` count, manager name join), filtered by `user_projects` scope |
| Create | `POST /api/projects` | `projects` (code auto-generated like `PRJ-####` when blank), `audit_logs` |
| Edit | `PUT /api/projects/:id` | `projects` (old/new values captured in audit), `audit_logs` |
| Delete | `DELETE /api/projects/:id` | `projects` (blocked while child records exist — wings, progress, etc.), `audit_logs` |
| Export | `GET /api/projects/export` | same query → CSV download; `audit_logs` action=export |

**Status values:** `planning → in_progress → on_hold → completed | cancelled` (managed by the manager; "cancelled" and "completed" are terminal for reporting).

![Projects list](assets/screenshots/web-02-projects.png)

### 4.3 Project Details

Open any project row. The page has a header (name, status, type, code, client, city/state, manager, **overall progress bar** — always server-computed) and tabs:

**Tab 1 — Overview.** KPI tiles for wings/floors/units and budget, the progress roll-up summary, and the structural CRUD for this project: add **Wing**, add **Floor**, add **Unit** (unit number, wing, type, saleable area, price, status). These are the building blocks used by progress reports, sales and scoping.

**Tab 2 — Wings (n).** Wings table with per-wing progress bar, status, floor/unit counts; add/edit wing (name, code, manager, area, dates, status, progress — blank progress is auto-calculated), delete wing (with confirmation: *"Delete wing … and all its floors/units?"*).

**Tab 3 — Wing Dashboard** (appears when you deep-link to a wing, e.g. from a notification or the wings tab). KPIs: wing progress %, active issues, units sold + value, collections + pending. Plus Floor Progress list (bars per floor), Recent Updates for the wing, Inspections by Status donut, Material Status mini-table (in-stock + LOW badge for that project), Active Issues table.

**Tab 4 — Progress Timeline.** Area chart of daily average progress % per date for the project (labour and report counts in tooltip).

**Tab 5 — Floors & Units.** Wing filter, unit status summary badges (available / booked / sold counts), Floors table (wing, floor, progress bar, status) and Units table (unit no, wing, type, area sqft, price, status badge).

**Data flow**

| Action | API | Tables |
|---|---|---|
| Load project | `GET /api/projects/:id` | `projects` + nested `wings` |
| Add wing | `POST /api/wings` | `wings`, `audit_logs` |
| Edit wing | `PUT /api/wings/:id` | `wings` (blank `progress` left to roll-up), `audit_logs` |
| Delete wing | `DELETE /api/wings/:id` | `wings` + cascade of its `floors`/`units`, `audit_logs` |
| Add floor | `POST /api/floors` | `floors`, `audit_logs` |
| Edit floor | `PUT /api/floors/:id` | `floors`, `audit_logs` |
| Add unit | `POST /api/units` | `units`, `audit_logs` |
| Edit / delete unit | `PUT/DELETE /api/units/:id` | `units`, `audit_logs` (delete blocked when the unit is sold) |
| Wing dashboard | `GET /api/dashboard/wing/:wingId` | `wings`, `floors`, `daily_progress`, `issues`, `sales`+`sales_payments`, `inspections`, `stock_transactions`+`materials` |
| Progress timeline | `GET /api/progress/timeline?projectId=` | `daily_progress` grouped by date |
| Floors / units lists | `GET /api/floors?projectId=&wingId=` · `GET /api/units?projectId=&wingId=` | `floors` · `units` |

**Roll-up reminder:** whenever any `daily_progress` row for a wing changes, the server runs `recomputeProjectProgress(projectId)` inside the same transaction — wing progress = AVG(percentage) of the wing's progress rows, project `overall_progress` = average of wing progresses (capped at 100).

![Project detail with tabs](assets/screenshots/web-03-project-detail.png)
