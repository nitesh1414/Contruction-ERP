---

## 7. End-to-end data flows (complete)

This chapter chains the per-screen flows into the full cross-module journeys. Each flow lists the tables touched in order and the side effects.

### 7.1 Authentication & session lifecycle

```
login(email,pw) ─▶ POST /auth/login
                    ├─ users (bcrypt check, last_login_at)
                    ├─ refresh_tokens (new hashed token)
                    └─ JWT access (id, roles, permissions) + refresh
every request   ─▶ Authorization: Bearer <access>
                    ├─ middleware authenticates (JWT verify)
                    ├─ attachProjectScope (user_projects → project/wing sets)
                    └─ requirePermission(module.action)
token expiry    ─▶ POST /auth/refresh  (old refresh revoked, new issued)
logout/reset PW ─▶ POST /auth/logout | PUT /users/:id/reset-password
                    └─ refresh_tokens.revoked_at = now  (all devices out)
```

| Actor | Path |
|---|---|
| Any user, any app | Login → tokens → scoped, permission-checked requests → transparent refresh → revocation on logout/reset |

### 7.2 User & employee provisioning (identity sync)

Two entry points, one identity:

```
A) Admin Console → Users → New User
   POST /users  ─▶ users (bcrypt) ─▶ user_roles ─▶ user_projects
   [+ createEmployee?] ─▶ hrms_employees (+ user_id back-link)
B) Web Portal → HR & Payroll → Add employee
   POST /hrms/employees  ─▶ hrms_employees
   [+ create_login?] ─▶ users ─▶ user_roles (selected ∪ designation-linked role)
                          └─ hrms_employees.user_id = new user id
```

- **One-to-one link:** a user and an employee can never be double-linked (both UIs block it; the server rejects it).
- **Designation → role mapping:** `hrms_designations.role_id` means "employees with this designation automatically get this login role" — enforced at provisioning, displayed as the *effective designation* on profiles.
- **Delete semantics:** deleting the **employee** keeps the login (unlinked); deleting the **user** keeps the audit history.
- **Audit:** every step writes `audit_logs` rows.

### 7.3 Project setup & progress roll-up

```
Admin/PM creates project ─▶ projects
   adds wing      ─▶ wings            (manager, dates, status)
   adds floors    ─▶ floors           (per wing)
   adds units     ─▶ units            (saleable area, price, status=available)

daily progress saved (anywhere: web, mobile, sync)
   └─▶ recomputeProjectProgress(projectId)   [same DB transaction]
         wing.progress    = AVG(daily_progress.percentage) per wing
         projects.overall = AVG(wing.progress) per project
```

**Tables:** `projects`, `wings`, `floors`, `units`, `daily_progress`.
**Consumers of roll-up:** Dashboard (KPI + 30-day trend + status donut), Project Detail header, Reports (`project-progress`), notifications on delayed milestones.

### 7.4 Daily progress entry — web & mobile (with photos, GPS, offline)

| # | Step | UI | API | Tables written | Side effects |
|---|---|---|---|---|---|
| 1 | Fill report (project→wing→floor, date, %, labour, weather, text) | Portal *New Report* / Mobile *Capture* | — | — | GPS captured (browser / device) |
| 2 | Attach photos (≤8) | file pick / camera | — | — | per-photo GPS + timestamp in `photosMeta` |
| 3 | Save online | both | `POST /api/progress` (multipart, `client_ref`) | `file_uploads`, `progress_photos`, `daily_progress` | progress roll-up; audit |
| 4a | Save offline (mobile) | queue | (none) | device storage `@cerp/offline-queue` | item visible in Sync Queue |
| 4b | Auto-sync | background | `POST /api/progress/sync` | as step 3, per item | duplicate guard by `client_ref`; per-item result |
| 5 | View / deep-link | bell or list | `GET /api/files/:id` per photo | `file_uploads` read | photo shows source + coords |
| 6 | Dashboard reflects it | — | `GET /api/dashboard/overview` | — | trend + recent-updates lists |

