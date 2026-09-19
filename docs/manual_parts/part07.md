---

## 5. Admin Console — complete screen & tab guide

The Admin Console (separate login on its own port/URL) is where platform administrators manage **who** can do **what** across **which projects**, keep master data consistent, and watch the system.

### 5.0 Layout & navigation

- **Sidebar groups:**
  - (top) **Admin Dashboard**
  - **Access Control** — Users & Employees (`users.view`), Roles & Permissions (`roles.view`)
  - **Master Data** — Projects & Wings (`projects.view`), Masters (visible to all admins)
  - **People & finance operations** — HR & Payroll (`hrms.view`), Petty Cash (`petty_cash.view`)
  - **System** — Audit Logs (`admin.view`), Broadcast (`notifications.create`)
- **Top bar** — page title, "Admin Console · v1.0" chips, user chip with Logout.
- Every route is guarded by `Require(perm)`; the server re-checks the same permissions.

### 5.1 Admin Dashboard

- **KPI tiles** — Total Users, Roles, Projects, Wings, Total Budget (compact ₹), Open Issues.
- **Users by Role** donut (role → user count), **Activity Trend** (progress reports per day, last 30 days).
- **Recent Audit Activity** table (last 8 events: when, user, action, module, record).
- **Role Distribution** table (role, users, permissions, System/Custom type).

| UI | API | Tables |
|---|---|---|
| KPIs + charts | `GET /api/dashboard/overview` | same aggregates as the web dashboard |
| Users / roles | `GET /api/users?limit=100` · `GET /api/roles` | `users` (+ `user_roles`, `roles.user_count`), `roles` (+ `permission_count`) |
| Recent audits | `GET /api/admin/audit-logs?limit=8` | `audit_logs` |

![Admin Dashboard](assets/screenshots/admin-01-dashboard.png)

### 5.2 Users & Employees

Manage login accounts **and** their HR/payroll identity in one place.

- **Columns** — User (avatar, name, email), Employee code, Phone, **Roles** (badges), **HR / Payroll** (green "Linked · EMP-xxx" or gray "No employee"), Last login (or "never"), Status.
- **Filters** — search (name, email, code, phone), Role. Pagination. **⬇ Export CSV** (`users.export`).
- **Row actions** — Edit, **Reset PW**, Delete (never on your own account).

**Create / Edit user modal**

1. **Account** — Full name, Email (login), Phone, Employee code, **Temporary password** (new users only, min 8 chars), Status (active/inactive).
2. **HR & Payroll link block** —
   - *New user:* "Create employee record" checkbox (requires `hrms.create`) → Department, Designation (linked-role auto-added to the role set), Date of joining, Employment type, Payroll project, Employee status.
   - *Existing user without employee:* "Convert to employee" — same fields; creates the shared-directory row and links it.
   - *Already linked:* a green "✓ Linked HR/payroll employee" note (no double link).
3. **Roles** — multi-select chips. Non-super-admins cannot see the `admin`/`super_admin` roles in the picker (they cannot grant those). The selected designation's linked role is **auto-included** (shown in a hint).
4. **Project Access** — rows of (Project, Wing or "All wings"). Empty list + a non-global role = the user sees **no projects**; Super Admin / Admin roles are global.

