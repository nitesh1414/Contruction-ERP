# REST API Reference

Base URL: `http://localhost:4000/api` (development) / `https://api.your-domain.com/api` (production).

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` on every request except `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`.
- **Response envelope**: success → `{ "success": true, "data": … }` (+ `pagination` for lists); error → `{ "success": false, "message": "…" }` with proper HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 422 conflict, 500 server).
- **Pagination**: `?page=1&limit=20` → `pagination: { page, limit, total, totalPages }`.
- **Filters** use camelCase query params (`projectId`, `wingId`, `status`, `from`, `to`, `search`); bodies use snake_case (`project_id`, …).
- **Dates** `YYYY-MM-DD`, datetimes ISO-8601.
- **Permissions**: every route is guarded by a `module.action` permission checked against the caller's roles; super admins bypass. Users with `user_projects` rows only see records inside their mapped projects/wings (automatic scoping).
- **Uploads**: `multipart/form-data`; files ≤ `MAX_FILE_SIZE_MB` (default 20 MB); allowed types: JPG, JPEG, PNG, WEBP, PDF, XLS, XLSX, DOC, DOCX.
- **Audit**: every create/update/delete writes an `audit_logs` row with old/new values.
- Rate limiting on auth endpoints; global limiter on all `/api/*`.

Tokens: access token (default 12 h) + rotating refresh token (30 d, revocable — each `/auth/refresh` issues a fresh pair and invalidates the old refresh token).

---

## /auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | `{ email, password, deviceInfo? }` → `{ user, accessToken, refreshToken }`. `user` includes `roles[]`, `permissions[]`, `projects[]` (access map) |
| POST | `/auth/refresh` | `{ refreshToken }` → new token pair (rotation) |
| POST | `/auth/logout` 🔒 | `{ refreshToken }` — revoke |
| GET | `/auth/me` 🔒 | current profile incl. roles/permissions/project access and a safe linked HR employee summary |
| PUT | `/auth/profile` 🔒 | `{ name?, phone?, profile_photo? }` |
| POST | `/auth/change-password` 🔒 | `{ current_password, new_password }` |
| POST | `/auth/forgot-password` | `{ email }` → issues reset token (link built from `FRONTEND_BASE_URL`) |
| POST | `/auth/reset-password` | `{ token, new_password }` |
| GET | `/auth/user-directory` 🔒 | lightweight id/name list for assignment pickers |

🔒 = authenticated.

## /users *(users.* perms)*

| Method | Path | Perm | Description |
|---|---|---|---|
| GET | `/users` `?search&status&roleId` | view | list with roles and `employee_id`, `linked_employee_code`, `employee_status` |
| GET | `/users/export` | export | CSV |
| GET | `/users/:id` | view | detail incl. roles, project access and linked `employee` object |
| POST | `/users` | create | `{ name, email, password, phone?, employee_code?, roleIds?, projectAccess?, createEmployee?, employee? }` |
| PUT | `/users/:id` | edit | profile fields + `status` (activate/deactivate); linked employee identity is updated transactionally |
| PUT | `/users/:id/roles` | edit | `{ roleIds: [] }` |
| PUT | `/users/:id/project-access` | edit | `{ entries: [{ project_id, wing_id|null }] }` |
| PUT | `/users/:id/reset-password` | edit | admin reset `{ newPassword }` |
| DELETE | `/users/:id` | delete | delete login; linked HR employee is retained with `user_id = NULL` |

When `createEmployee` is true, `employee` may contain `employee_code`, `department`, `designation`, `date_of_joining`, `employment_type`, `status`, `project_id`, `wing_id`, bank/tax fields and remarks. The user is inserted, roles/project access are assigned, and the employee is inserted or linked in one transaction. An existing unlinked employee with the same employee code or email is linked instead of duplicated. Project scope is checked for every employee/project assignment.

## /roles *(roles.* perms)*

`GET /roles/permissions` (grouped permission catalog) · `GET /roles` · `GET /roles/:id` (with permission ids) · `POST /roles` `{name, code?, description?}` · `PUT /roles/:id` · `PUT /roles/:id/permissions` `{permission_ids: []}` · `DELETE /roles/:id` (custom roles only).

## /projects · /wings · /floors · /units

**Projects** `GET /projects?status&project_type&managerId&search` · `GET /projects/export` (CSV) · `GET /projects/:id` (with wings) · `POST /projects` `{name, code?, client_name, …, budget, start_date, end_date}` · `PUT /projects/:id` · `DELETE /projects/:id`.
Status: `planning | in_progress | on_hold | completed | cancelled`. `overall_progress` is recomputed automatically from progress reports.

**Wings** `GET /wings?projectId&status&search` · `POST /wings` `{project_id, name, code?}` · `PUT /wings/:id` · `DELETE /wings/:id`.

**Floors** `GET /floors?projectId&wingId` · `POST /floors` `{wing_id, name, sequence}` · `PUT /floors/:id` · `DELETE /floors/:id`.

**Units** `GET /units?wingId&floorId&status` · `POST /units` · `PUT /units/:id` · `DELETE /units/:id`.

## /progress — daily progress reports

| Method | Path | Description |
|---|---|---|
| GET | `/progress?projectId&wingId&floorId&from&to&search` | list (photos attached per row) |
| GET | `/progress/timeline?projectId` | date-ordered series for charts |
| GET | `/progress/export?…` | CSV |
| GET | `/progress/:id` | detail + photos |
| POST | `/progress` **multipart** | fields: `project_id`, `wing_id?`, `floor_id?`, `report_date`, `work_time?`, `work_description`, `work_completed?`, `percentage`, `labour_count`, `material_used?`, `weather?`, `remarks?`, `latitude?`, `longitude?`, `client_ref?` + files `photos[]` (≤10) + `photosMeta` = JSON array aligned with files: `[{latitude, longitude, captured_at, source}]` |
| POST | `/progress/sync` | offline batch `{ items: [ {same fields…, client_ref} ] }` — per-item result `{client_ref, status: created|duplicate|error, id?}` |
| PUT | `/progress/:id` multipart | update + append photos |
| DELETE | `/progress/:id` | remove |

`client_ref` gives mobile-offline duplicate protection: resubmits return `duplicate: true` with the existing record instead of double-inserting.

## /milestones
`GET /milestones?projectId&wingId&status` · `GET /milestones/summary?projectId` · `POST /milestones` · `PUT /milestones/:id` (auto-marks `delayed` when end date passes) · `DELETE /milestones/:id`.
Status: `pending | in_progress | completed | delayed`.

## /drawings
`GET /drawings?projectId&search` · `GET /drawings/:id` (with revision history) · `POST /drawings` (multipart `file`) · `POST /drawings/:id/revisions` (multipart `file` + `revision_no`, `notes?`) · `PUT /drawings/revisions/:revisionId/status` `{status: approved|rejected}` *(drawings.approve)* · `PUT /drawings/:id` · `DELETE /drawings/:id`.

## Materials lifecycle

**Masters** — `GET/POST/PUT/DELETE /materials/categories`, `/materials/suppliers` (+`GET /materials/suppliers/export`), `/materials` (+`GET /materials/export`). Filters: `categoryId`, `search`, `is_active`.

**Requirements** — `GET /materials/requirements?projectId&status` · `POST /materials/requirements` `{project_id, material_id, quantity, required_by?, remarks?}` · `PUT /materials/requirements/:id/status` `{status: approved|rejected|po_created}` *(approve perm → notifies requester)*.

**Purchase orders** — `GET /materials/purchase-orders?projectId&supplierId&status` · `GET /materials/purchase-orders/:id` (with items + receipts) · `POST /materials/purchase-orders` `{project_id, supplier_id, requirement_id?, order_date, expected_delivery?, tax_percent, discount, items:[{material_id, quantity, rate}]}` — server computes line amounts, subtotal, tax, grand total · `PUT /materials/purchase-orders/:id/status` `{status: approved|ordered|cancelled|…}`.

**Receipts (GRN)** — `GET /materials/receipts` · `GET /materials/receipts/:id` · `POST /materials/receipts` `{purchase_order_id, received_date, items:[{material_id, received_qty, damaged_qty?}]}` → writes `stock_transactions` (+received, −damaged) and updates PO received quantities.

**Consumption** — `GET /materials/consumption` · `POST /materials/consumption` `{project_id, wing_id?, material_id, quantity, used_on?, remarks?}` — **fails 422 if stock insufficient**; writes −consumption transaction.

**Returns** — `GET /materials/returns` · `POST /materials/returns` `{project_id, material_id, quantity, reason: damaged|excess, remarks?}` · `PUT /materials/returns/:id/approve` — posts the ledger entry.

**Stock** — `GET /materials/stock?projectId&materialId` (live summary from `v_stock_summary`) · `GET /materials/stock/transactions?projectId&materialId&type` (ledger) · `GET /materials/stock/low-stock-alerts` (current ≤ min level).

## /billing — cost tracking
`GET /billing/cost-entries?projectId&category&payment_status&from&to` · `GET /billing/cost-entries/export` · `POST /billing/cost-entries` `{project_id, category, vendor_name, invoice_number?, invoice_date, amount, tax_amount?, …}` (server computes total + pending) · `PUT/DELETE /billing/cost-entries/:id` · `GET /billing/summary?projectId` · `GET /billing/summary/by-wing?projectId`.

## /boq
`GET /boq?projectId` · `POST /boq` `{project_id, title, tax_percent?, discount?}` · `GET /boq/:id` (header + items + totals) · `PUT /boq/:id` · `DELETE /boq/:id` · `PUT /boq/items/:itemId` `{quantity?, rate?, actual_quantity?, actual_rate?}` — estimated & actual amounts and **quantity / cost / % variances** recomputed server-side · `POST /boq/:id/import-json` `{items:[…]}` bulk import · `GET /boq/template-csv` blank CSV template · `GET /boq/:id/export` CSV · `GET /boq/export?projectId` all BOQs CSV · CRUD `/boq/categories`.

## /petty-cash *(petty_cash.* perms)*
`GET /petty-cash?projectId&txn_type&category&from&to&search` · `GET /petty-cash/summary?projectId` — cash-on-hand, category totals and recent activity · `GET /petty-cash/export` CSV · `POST /petty-cash` `{project_id, txn_type: topup|expense|replenish, amount, txn_date, category?, paid_to?, received_by?, description?, remarks?}` · `POST /petty-cash/topup` (same body with `txn_type` forced to `topup`) · `PUT /petty-cash/:id` · `DELETE /petty-cash/:id`. Entries and summaries are project-scoped.

## /hrms *(hrms.* perms)*
`GET /hrms/summary` (includes `totalEmployees`, `linkedLogins`, active/on-leave counts and payroll totals) · `GET /hrms/login-roles` (active roles safe for employee login assignment) · CRUD `/hrms/employees` (paginated filters `projectId`, `department`, `status`, `is_active`, `employment_type`, `search`) · `POST /hrms/employees/:id/login`. The Admin Console and Project Tracking web app use this same employee directory; an Admin-role user has global project visibility and can create, update and delete employee records.

`POST /hrms/employees` accepts the employee fields plus the optional login workflow. The UI explicitly asks whether credentials are required; when `create_login` is false, an email is not implicitly linked to an unrelated login:

```json
{
  "employee_code": "EMP-104",
  "name": "Asha Rao",
  "email": "asha@example.com",
  "department": "Accounts",
  "designation": "Payroll Officer",
  "project_id": 12,
  "create_login": true,
  "login_password": "temporary-secret",
  "login_role_ids": [4]
}
```

`create_login` requires `users.create`, an email, an eight-character password and at least one active role. The employee and new `users` row, role links and `hrms_employees.user_id` link are committed transactionally. If the email already belongs to an unlinked user, that login is linked rather than duplicated. `POST /hrms/employees/:id/login` accepts `{ password, roleIds }` for adding access to an existing unlinked employee. A login already linked to another employee, duplicate email, or duplicate employee code returns a conflict. The database unique key `uq_hrms_employee_user` also prevents one user from being linked twice. Updating either side synchronizes the shared name, email, phone and employee code fields in a transaction; deactivated/terminated employees disable their linked login.

The remaining workflows are CRUD `/hrms/leave-types` · `GET/POST /hrms/leave-requests` · `GET /hrms/leave-balances?employeeId&year` · `PUT /hrms/leave-requests/:id/decide` `{status: approved|rejected|cancelled, remarks?}` · `GET/POST/PUT/DELETE /hrms/salary-structures` (PUT updates the requested structure id and prevents duplicate employee/effective-date rows) · `GET /hrms/payroll?payroll_month=YYYY-MM` · `GET /hrms/payroll/:id` · `POST /hrms/payroll/generate` / `generate-bulk` · `PUT /hrms/payroll/:id/payment` `{paid_amount, payment_date?, payment_reference?}`. Leave requests validate dates, overlapping requests and configured quotas. Payroll is generated from the salary structure effective for the selected month and unpaid approved leave; payment status is calculated from the paid amount and cannot be set inconsistently. All project-linked records respect project scope.

## Quality

**Test reports** — `GET /test-reports?projectId&testTypeId&result_status&status` · `POST /test-reports` multipart (document upload) `{project_id, test_type_id, sample_date, laboratory?, result_value?, result_status}` · `PUT /test-reports/:id` · `PUT /test-reports/:id/status` `{status: approved|rejected}` *(test_reports.approve)* · `DELETE /test-reports/:id` · CRUD `/test-types`.

**Inspections** — `GET /inspections?projectId&wingId&status&inspectionTypeId` · `GET /inspections/:id` (items + photos) · `POST /inspections` multipart `photos[]` `{inspection_type_id, project_id, wing_id?, floor_id?, location?, inspection_date, observation?, status?, items:[{checklist_item, result, remarks?}], latitude?, longitude?, client_ref?}` · `PUT /inspections/:id` (full replace of items; final status passed/failed/reinspection_required/closed) · `DELETE /inspections/:id` · CRUD `/inspection-types` (with `checklist_template`).

## /issues
`GET /issues?projectId&wingId&status&priority&categoryId&assignedToId&search` · `GET /issues/:id` (with comments + photos) · `POST /issues` multipart `photos[]` `{project_id, title, description?, priority, category_id?, wing_id?, floor_id?, location?, assigned_to?, due_date?, latitude?, longitude?, client_ref?}` — auto-numbered `ISS-000xxx`, assignees notified · `PUT /issues/:id` (status workflow open→assigned→in_progress→resolved→closed / reopened; reassignment notifies) · `POST /issues/:id/comments` `{comment}` · `DELETE /issues/:id` · CRUD `/issues/categories`. Overdue open issues generate notification alerts.

## Workforce

**Masters** — CRUD `/worker-categories`, `/contractors`, `/labour-rates`.

**Workers** — `GET /workers?projectId&wingId&categoryId&contractorId&is_active&search` · `POST /workers` · `PUT /workers/:id` · `DELETE /workers/:id`.

**Attendance** — `GET /attendance?projectId&wingId&workerId&date&from&to&status&payment_status` · `GET /attendance/export` (CSV) · `GET /attendance/summary?projectId&from&to` · `GET /attendance/monthly-report?projectId&month=YYYY-MM` · `POST /attendance` `{project_id, wing_id?, date, shift?, records:[{worker_id, status, check_in?, check_out?, overtime_hours?, remarks?}]}` — upsert per worker/day/shift; **daily & overtime amounts auto-calculated** from wages · `PUT /attendance/:id`.
Status: `present | absent | leave | half_day | overtime`.

**Labour payments** — `GET /labour-payments?projectId&workerId&status` · `POST /labour-payments` `{worker_id, project_id, period_start, period_end, deductions?, paid_amount?, payment_mode?, remarks?}` — **net earned auto-aggregated from attendance** · `PUT /labour-payments/:id` (record payment → status pending/partial/paid).
Status: `pending | partial | paid`.

## /sales
`GET /sales?projectId&status` · `GET /sales/summary?projectId` · `GET /sales/unit-availability?projectId&wingId` · `GET /sales/:id` (with payments) · `POST /sales` `{project_id, unit_id, customer_name, customer_phone?, sale_amount, gst_percent?, booking_date, amount_received?}` — GST & pending computed; unit marked sold · `POST /sales/:id/payments` `{amount, payment_date, payment_mode?, reference?}` — status updates pending → partially_paid → paid (overdue tracked) · `PUT /sales/:id` · `GET /sales/export`.
Sales payment status: `pending | partially_paid | paid | overdue`.

## /documents
`GET /documents?projectId&category&search` · `POST /documents` multipart `file` `{project_id, title, category?, expiry_date?}` · `PUT /documents/:id` (optionally replace file) · `DELETE /documents/:id`. Documents expiring within 30 days raise alerts.

## /notifications
`GET /notifications?unread=1` (own inbox) · `PUT /notifications/:id/read` · `POST /notifications/mark-all-read` · `POST /notifications/push-token` `{token}` (Expo push registration) · `POST /notifications/broadcast` `{title, message, user_ids? | all}` *(notifications.broadcast)* · `GET /notifications/settings` · `PUT /notifications/settings/:id` `{in_app_enabled?, push_enabled?}` — per-event controls.

## /dashboard
`GET /dashboard/overview` — projects summary, 30-day progress trend, low-stock count, open/critical issues, pending inspections & test reports, today's attendance, pending payments, sales summary, milestone status, recent activity, expiring documents, **budget vs actual**. All figures respect the caller's project scope.
`GET /dashboard/wing/:wingId` — floor progress, recent reports, issues, inspections, material status, attendance, sales for one wing.

## /reports
`GET /reports` — catalog of 16 report definitions.
`GET /reports/:key?projectId&from&to&format=csv` — run a report (JSON, or CSV download when `format=csv`).
Keys include: `project-summary`, `project-progress-trend`, `wing-progress`, `daily-progress-register`, `milestone-status`, `material-stock`, `material-transactions`, `purchase-order-status`, `material-consumption`, `low-stock-alerts`, `labour-attendance`, `labour-wages`, `cost-summary`, `budget-vs-actual`, `sales-collection`, `issue-aging`.

## /admin
`GET /admin/audit-logs?userId&module&action&from&to` · `GET /admin/audit-logs/export` (CSV) *(admin.view / admin.export)*.

## Files
`GET /files/:id` — streams an uploaded file after auth + **project-scope check** on the owning record. `GET /files/:id/download` — attachment disposition.

## Health
`GET /health` — liveness probe (no auth).

---

### Error shape

```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "Invalid email" } ] }
```

`errors` appears on 400 responses from `express-validator`.