### 7.5 Material procurement cycle (requirement → PO → GRN → stock)

| # | Step | Actor | API | Tables | Side effects |
|---|---|---|---|---|---|
| 1 | Engineer raises requirement | Site | `POST /materials/requirements` | `material_requirements` (REQ-…) | — |
| 2 | Store approves / rejects | Store Mgr | `PUT /materials/requirements/:id/status` | `material_requirements` | notification `po_approval` to requester |
| 3 | Store creates PO (items, rates, tax, discount) | Store Mgr | `POST /materials/purchase-orders` | `purchase_orders` (auto totals) + `purchase_order_items` | status draft |
| 4 | Submit → Approve → Mark sent | Store Mgr / PM | `PUT /materials/purchase-orders/:id/status` | `purchase_orders` (+approved_by/at) | approval notifies creator |
| 5 | Delivery received — GRN | Store | `POST /materials/receipts` | `material_receipts` + `material_receipt_items` (accepted = received − damaged) | **`stock_transactions` (+ accepted)**; PO item `received_qty`; PO → partially_received/received; notification `material_received` |
| 6 | Stock position updates live | Store/PM | `GET /materials/stock` | ledger aggregate | **LOW STOCK badge** when ≤ min level (dashboard KPI + `material_shortage` event) |
| 7 | Optional returns | Store | `POST /materials/returns` → `PUT …/approve` | `material_returns` + ledger (+qty) | stock back up |
| 8 | Accounts settles vendor | Accountant | `POST /billing/cost-entries` (type consumable, supplier, bill no) | `cost_entries` | vendor-due KPI, budget-vs-actual |

### 7.6 Material consumption on site

```
engineer ─▶ POST /materials/consumption {project, wing, material, qty, date, location}
             ├─ read current stock (Σ stock_transactions for project+material)
             ├─ reject if qty > stock
             └─ insert material_consumption + stock_transactions (−qty)
                  └─ if stock now ≤ min level → low-stock notification
```

**Tables:** `material_consumption`, `stock_transactions`. **Feeds:** Stock tab ledger, Material Consumption report, project cost (when mirrored as billing entries), dashboard.

### 7.7 Workforce wage cycle (worker → attendance → payment)

| # | Step | UI | API | Tables | Computation |
|---|---|---|---|---|---|
| 1 | Register worker (category, contractor, wage, OT rate) | Workers tab | `POST /workers` | `workers` | — |
| 2 | Mark attendance per day (status + OT hours) | Attendance tab / Mobile | `POST /attendance` (batch upsert) | `attendance` | `daily_amount` = wage × status factor (1, ½, 0); `overtime_amount` = OT hrs × OT rate — **server-side** |
| 3 | Summary & payroll preview | badges | `GET /attendance/summary` | aggregate | day total |
| 4 | Generate payment for a period | Labour Payments | `POST /labour-payments` | `labour_payments` | gross = Σ(daily+OT) over period; net = gross − deductions |
| 5 | Settle | Mark paid | `PUT /labour-payments/:id` | `labour_payments` | status paid/partial; payment date + mode |
| 6 | Monthly wage report | Reports / API | `GET /attendance/monthly-report` | aggregate | days, OT, gross, paid vs pending per worker |

**Feeds:** Dashboard "Pending Labour Payment" KPI, `labour-payments` report.

### 7.8 HR payroll cycle (structure → leave → bulk payroll → payment)

```
1. HR sets salary structure ─▶ hrms_salary_structures (basic/HRA/DA/…, PF, ESIC, PT, effective_from)
2. Employee raises leave   ─▶ hrms_leave_requests (total_days computed)
3. Manager decides         ─▶ PUT …/decide (approved/rejected, decided_by)
4. End of month: Generate  ─▶ POST /hrms/payroll/generate-bulk {payroll_month}
     per active employee:
       structure  = latest active with effective_from ≤ end of month
       lop        = approved days of UNPAID leave types in month
       paid       = working_days − lop ; ratio = paid / working_days
       gross      = (basic+HRA+DA+special+other) × ratio
       deduct     = min(gross, (PF-ee + ESIC-ee) × ratio + PT)
       net        = gross − deduct
     ─▶ hrms_payroll (payment_status = pending)      [skips reported in response]
5. Accounts records payment ─▶ PUT /hrms/payroll/:id/payment
     status: 0→pending | <net→partial | ≥net→paid    (paid months are locked from re-generation)
```

