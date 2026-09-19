### 4.4 Daily Progress

The daily site worksheet — the heartbeat of the system. Site teams record what happened, where, with photos and GPS.

**List screen**

- **Columns** — Date, Work (description + project · wing · floor), Progress %, Labour, Photos count, GPS (link opens the coordinates on OpenStreetMap), Reported by.
- **Filters** — Project, Wing, free-text search on descriptions. Pagination (15/page).
- **Actions** — Export CSV (`progress.export`), + New Report (`progress.create`), row click → detail.

**New Report modal**

| Field | Notes |
|---|---|
| Project / Wing / Floor | Cascading selects (wing list reloads per project, floors per wing) |
| Date | Report date (required) |
| Time | Work time |
| Overall progress % | Required, 0–100 — feeds the roll-up |
| Labour count | People on site that day |
| Weather | Clear / Cloudy / Rainy / Hot / Cold |
| Work description / Work completed today | Required / optional text |
| Material used, Remarks | Free text |
| GPS | **Capture GPS** button uses the browser geolocation; coordinates are stored on the report *and* attached to every photo |
| Site photos | Up to **8** images (jpeg/png/webp). Previews show the GPS + capture date; individual removal |

**Save.** The form is submitted as `multipart/form-data` with a generated `client_ref` (`web-<timestamp>-<rand>`) and a `photosMeta` JSON array (per-photo latitude/longitude/captured_at/source). If the browser is offline the report is **queued in `localStorage` under `cerp.offlineProgress`** and the toast explains it will sync when online — the `client_ref` guarantees the server never creates it twice.

**Detail modal.** All fields, GPS link, photo grid (each photo shows source — app camera vs uploaded — and its coordinates), and Delete (`progress.delete`).

**Data flow**

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/progress?projectId=&wingId=&search=&page=` | `daily_progress` + `projects`, `wings`, `floors`, `progress_photos` counts | Scope-filtered |
| Create | `POST /api/progress` (multipart) | `file_uploads` (each photo), `progress_photos` (progress_id, file_id, lat, lng, captured_at, source, uploaded_by), `daily_progress` (incl. `client_ref`) | **Progress roll-up** recomputed for the project; `audit_logs`; duplicate guard: if `client_ref` already exists the existing row is returned instead of a new insert |
| Edit | `PUT /api/progress/:id` | `daily_progress` | Roll-up recomputed, `audit_logs` |
| Delete | `DELETE /api/progress/:id` | `daily_progress` (+ photos) | Roll-up recomputed, `audit_logs` |
| Batch sync (mobile) | `POST /api/progress/sync` | as create, per item | Per-item result: `created` / `duplicate` / `error` |
| Export | `GET /api/progress/export` | `daily_progress` | CSV; `audit_logs` action=export |
| Photos display | `GET /api/files/:id` | `file_uploads` | Authenticated object URL (token-bounded), served from disk |

![Daily Progress](assets/screenshots/web-04-progress.png)

### 4.5 Workforce & Attendance

Three tabs: **Attendance** (default), **Workers**, **Labour Payments**.

**Tab: Workers** — the labour master.

- **Columns** — Code, Name, Category, Contractor, Mobile, Daily wage, OT/hr, Project, Active status.
- **Filters** — Project, Category.
- **CRUD fields** — Name, Worker code (auto if blank), Mobile, Category (from Masters → Labour Categories), Contractor (from Masters → Contractors), Daily wage (₹), Overtime rate (₹/hr), Project, Wing, Joining date, Active, ID proof.

| Action | API | Tables |
|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/workers…` | `workers` (+ category/contractor joins), `audit_logs` |

**Tab: Attendance** — mark a project for one day and save all workers in one batch.

1. Pick **Project** and **Date** (default today).
2. The summary badges show counts per status (present / absent / half day / leave / overtime) plus the **pay roll** badge — the day's total wage once marked.
3. Quick-mark buttons: **All present** / **All absent**.
4. Per worker: status buttons **present · absent · half day · leave · overtime**, an **OT hrs** numeric input, and a live **Day pay** preview:
   - present or overtime → full daily wage
   - half day → 50% of daily wage
   - OT → hours × the worker's OT rate
5. **Save attendance (n)** submits every worker for that day in one call; existing rows are updated, new rows inserted.

| Action | API | Tables | Side effects |
|---|---|---|---|
| Load workers for project | `GET /api/workers?projectId=&is_active=1` | `workers` | — |
| Load existing marks | `GET /api/attendance?projectId=&date=` | `attendance` | Hydrates the mark buttons |
| Summary badges | `GET /api/attendance/summary?projectId=&date=` | `attendance` GROUP BY status | — |
| Batch save | `POST /api/attendance` `{project_id, date, records:[{worker_id, status, overtime_hours}]}` | `attendance` — `daily_amount` and `overtime_amount` **computed server-side** from the worker's wage/OT rate (same formula as the preview); upsert per worker+date+shift | `audit_logs`; drives Labour Payments & monthly report |
| Single edit | `PUT /api/attendance/:id` | `attendance` | Recomputed amounts |
| Export | `GET /api/attendance/export?projectId=` | `attendance` | CSV; audited |
| Monthly wage report | `GET /api/attendance/monthly-report?projectId=&month=` | `attendance` (days, OT, gross, paid vs pending per worker) | Read-only |

