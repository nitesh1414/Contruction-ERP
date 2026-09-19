### 5.6 HR & Payroll (admin operations view)

An operational console over the **same** employee data the Web Portal edits — identity, login coverage, leave workflow and payroll settlement at a glance. Access chip shows *Operational* vs *Read-only* based on `hrms.edit`/`hrms.create`.

- **KPI tiles** — Active employees, Linked logins (count of employees with a login), Pending leave, **Payroll due** for the month (pending net).
- **Employee identity & login coverage** — searchable, paginated table: Code, Employee, Designation (+ linked role), Department, Project, **Login** (Linked · name / No login), Status. Note: the list is explicitly shared — "Shared with the Project Tracking HR & Payroll panel".
- **Recent leave workflow** — latest 8 requests with **Approve / Reject** buttons on pending rows (`hrms.approve`).
- **Payroll payment status** — latest 8 payroll rows for a chosen month (Gross, Net, Paid, status) with **Record payment** (same modal as the portal: amount ≤ net, date, reference) and a **Generate payroll** button (bulk, same engine as the portal).

| Action | API | Tables |
|---|---|---|
| Summary | `GET /api/hrms/summary` | `hrms_employees`, `hrms_leave_requests`, `hrms_payroll` |
| Employees | `GET /api/hrms/employees?page=&search=` | `hrms_employees` + links |
| Leave decide | `PUT /api/hrms/leave-requests/:id/decide` | `hrms_leave_requests` |
| Payroll list | `GET /api/hrms/payroll?payroll_month=` | `hrms_payroll` |
| Generate | `POST /api/hrms/payroll/generate-bulk` | `hrms_payroll` (engine of §4.18) |
| Record payment | `PUT /api/hrms/payroll/:id/payment` | `hrms_payroll` |

> The full create/edit/delete of employees, salary structures and leave types is done in the **Web Portal → HR & Payroll** (or from Users → "Create employee record" here); this admin view is for the settlement workflow.

### 5.7 Petty Cash (admin view)

The same ledger as the portal (identical data & API), presented for finance oversight: project filter, type/category filters, summary (cash on hand, spend by category, recent activity), entries table, CSV export. Entry create/edit/delete uses the same `petty_cash.*` permissions.

| Action | API | Tables |
|---|---|---|
| List / summary / export / CRUD | `GET /api/petty-cash` · `GET /api/petty-cash/summary` · `GET /api/petty-cash/export` · `POST|PUT|DELETE /api/petty-cash…` | `petty_cash_entries`, `audit_logs` |

### 5.8 Audit Logs

The complete mutation trail of the platform — every create, update, delete and export by every user.

- **Columns** — When (timestamp), User, Action badge (create green / update blue / delete red / export purple), Module, Record id, IP.
- **Filters** — search (user or record), Module (all 26 audited modules: auth, users, roles, projects, wings, floors, units, progress, milestones, drawings, materials, inventory, purchase_orders, billing, boq, test_reports, inspections, issues, workers, attendance, labour_payments, sales, documents, reports, notifications, system), User (directory select).
- **Row click → detail modal** — full JSON of **old value** and **new value**, plus IP and user-agent.
- **⬇ Export CSV** (`admin.export`).

| Action | API | Tables |
|---|---|---|
| List | `GET /api/admin/audit-logs?page=&module=&userId=&search=` | `audit_logs` (indexed by module/user/time) |
| Export | `GET /api/admin/audit-logs/export` | CSV, audited |

**How entries are created:** every controller mutation calls the shared `audit()` helper *inside the request*, writing user_id, user_name, action, module, record_id, old/new JSON, IP and user-agent. Auditing is fire-and-forget — it can never fail the business operation.

### 5.9 Broadcast

Push an announcement to specific users or the whole organisation.