**Tables:** `hrms_salary_structures`, `hrms_leave_requests`, `hrms_leave_types`, `hrms_payroll`. **Feeds:** HRMS summary tiles, payroll KPIs, admin payroll status view, employee detail modal.

### 7.9 Unit sales & collections cycle

```
units.status = available  (created under project structure)
   │
   │  sales exec: New Sale (unit only listed if available)
   ▼
POST /sales ─▶ sales (amount, GST, received, pending)  +  units.status → booked|sold
   │
   │  customer pays (staged)
   ▼
POST /sales/:id/payments ─▶ sales_payments  +  sales.amount_received/pending/payment_status
   │                                   pending>0 ─▶ notification sales_payment_due
   ▼
KPIs: units sold · value · collected · pending      Reports: sales · pending-collections
deleting a sale returns the unit to available
```

### 7.10 Equipment operation & hire billing cycle

```
1. register equipment ─▶ equipment (type, ownership, rates, project, status)
2. daily log          ─▶ POST /equipment/logs
      equipment_logs (+hours, fuel, status_after)
      equipment.status = status_after            (fleet board always current)
3. month end          ─▶ POST /equipment/billing/generate {billing_month}
      hours = Σ running_hours of the month
      amount = hours × hourly_rate  ─▶ equipment_billing (pending)
4. settlement         ─▶ PUT /equipment/billing/:id  (paid_amount, status)
```

**Feeds:** equipment summary tiles (fleet by status, month hours + fuel), billing entries in finance, project cost reports.

### 7.11 Quality assurance flow

```
Material test:   lab result ─▶ POST /test-reports (file, values, result)
                 result=fail ─▶ notification test_failed
                 submitted   ─▶ PUT /test-reports/:id/status (approve|reject)

Inspection:      POST /inspections {type, items[], GPS}
                 items ─▶ inspection_items (pass/fail/N-A)
                 any fail ─▶ status failed + notification inspection_failed
                 passed/failed/reinspection_required ─▶ PUT … (close)
```

**Tables:** `test_types`, `test_reports`, `file_uploads`, `inspection_types`, `inspections`, `inspection_items`.

### 7.12 Issue lifecycle & notifications

```
raise (ISS-####, photos, GPS, assignee, due)
   │  issue_created → watchers ; issue_assigned → assignee
   ▼
open → assigned → in_progress → resolved → closed   (reopen allowed)
   │  issue_updated → affected users
   │  due date passed & unresolved → issue_overdue (red in list)
   ▼
comment thread (issue_comments) · dashboard open-issues KPI · issues report
```

### 7.13 Drawing revision control

```
upload drawing (R0) ─▶ drawings + drawing_revisions + file_uploads
   │  notification drawing_revision → approvers
   ▼
add revision (R1, R2…) ─▶ pending
   │
   ├─ approve ─▶ drawing.approval_status = approved ; latest revision = current file
   └─ reject  ─▶ drawing.approval_status = rejected
download/preview always via authenticated GET /files/:id
```

### 7.14 Audit trail & broadcasts (system-wide)

- **Audit:** every mutation in every module → `audit_logs` (user, action, module, record, old/new JSON, IP, agent) → Admin → Audit Logs (filter, inspect, export). Deletes of users/records keep their history.
- **Broadcast:** Admin → Broadcast → `POST /api/notifications/broadcast` → one `notifications` row per target (+ Expo push relay via `user_push_tokens`) → bells in both web apps and mobile list.
- **Notification events** are all gated by `notification_settings.enabled` (Masters → Notification Events).
