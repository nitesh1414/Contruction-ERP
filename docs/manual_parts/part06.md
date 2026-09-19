### 4.16 Petty Cash

Track site cash: top-ups (cash in), expenses, replenishments.

**When a project is selected** the summary appears:

- **Cash on hand** — big balance figure: `top-ups + replenishments − expenses`.
- **Spend by category** — horizontal bars per category (Travel / conveyance, Food / catering, Fuel & lubricants, Labour incentives, Tools & consumables, Office & admin, Misc).
- **Recent activity** — last 5 entries with type badge (topup green, replenish blue, expense orange), paid-to, amount.

**Entries table** — Date, Type, Category, Paid to, Description, Amount, Project. Filters: project, search, type, category. Actions: Edit / Delete (per permission), **⬇ Export**, **+ Add entry**.

**New entry fields** — Project (required; pre-filled from the filter), Txn type (`topup` / `expense` / `replenish`), Date, Amount, Category, Paid to, Received by, Description, Remarks.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/petty-cash?projectId=&search=&txn_type=&category=&page=` | `petty_cash_entries` + project join, scope-filtered | — |
| Summary | `GET /api/petty-cash/summary?projectId=` | `petty_cash_entries` aggregated (balance, by category, recent) | — |
| Create / edit / delete | `POST|PUT|DELETE /api/petty-cash…` | `petty_cash_entries`, `audit_logs` | — |
| Export | `GET /api/petty-cash/export?…` (honours current filters) | CSV, audited | — |

![Petty Cash](buildcontrol/web-petty-cash.png)

### 4.17 CRM & Sales

Sell the units that were defined under Projects → Floors & Units, and chase collections.

**KPI band** — Units Sold (with available count), Sales Value, Collected, **Pending Collections**, and a **Sales register ⬇ CSV** export card. Below, a unit-availability funnel (available / booked / sold counts) from `GET /api/sales/unit-availability`.

**Unit Sales table**

- **Columns** — Unit (number + wing · floor · type), Customer (+ phone), Sale date, Amount (+ incl. GST note), Received, **Pending** (red), Payment status (pending / partially_paid / paid / overdue), GST badge.
- **Filters** — Payment status, GST (yes/no).
- **New Sale fields** — **Unit** (only units currently `available` are listed), Customer name, Customer mobile, Sale amount, Amount received, Booking date, Sale date, **GST applicable (5%)** checkbox, GST %, Other charges, Status (booked / sold).
- **+ Payment** on any row with a pending balance opens **Collect payment**: amount (defaults to pending), date, mode (online / bank transfer / upi / cheque / cash), includes-GST flag, reference/UTR, plus the full **payment history** for that sale.

**Side effect on units:** creating a sale flips the unit `units.status` from `available` to `booked` or `sold`; deleting it returns the unit to `available`. Pending collections trigger the `sales_payment_due` notification event.

| Action | API | Tables | Side effects |
|---|---|---|---|
| Summary / funnel | `GET /api/sales/summary` · `GET /api/sales/unit-availability` | `sales` + `sales_payments`, `units` counts | — |
| List | `GET /api/sales?page=&payment_status=&is_gst=` | `sales` + unit/project joins | — |
| New sale | `POST /api/sales` | `sales` (GST amount computed, pending = amount − received), **`units.status` → booked/sold**, `audit_logs` | `notifications` `sales_payment_due` when pending remains |
| Detail | `GET /api/sales/:id` | `sales` + `sales_payments` history | — |
| Record payment | `POST /api/sales/:id/payments` `{amount, payment_date, payment_mode, is_gst, reference_number}` | `sales_payments`, `sales.amount_received`/`pending_amount`/`payment_status` updated | Overdue → dashboard & notifications |
| Export | `GET /api/sales/export` | CSV, audited | — |

![CRM & Sales](assets/screenshots/web-18-sales.png)

### 4.18 HR & Payroll

The shared employee directory (same records as Admin Console) with leave, salary structures and monthly payroll.

**Summary tiles** — Active employees, On leave (today), Pending leave requests, Payroll due for the current month (pending net).

Four tabs: **Employees · Leave · Salary structures · Payroll**.

#### Tab 1 — Employees

- **Filters** — search (name, code, email), Department, Status (active / on_leave / resigned / terminated). Pagination.
- **Columns** — Code, Name, Designation (+ linked role name), Dept, Project, **Login** (green "Linked · username" badge or gray "No login"), Status, Joined, row actions (Details / Edit / Delete).
- **Add / Edit fields** — Employee code, Full name, Email, Phone, **Designation / role** (from Masters → Designations; option labels show the linked login role), **Department** (from Masters → Departments), Date of joining, Date of birth, Gender, Employment type (permanent / contract / probation / intern), Status, Project, Wing, Bank account, PAN, Aadhaar, Address, Active, Remarks.
- **Login access block** (in the same modal):
  - *New employee:* "Create login credentials" checkbox (requires `users.create` permission) → temporary password (min 8 chars) + **login role** chips. The role linked to the chosen **designation is added automatically**; other selected roles are retained.
  - *Existing employee with no login:* the same block provisions credentials and links the account (one-to-one; a duplicate link is blocked).
- **Employee details modal** (row click) — Profile card (all fields + project/wing), Login access card (account, email, status, masked bank account •••• last4), **Leave balance** table for the current year (type, quota, used, pending, remaining), **Salary history** (effective date, basic, HRA, PF), **Recent leave** and **Recent payroll** tables.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/hrms/employees?page=&search=&department=&status=` | `hrms_employees` + projects/wings + linked `users` + designation→role names | — |
| Detail | `GET /api/hrms/employees/:id` | employee + `hrms_salary_structures`, recent leave & payroll | — |
| Create | `POST /api/hrms/employees` (+ optional `create_login`, `login_password`, `login_role_ids`) | `hrms_employees`; when login requested: `users` (bcrypt), `user_roles` (selected + designation-linked role), `hrms_employees.user_id` set, `audit_logs` | Shared directory row appears in Admin Console instantly |
| Edit | `PUT /api/hrms/employees/:id` | `hrms_employees`, `audit_logs` | Login linking same as create (only when not yet linked) |
| Delete | `DELETE /api/hrms/employees/:id` | `hrms_employees` — **linked login is retained but unlinked** | `audit_logs` |
| Departments / designations | `GET /api/hrms/departments` · `GET /api/hrms/designations` | `hrms_departments`, `hrms_designations` (managed from Admin Masters) | — |
| Login roles list | `GET /api/hrms/login-roles` | active `roles` | — |

