---

## 8. Data dictionary — all 65 database tables

Single MySQL schema (`backend/database/schema.sql`), 65 tables, FKs and indexes included. Grouped by domain.

### 8.1 Identity & access (9)

| Table | Purpose |
|---|---|
| `users` | Login accounts: email (unique), bcrypt password hash, name, phone, employee_code, status, last_login_at |
| `roles` | Role catalogue: name, code, is_system, is_active |
| `permissions` | Permission catalogue: code `module.action`, module, action |
| `role_permissions` | Role ↔ permission join |
| `user_roles` | User ↔ role join |
| `user_projects` | Project/wing scoping: user, project_id, wing_id (0 = all wings) |
| `refresh_tokens` | Rotating refresh tokens: user, sha256 token hash, device info, expires_at, revoked_at |
| `user_push_tokens` | Expo push tokens per user (mobile) |
| `password_reset_tokens` | Single-use, time-limited reset tokens |

### 8.2 Project structure & progress (10)

| Table | Purpose |
|---|---|
| `projects` | Project master: code, client, manager, budget, dates, status, **overall_progress** (computed) |
| `wings` | Wings/blocks: code, manager, dates, status, **progress** (computed) |
| `floors` | Floors per wing: sequence, status, progress |
| `units` | Saleable units: number, type, saleable area, price, status (available/booked/sold) |
| `milestones` | Schedule events: start/target/completion, percentage, responsible, status |
| `daily_progress` | Daily site reports: description, %, labour, weather, GPS, **client_ref** (dedupe) |
| `progress_photos` | Photos per report: file ref, per-photo GPS, captured_at, source, uploaded_by |
| `file_uploads` | Uploaded files on disk: original name, path, mime, size, owner |
| `drawings` | Drawing master: number, category, **approval_status**, latest revision |
| `drawing_revisions` | Revision history: rev no, date, status (pending/approved/rejected), file ref |

### 8.3 Materials & inventory (11)

| Table | Purpose |
|---|---|
| `material_categories` | Categories with consumable flag |
| `materials` | Material master: code, unit, **min_stock_level** (alert threshold) |
| `suppliers` | Vendor master: contact, GST, address |
| `material_requirements` | Requirements: qty, needed-by, status (pending→approved/rejected→po_created→fulfilled) |
| `purchase_orders` | PO header: supplier, dates, **auto totals** (subtotal/tax/discount/grand), status, approved_by |
| `purchase_order_items` | PO lines: material, qty, unit, rate, tax, amount, running received_qty |
| `material_receipts` | GRN header: PO ref, challan, date |
| `material_receipt_items` | GRN lines: received, damaged, **accepted** qty |
| `material_consumption` | Consumption records: qty, location, date |
| `material_returns` | Returns: qty, status (pending→approved) |
| `stock_transactions` | **The ledger** — every +/− with reference module/id; all stock positions are computed from here |

### 8.4 Finance (6)

| Table | Purpose |
|---|---|
| `cost_entries` | Vendor cost/billing entries: type, category, tax, paid, **payment_status** |
| `sales` | Unit sales: customer, amount, GST, received, pending, payment_status |
| `sales_payments` | Staged collections: amount, date, mode, reference |
| `petty_cash_entries` | Site cash: topup/expense/replenish, category, paid-to |
| `labour_payments` | Worker wage settlements: period, days, OT, gross, deductions, net, paid |
| `equipment_billing` | Monthly hire bills: hours, rate, total, payment status |

### 8.5 Workforce (5)

| Table | Purpose |
|---|---|
| `contractors` | Contractor companies |
| `worker_categories` | Labour categories with base daily rate |
| `labour_rates` | Date-effective rate cards per category/contractor |
| `workers` | Worker master: code, category, contractor, **daily_wage, overtime_rate**, project/wing |
| `attendance` | Daily marks: status, OT hours, **computed daily_amount / overtime_amount**, shift, marked_by |
| `labour_rates`/`labour_payments` | (see Finance for payments) |

### 8.6 BOQ (3)

| Table | Purpose |
|---|---|
| `boq_categories` | BOQ item categories |
| `boq` | BOQ header: tax %, discount, status, totals |
| `boq_items` | Items: est/actual qty × rate, variance |

### 8.7 Quality & issues (8)

| Table | Purpose |
|---|---|
| `test_types` | Lab test catalogue |
| `test_reports` | Results: lab, standard, result values, result_status, approval status, file |
| `inspection_types` | Inspection catalogue with **checklist template** |
| `inspections` | Inspection reports: date, inspector, GPS, status |
| `inspection_items` | Checklist lines: item, result (pass/fail/N-A) |
| `issue_categories` | Issue categories |
| `issues` | Issues: priority, assignee, due, GPS, status workflow, photos |
| `issue_comments` | Discussion thread |

### 8.8 Documents, equipment & system (6)

| Table | Purpose |
|---|---|
| `project_documents` | Document vault: category, version, **expiry_date** |
| `notifications` | In-app notifications: user, title, message, type, module, record_id, is_read |
| `notification_settings` | Per-event on/off switches |
| `audit_logs` | Full mutation trail: user, action, module, record, old/new JSON, IP, agent |
| `equipment` | Fleet master: type, ownership, rates, status, project |
| `equipment_logs` | Daily hour/fuel logs with status_after |