**Reset password modal** — new password (min 8 chars); **all of that user's active sessions are revoked immediately** (`refresh_tokens.revoked_at`).

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/users?page=&search=&roleId=` | `users` + roles + `hrms_employees` link + last login | — |
| Create | `POST /api/users` `{name, email, phone, employee_code, password, status, roleIds, projectAccess, createEmployee?, employee?}` | `users` (bcrypt), `user_roles`, `user_projects` (each row project + wing_id 0=all), and when requested: `hrms_employees` + `hrms_employees.user_id` back-link | Response `meta.employeeId` when an employee was created; `audit_logs` |
| Edit | `PUT /api/users/:id` + `PUT /api/users/:id/roles` (when roles changed) + `PUT /api/users/:id/project-access` | `users`, `user_roles`, `user_projects`, (employee link fields) | `audit_logs` with old/new values |
| Reset password | `PUT /api/users/:id/reset-password` | `users.password`, **all `refresh_tokens` revoked** | User must re-login everywhere |
| Delete | `DELETE /api/users/:id` | `users` — **audit history is preserved** | `audit_logs` |
| Export | `GET /api/users/export` | CSV, audited | — |

![Users & Employees](assets/screenshots/admin-02-users.png)

### 5.3 Roles & Permissions

Define the platform's capability model.

- **Columns** — Role (name + code), Description, **HR designation(s)** (names of designations mapped to this role — useful for spotting role/designation drift), Users count, **Permissions** count badge, Type (System/Custom), Status (Active/Inactive).
- **Row actions** — **🛡 Permissions** (open the matrix; the super_admin role itself is read-only), **Delete** (only custom roles **with zero users**).
- **New Role** — name + description (code auto-generated); then configure its permissions.

**Permission matrix modal**

- Grid: **rows = modules**, **columns = the 8 actions** (`view · create · edit · delete · approve · export · upload · download`). A cell is checkable only when that module.action permission exists in the catalogue.
- Clicking the **module name** toggles the whole module.
- Footer shows "N of M granted" and **Save permissions** writes the full set.

| Action | API | Tables | Side effects |
|---|---|---|---|
| Role list | `GET /api/roles` | `roles` + user/permission counts + designation names | — |
| Create role | `POST /api/roles` | `roles`, `audit_logs` | — |
| Matrix data | `GET /api/roles/permissions` (catalogue grouped by module) · `GET /api/roles/:id` (granted ids) | `permissions`, `role_permissions` | — |
| Save matrix | `PUT /api/roles/:id/permissions` `{permissionIds:[…]}` | `role_permissions` (replaced), `audit_logs` | Takes effect on the users' next request (permissions are loaded per token/`/me`) |
| Delete | `DELETE /api/roles/:id` | `roles` (409 if system or in use) | `audit_logs` |

![Roles & Permissions](assets/screenshots/admin-03-roles.png)

![Permission matrix](assets/screenshots/admin-08-permission-matrix.png)

### 5.4 Projects & Wings (admin)

A project-structure console for admins — the same `projects` / `wings` / `floors` tables the portal uses.

- **Projects table** with inline **New Project** (same fields as the portal's New Project modal) and row-level **Edit / Delete / Expand**.
- **Expanded row** shows the project's **Wings** table (add/edit/delete wing with progress + status) and its **Floors** table (per wing: floor, status) — so an admin can set up or repair the hierarchy without touching the portal.

| Action | API | Tables |
|---|---|---|
| Projects CRUD | `GET|POST|PUT|DELETE /api/projects…` | `projects`, `audit_logs` |
| Wings CRUD | `GET|POST|PUT|DELETE /api/wings?projectId=` | `wings`, `audit_logs` |
| Floors | `GET /api/floors?projectId=&wingId=` (+ update) | `floors`, `audit_logs` |

![Projects & Wings admin view](assets/screenshots/admin-05-projects.png)

### 5.5 Masters (11 tabs)

Master data that feeds dropdowns across every app. Tab visibility is permission-gated (e.g. HR tabs need `hrms.view`).

| Tab | Manages | Key fields / behaviour |
|---|---|---|
| **Departments** | `hrms_departments` | Name, Code (auto from name if blank), Description, Active. Feeds employee forms in both apps. |
| **Designations / Roles** | `hrms_designations` | Name, Code, **Linked role** (select from login roles — required), Description, Active. The linked role is auto-granted when a login is provisioned from an employee with this designation, and is shown as the "effective designation" on profiles. |
| **Material Categories** | `material_categories` | Name, Description, **Consumable** flag, Active. Feeds Materials master. |
| **Labour Categories** | `worker_categories` | Name, **Base daily rate (₹)**, Description, Active. Feeds Workers. |
| **Labour Rates** | `labour_rates` | Worker category, Contractor (optional), Daily rate, OT rate/hr, **Effective from** (date-based rate cards). |
| **Contractors** | `contractors` | Name, Contact, Phone, Email, GST, Address. Feeds Workers. |
| **BOQ Categories** | `boq_categories` | Name, Description, Active. Feeds BOQ items. |
| **Test Types** | `test_types` | Name, Description/standard, Active. Feeds Test Reports. |
| **Inspection Types** | `inspection_types` | Name, **Checklist template** (items separated by `;` — becomes the pre-filled inspection checklist), Active. |
| **Issue Categories** | `issue_categories` | Name, Description, Active. Feeds Issues. |
| **Notification Events** | `notification_settings` | Event key, Label, **Enabled** toggle — the switch for every event-driven notification (issue_overdue, low stock, document_expiry, …). Disabled = event silently skipped. |

Each tab is a standard CRUD table (search, create, edit, delete, export where configured):

| Tab | API base | Table |
|---|---|---|
| Departments | `/api/hrms/departments` | `hrms_departments` |
| Designations | `/api/hrms/designations` | `hrms_designations` |
| Material Categories | `/api/materials/categories` | `material_categories` |
| Labour Categories | `/api/worker-categories` | `worker_categories` |
| Labour Rates | `/api/labour-rates` | `labour_rates` |
| Contractors | `/api/contractors` | `contractors` |
| BOQ Categories | `/api/boq/categories` | `boq_categories` |
| Test Types | `/api/test-types` | `test_types` |
| Inspection Types | `/api/inspection-types` | `inspection_types` |
| Issue Categories | `/api/issues/categories` | `issue_categories` |
| Notification Events | `/api/notifications/settings` | `notification_settings` |

On an existing installation, run `npm run migrate` + `npm run seed` in the backend so the new masters are created and legacy employee text values are promoted into managed entries.

![Masters console](assets/screenshots/admin-04-masters.png)