![HR & Payroll](buildcontrol/web-hrms.png)

#### Tab 2 — Leave

- **List** — Employee, Type (code badge), From, To, Days, Status (pending / approved / rejected). Filters: status, search.
- **New request** — Employee (active only), Leave type (from Masters → Leave types with quota & paid flag), From, To (days computed), Reason.
- **Approve / Reject** via `PUT /api/hrms/leave-requests/:id/decide` (requires `hrms.approve`; Admin Console shows the same workflow). Approved **unpaid** leave feeds payroll loss-of-pay.

| Action | API | Tables |
|---|---|---|
| List | `GET /api/hrms/leave-requests?status=&search=` | `hrms_leave_requests` + employee + type |
| Create | `POST /api/hrms/leave-requests` | `hrms_leave_requests` (total_days computed), `audit_logs` |
| Decide | `PUT /api/hrms/leave-requests/:id/decide` | `hrms_leave_requests` (status, decided_by, decided_on), `audit_logs` |

#### Tab 3 — Salary structures

- **Columns** — Employee, Dept, Effective, Basic, HRA, **Gross** (basic+HRA+DA+special+other, computed in UI), PF (ee), Edit/Delete.
- **Fields** — Employee, Effective from, Basic, HRA, DA, Special, Other, PF (employee/employer ₹), ESIC (employee/employer), Professional tax, Remarks.
- An employee's **latest active structure** (effective ≤ end of payroll month) is the one payroll uses.