- **Fields** — Title, Message, **Type** (info / success / warning / error), **Audience**: "All users" (default) or an individual user picker.
- **Send** writes one `notifications` row per target user (title, message, type, module=system). Target users see it in their bell next poll; mobile users on registered devices also receive it via the Expo push relay using their stored push token.
- **Sent count** is shown after each broadcast.

| Action | API | Tables | Side effects |
|---|---|---|---|
| User picker | `GET /api/auth/user-directory` | `users` (active) | — |
| Send | `POST /api/notifications/broadcast` `{title, message, type, userIds?[]}` | `notifications` (one row per user) | Push tokens (`user_push_tokens`) relayed where available |

---

## 6. Mobile App — screen guide (site engineer)

The Expo (React Native) app is the field companion: camera + GPS capture that works **offline** and syncs automatically.

### 6.1 Screens

| Screen | Purpose |
|---|---|
| **Login** | Email + password against the same API (`POST /api/auth/login`); tokens stored in SecureStorage; forgot-password link |
| **Dashboard** | Quick stats for the engineer's projects (open issues, pending inspections, recent progress) + quick actions |
| **Progress List** | Daily reports for the engineer's projects, with sync-state indicators |
| **Progress Capture** | The star screen: project/wing/floor, date, work description, %, labour, weather, remarks, **camera photos (each auto-tagged with GPS + timestamp)**, GPS capture, save — works offline |
| **Progress Detail** | Full report with photos (each showing source + coordinates) |
| **Attendance** | Mark worker attendance for a project/date (same statuses as web: present/absent/half day/leave/overtime + OT hours) |
| **Inspections** / **Inspection Detail** | Checklist inspections with pass/fail/N-A, GPS, photos |
| **Issues** / **Issue Create** / **Issue Detail** | Raise and resolve issues with photos + GPS; comment thread |
| **Notifications** | In-app notification list (polling + Expo push), mark read |
| **Sync Queue** | Every offline item with its state (queued / syncing / error / done), retry buttons |
| **More** | Profile, device push-token registration, logout, app info |

### 6.2 Offline queue (how it works)

```
capture (no network)
   │  client_ref = unique id generated on device
   ▼
AsyncStorage  '@cerp/offline-queue'  (idempotent: same client_ref never enqueued twice)
   │
   │  background auto-sync + manual "Sync now"
   ▼
POST /api/progress/sync   (batch)   or   POST /api/issues / POST /api/attendance
   │
   ├─ 200 created  → item removed from queue
   ├─ duplicate    → server returned the existing row id (client_ref guard) → item removed
   └─ error        → kept in queue, retried with backoff, visible in Sync Queue screen
```

- The web app uses the same `client_ref` guard for its own offline fallback queue.
- Push notifications: the app registers its Expo push token once via `POST /api/notifications/push-token` (stored in `user_push_tokens`) and relays in-app notifications through the standard endpoint.

| Action | API | Tables |
|---|---|---|
| Create progress (online) | `POST /api/progress` (multipart, per-photo GPS + meta) | `daily_progress`, `progress_photos`, `file_uploads` + roll-up |
| Batch sync (offline items) | `POST /api/progress/sync` | as above; per-item `created/duplicate/error` results |
| Attendance | `POST /api/attendance` | `attendance` (server-computed wages) |
| Inspections | `POST /api/inspections` | `inspections`, `inspection_items` |
| Issues | `POST /api/issues` (multipart) | `issues`, photos, notifications |
| Push token | `POST /api/notifications/push-token` | `user_push_tokens` |
| Notifications | `GET /api/notifications` · `PUT /api/notifications/:id/read` | `notifications` |

### 6.2b Marketing site

The public landing page (`marketing/`) is a static React site with no authentication. It describes the ERP's actual capabilities — project structure, daily progress with geo-tagged photos, material lifecycle, BOQ variance, quality, workforce, HR & payroll, petty cash, equipment, sales, notifications, audit — with module names that match the real applications. It is for prospects and is not part of the operational data flow.