### 8.9 HRMS (7)

| Table | Purpose |
|---|---|
| `hrms_departments` | Department master |
| `hrms_designations` | Designation master with **role mapping** (role_id) |
| `hrms_employees` | Shared employee directory: all profile fields, project/wing, **user_id** (login link) |
| `hrms_leave_types` | Leave catalogue: code, annual quota, paid flag |
| `hrms_leave_requests` | Requests: dates, computed days, status, decision fields |
| `hrms_salary_structures` | Salary components per employee with effective_from |
| `hrms_payroll` | Monthly payroll: working/paid/Lop days, gross, deductions, net, payment fields |

**Total: 65 tables.** Stock positions, progress percentages, PO totals, payroll figures and payment statuses are all *computed* values — the stored facts are the transactions and the source rows.

---

## 9. Status & workflow reference

| Entity | States | Notes |
|---|---|---|
| Project | planning · in_progress · on_hold · completed · cancelled | overall_progress auto-computed |
| Wing | same as project | progress auto-computed |
| Floor | pending · in_progress · completed · on_hold | pending displays as "planning" |
| Unit | available · booked · sold | flipped by sales; delete blocked when sold |
| Milestone | pending · in_progress · completed · delayed | 100 % auto-completes |
| Requirement | pending · approved · rejected · po_created · fulfilled | approve/reject gated by `materials.approve` |
| Purchase order | draft · pending_approval · approved · sent · partially_received · received · cancelled | GRN moves it forward automatically |
| GRN item | received / damaged / accepted | accepted = received − damaged |
| Material return | pending · approved | approval adds stock back |
| Cost entry (payment) | unpaid · partial · paid | derived from paid vs total |
| Labour payment | pending · partial · paid | generated from attendance period |
| Sale (payment) | pending · partially_paid · paid · overdue | staged payments |
| Issue | open · assigned · in_progress · resolved · closed | reopen → in_progress; overdue flagged |
| Inspection | pending · passed · failed · reinspection_required · closed | any failed item → failed |
| Test report | status: draft → submitted → approved/rejected; result: pending · pass · fail · inconclusive | fail raises notification |
| Drawing revision | pending · approved · rejected | approval sets drawing approval_status |
| Equipment | available · deployed · maintenance · breakdown · idle | flips to log's status_after |
| Equipment billing | pending · partial · paid | monthly, hours × hourly rate |
| Employee | active · on_leave · resigned · terminated | login link optional |
| Leave request | pending · approved · rejected | unpaid approved leave feeds payroll |
| Payroll record | pending · partial · paid | paid months locked from re-generation |
| User | active · inactive | reset password revokes sessions |

---

## 10. Tips, FAQ & troubleshooting

**General**

- *I don't see a menu item.* Your roles don't include the module's `view` permission, or (for scoped modules) you have no matching project assignment. Ask your admin to check Roles → Permissions and Users → Project Access.
- *I can open a screen but a button is missing.* That button needs an extra action (e.g. `approve`, `export`) — same fix.
- *Every screen still blocks me on the server (403).* The API enforces permissions independently of the UI; the message names the exact permission code.

**Progress & photos**

- *Project % seems "wrong".* It is not typed: wing % = average of that wing's daily progress entries; project % = average of wing %. Delete/correct the underlying reports to change it.
- *Duplicate progress report after mobile sync?* Impossible by design — `client_ref` dedupe; the sync returns `duplicate` with the existing id.
- *Photos show "no GPS".* Geolocation was denied or unavailable at capture; the photo still saves.

**Materials**

- *Consumption rejected with "insufficient stock".* The ledger has less than the quantity; receive a GRN first or reduce the quantity.
- *Where is my damaged quantity?* In the GRN detail (per item) and the Stock tab's Damaged column — damaged stock never enters available stock.
- *LOW STOCK badge.* Stock fell to or below the material's Min stock level (Masters/Materials field). Raise a requirement.

**Workforce & HR**

- *Attendance day-pay looks wrong.* Check the worker's daily wage and OT rate on the Workers tab; half day pays 50 %, absent/leave pay 0.
- *Payroll month won't regenerate.* Any month with a recorded payment is locked — correct the payment record instead.
- *Employee missing from payroll generation.* Must be active (status active) and have a salary structure effective in that month; skips are listed in the toast.

**Sales**

- *Unit not in the New Sale list.* It is already booked/sold (only `available` units are offered).
- *Collections show pending.* Use the row's **+ Payment** to record staged payments; status updates automatically.

**Security & administration**

- *How do I force a user out everywhere?* Users → Reset PW (or the user changes their password) — all refresh tokens are revoked.
- *Who did what to record X?* Audit Logs → filter by module/record; the detail shows full old/new JSON, IP and user-agent.
- *Can I silence a notification type?* Masters → Notification Events → toggle off.

**Deployment reminders**

- Change all seed passwords; set strong JWT secrets in `backend/.env`; run `npm run smoke` after `db:setup` to verify the 17-point API check; see `docs/INSTALLATION.md` and `docs/DEPLOYMENT.md` for production hardening.