![Workforce — Attendance tab](assets/screenshots/web-17-workforce-attendance.png)

**Tab: Labour Payments** — generate and settle worker wages from attendance.

- **Columns** — Worker (+ code), Period (start → end), Days, OT hrs, Net, Paid, Status badge, **Mark paid** action for unpaid rows.
- **Pending KPI** — sum of (net − paid) across all rows.
- **Generate Payment modal** — Worker, Period start/end, Deductions (₹), optional Pay now (₹). The server sums the worker's attendance over the period: `gross = Σ daily_amount + Σ overtime_amount`, `net = gross − deductions`, writes the payment row with status `pending` (or `partial`/`paid` if money is given at generation).
- **Mark paid** sets `paid_amount = net_amount`, today's date, mode cash → status `paid`.

| Action | API | Tables |
|---|---|---|
| List | `GET /api/labour-payments?projectId=` | `labour_payments` + worker join |
| Generate | `POST /api/labour-payments` `{worker_id, project_id, period_start, period_end, deductions, paid_amount?}` | `attendance` (read over period) → `labour_payments` (computed totals), `audit_logs` |
| Mark paid / edit | `PUT /api/labour-payments/:id` | `labour_payments` (paid_amount, payment_date, payment_mode, status), `audit_logs` |

![Workforce — Labour Payments tab](assets/screenshots/web-22-workforce-payments.png)

### 4.6 Equipment

Track heavy machinery and site equipment: fleet status, daily hour logs, fuel, and monthly hire billing.

**Summary tiles** — Total fleet (with deployed count), Available, Deployed, Maintenance, Breakdown, **Hours this month** (running hours) with fuel used in litres. From `GET /api/equipment/summary`.

**Fleet table**

- **Columns** — Code, Equipment, Type (excavator, crane, concrete mixer, tower crane, bulldozer, loader, generator, compactor, dumper, scaffolding, pump, other), Ownership (owned / rented / contractor supplied), Project, Hourly rate, Status badge (available / deployed / maintenance / breakdown / idle), Last log date.
- **Filters** — Search (code, name, operator), Status, Type, Ownership.
- **Add / Edit equipment fields** — Code (auto `EQ-…` if blank), Name, Type, Ownership, Project ID, Wing ID, Hourly / Daily / Monthly rate, Capacity, Registration no / asset tag, Operator, Status, Deployed on, Active, Remarks. Delete is allowed only when the unit has **no logs** (history is preserved).

**Equipment detail modal** (row click or Open)

- **Profile card** — status, ownership, rates, registration, operator.
- **Daily log form** — Date, Status after, Deployed hrs, Running hrs, Idle hrs, Breakdown hrs, Fuel (L), Work done, Remarks. Saving inserts an `equipment_logs` row **and flips `equipment.status` to "status after"** — so the fleet board always reflects the latest log.
- **Log history table** — date, hours, fuel, status after, remarks.
- **Hire billing** — "Generate monthly billing" asks for `YYYY-MM`; the server sums the month's **running hours × hourly rate** and writes an `equipment_billing` row (payment status pending/partial/paid, paid amount editable afterwards). Billing rows are listed with month, hours, rate, total, status, paid.

| Action | API | Tables | Side effects |
|---|---|---|---|
| Fleet list | `GET /api/equipment?search=&status=&equipment_type=&ownership=&page=` | `equipment` + `projects`, last-log subquery | Scope-filtered |
| Summary | `GET /api/equipment/summary` | `equipment` (by status), `equipment_logs` (month hours + fuel) | — |
| Add/edit | `POST /api/equipment` · `PUT /api/equipment/:id` | `equipment`, `audit_logs` | — |
| Delete | `DELETE /api/equipment/:id` | `equipment` (409 if logs exist), `audit_logs` | — |
| Save daily log | `POST /api/equipment/logs` `{equipment_id, project_id, log_date, deployed_hours, running_hours, idle_hours, breakdown_hours, fuel_quantity, work_done, remarks, status_after}` | `equipment_logs`, **`equipment.status` updated** | `audit_logs` |
| Edit log | `PUT /api/equipment/logs/:id` | `equipment_logs` | — |
| Detail (profile + logs + billing) | `GET /api/equipment/:id` | `equipment`, `equipment_logs`, `equipment_billing` | — |
| Generate hire bill | `POST /api/equipment/billing/generate` `{equipment_id, billing_month}` | `equipment_logs` (read running hours) → `equipment_billing` (hours × hourly_rate) | Re-generating an existing month re-totals it; `audit_logs` |
| Edit billing / mark paid | `PUT /api/equipment/billing/:id` | `equipment_billing` | — |

![Equipment module](buildcontrol/web-equipment.png)