| Action | API | Tables |
|---|---|---|
| CRUD | `GET|POST|PUT|DELETE /api/hrms/salary-structures…` | `hrms_salary_structures`, `audit_logs` |

#### Tab 4 — Payroll

- **Month picker** (defaults to current month) + **Generate monthly payroll** button (`hrms.create`).
- **Columns** — Employee, Dept, **Paid days** (1 dp), Gross, Deductions, **Net**, Payment status (pending / partial / paid), **Record payment** action.
- **Record payment modal** — Amount paid (≤ net), payment date, Reference/UTR. Status is derived: 0 → pending, < net → partial, ≥ net → paid. A month that already has money paid **cannot be regenerated**.

**Payroll calculation (server-side, per employee for the month):**

```
structure = latest active salary structure for the employee
total   = working days in the month
lop     = approved days of UNPAID leave types falling in the month
paid    = total − lop            (ratio = paid / total)
gross   = (basic + HRA + DA + special + other) × ratio
deduct  = min(gross, PF-ee × ratio + ESIC-ee × ratio + prof tax)
net     = gross − deduct
→ hrms_payroll row (payment_status = pending)
```

Bulk generation processes all active employees; those without a structure (or with blocked re-generation) are reported as **skipped** in the toast.

| Action | API | Tables |
|---|---|---|
| List month | `GET /api/hrms/payroll?payroll_month=&page=` | `hrms_payroll` + employee |
| Generate (one) | `POST /api/hrms/payroll/generate` | `hrms_leave_requests` (unpaid approved), `hrms_salary_structures` → `hrms_payroll` insert/update |
| Generate (bulk) | `POST /api/hrms/payroll/generate-bulk` `{payroll_month}` | same, all active employees; skips returned |
| Record payment | `PUT /api/hrms/payroll/:id/payment` | `hrms_payroll` (paid_amount, date, reference, derived payment_status) |
| Summary tiles | `GET /api/hrms/summary` | `hrms_employees`, `hrms_leave_requests`, `hrms_payroll` |

### 4.19 Reports & Dashboards

A self-service reports center — no SQL needed.

- **17 report cards** (grouped by domain): Project Progress, Daily Progress, Milestones, Material Stock, Material Consumption, Purchase Orders, Billing & Cost, BOQ Summary, Test Reports, Inspection Reports, Issues, Worker Attendance, Sales, Budget vs Actual, Pending Collections, Labour Payments, Project Cost.
- **Click a card** → viewer with optional **From/To** date range, the data table (first 12 columns shown), **⬇ Export CSV/Excel** and **🖨 Print / PDF** (browser print).

| UI | API |
|---|---|
| Report list | `GET /api/reports` → `[{key, label}]` |
| View | `GET /api/reports/:key?from=&to=` → `{label, data:[…]}` |
| Export | `GET /api/reports/:key?format=csv&from=&to=` (streamed CSV) |

Each report is a read-only query over the tables documented in the screen sections above (e.g. `budget-vs-actual` joins `projects` with `cost_entries`; `material-stock` uses the same ledger aggregation as the Stock tab).

![Reports center](assets/screenshots/web-20-reports.png)

![Report viewer with export](assets/screenshots/web-23-report-viewer.png)

### 4.20 My Profile

Covered in §3.3 — reachable from the user chip in the Web Portal. Includes the HR link card and the project-access list for scoped users.

![My Profile](assets/screenshots/web-21-profile.png)

### 4.21 In-app notifications (Web Portal)

Covered in §4.0. Event types raised by the backend: `issue_created`, `issue_assigned`, `issue_updated`, `issue_overdue`, `milestone_delayed`, `po_approval`, `material_received`, `material_shortage`, `test_failed`, `inspection_failed`, `drawing_revision`, `document_expiry`, `sales_payment_due`. Each is individually toggleable in Admin Console → Masters → Notification Events, and each notification carries a `module` + `record_id` used for the deep-link routing.
