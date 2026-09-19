### 4.13 Materials & Inventory

Seven tabs covering the complete material lifecycle — the largest module in the portal:

**Tabs:** `Materials` · `Stock & Alerts` · `Requirements` · `Purchase Orders` · `Receipts (GRN)` · `Consumption` · `Suppliers`

The tab is deep-linkable via `?tab=pos` etc. (notifications to POs land you on the right tab).

#### Tab 1 — Materials (master)

- **Columns** — Code, Name, Category, Unit, Min Stock, Active.
- **Filter** — Category. **Search** — name/code.
- **CRUD fields** — Name, Code (required), Category (from Masters → Material Categories), Unit (bags / kg / ton / cft / cum / sqft / sqm / nos / meter / litre / month), **Min stock level** (the alert threshold), Active, Description.
- Export CSV available.

| Action | API | Tables |
|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/materials…` | `materials`, `audit_logs` |
| Categories | `GET|POST|PUT|DELETE /api/materials/categories…` | `material_categories` (managed from Admin Masters) |

![Materials master tab](assets/screenshots/web-07-materials.png)

#### Tab 2 — Stock & Alerts

The live stock position, **computed from the transactions ledger** — there is no hand-edited stock number.

- **Columns** — Material (+ code), Project, Received, Consumed, Damaged, Returned, **Current Stock** (qty + unit), **Alert** (LOW STOCK badge when `current_stock <= min_stock_level` and the level is set).
- **Filters** — search, project. **Refresh** button.
- **📜 Transactions** toggle reveals the recent **stock ledger**: date, material, type (opening / receipt / consumption / return — receipts & openings green, others red), quantity (negative in red), reference module + id, by whom.

| UI | API | Tables |
|---|---|---|
| Stock position | `GET /api/materials/stock?search=&projectId=` | `stock_transactions` aggregated per material/project (received = Σ+ receipts, consumed = Σ−, damaged, returned) + `materials` for min level |
| Ledger | `GET /api/materials/stock/transactions?projectId=` | `stock_transactions` (newest first) |
| Low-stock alerts feed | `GET /api/materials/stock/low-stock-alerts` | same aggregation, filtered to `low_stock = 1` |

![Stock & Alerts tab](assets/screenshots/web-08-materials-stock.png)

#### Tab 3 — Requirements

Raise a material need; store approves; procurement follows.

- **Columns** — Req No. (REQ-…), Material, Project (+ wing), Qty + unit, Needed by, Requested by, Status.
- **Filter** — Status: `pending → approved | rejected → po_created → fulfilled`.
- **New Requirement fields** — Project, Wing, Material, Required qty, Unit, Required date, Remarks.
- **Approve / Reject** buttons on pending rows (`materials.approve`).

| Action | API | Tables | Side effects |
|---|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/materials/requirements…` | `material_requirements`, `audit_logs` | — |
| Approve / Reject | `PUT /api/materials/requirements/:id/status` | `material_requirements` (status, approved_by, approved_at) | `notifications` event `po_approval` (requirement decision) to the requester |

![Requirements tab](assets/screenshots/web-09-materials-requirements.png)

#### Tab 4 — Purchase Orders

- **Columns** — PO No. (PO-…), Supplier, Project, Date, Expected delivery, Grand total, Status.
- **Filter** — Status: `draft → pending_approval → approved → sent → partially_received → received`, plus `cancelled`.
- **Row actions** — **Submit** (draft → pending_approval), **Approve** (→ approved, `materials.approve`), **Mark sent** (→ sent).
- **New PO modal** — Project, Supplier, PO date, Expected delivery, Discount (₹), Remarks + **items grid**: material (unit auto-filled), qty, unit, rate ₹, tax % (default 18) per line; **Subtotal / Tax / Grand total computed live** (subtotal = Σ qty×rate; tax per line; grand = subtotal + tax − discount).
- **PO detail modal** — header (supplier, project, status, total incl. tax), items table (ordered vs received qty, rate, amount), and — when status is approved/sent/partially_received — the **Record Receipt (GRN)** panel: per item "Received" and "Damaged" inputs showing pending quantity.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List | `GET /api/materials/purchase-orders?page=&status=` | `purchase_orders` + supplier/project, item sums | — |
| Create | `POST /api/materials/purchase-orders` `{…header, items:[{material_id, quantity, unit, rate, tax_percent}]}` | `purchase_orders` (totals computed server-side: subtotal, tax, grand), `purchase_order_items`, `audit_logs` | — |
| Detail | `GET /api/materials/purchase-orders/:id` | PO + items (with running `received_qty`) | — |
| Status changes | `PUT /api/materials/purchase-orders/:id/status` | `purchase_orders` (+ approved_by/at) | Approve → notification to creator (`po_approval`) |

![Purchase Orders tab](assets/screenshots/web-10-materials-purchase-orders.png)

#### Tab 5 — Receipts (GRN)

- **Columns** — GRN No., Date, Supplier, Project, PO Ref, Challan. Row click → detail with per-item **Received / Damaged / Accepted** (accepted = received − damaged).
- Receipts are normally recorded from the PO detail (above); the tab is the register.

**Recording a GRN (data flow)**

| Step | API | Tables written | Side effects |
|---|---|---|---|
| Save GRN | `POST /api/materials/receipts` `{po_id, project_id, receipt_date, items:[{po_item_id, received_qty, damaged_qty}]}` | `material_receipts` (GRN-…), `material_receipt_items` (accepted_qty computed) | **`stock_transactions` +receipt per item (accepted qty)**; damaged qty tracked separately; `purchase_order_items.received_qty` increased; PO auto-moves to `partially_received` or `received`; `notifications` `material_received` to store approvers; if stock falls to/below min level after consumption elsewhere, `material_shortage` alert; `audit_logs` |

#### Tab 6 — Consumption

Record material used on site.

- **Columns** — Date, Material, Project, Qty + unit, Location, Wing, By.
- **Fields** — Project, Wing, Material, Quantity, Unit, Date, Location, Remarks.
- The server performs a **live stock check**: it reads current stock from the ledger and inserts a **negative** `stock_transactions` row; consuming more than available is rejected.

| Action | API | Tables | Side effects |
|---|---|---|---|
| List/create/edit/delete | `GET|POST|PUT|DELETE /api/materials/consumption…` | `material_consumption` + `stock_transactions` (−qty) | `audit_logs`; low-stock alert event when crossing the min level |
| Returns | `POST /api/materials/returns` · `PUT /api/materials/returns/:id/approve` | `material_returns` + `stock_transactions` (+qty on approval) | Approved returns add stock back |

#### Tab 7 — Suppliers

- **Columns** — Name, Code, Contact, Phone, GST No, City.
- **Fields** — Name, Code, Contact person, Phone, Email, GST number, Address, City, State, PIN.

| Action | API | Tables |
|---|---|---|
| CRUD | `GET|POST|PUT|DELETE /api/materials/suppliers…` | `suppliers`, `audit_logs` |

#### The complete material cycle (summary)

```
Requirement (REQ) ──approve──▶ Purchase Order (PO) ──approve──▶ Sent to supplier
        │                          │                              │
        │                          │  Supplier delivers           ▼
        │                          │                    GRN (received / damaged)
        │                          │                       │  +stock_transactions (receipt)
        │                          │                       ▼
        └──────────────────────────┴──────────────▶ Stock position (live from ledger)
                                                        │
                            Site uses material ◀───────┤  LOW STOCK alert when
                            Consumption (−ledger)      │  stock ≤ min level
                                                        │
                            Returns (+ledger on approval)
```

### 4.14 BOQ (Bill of Quantities)

Estimated cost baseline per project (optionally per wing), compared against actuals.

**BOQ List**

- **Columns** — BOQ No. (BOQ-…), Title (+ project · wing), Estimated, Actual, **Variance** (red if over budget, green if under), Status.
- **Filter** — Status: draft / active / completed / cancelled.
- **New BOQ fields** — Project, Wing (optional), Title, Tax % (default 18), Discount (₹), Status, Description.
- **⇪ Import items** — paste CSV rows `item_code, description, unit, estimated_qty, rate, actual_qty` (first line = header); a **template** can be downloaded from `/api/boq/template-csv`. Import goes through `POST /api/boq/:id/import-json` (rows are parsed in the UI and posted as JSON).
- Export CSV per BOQ and for the whole list.

**BOQ Detail** (`/boq/:id`)

- **KPI band** — Estimated, Actual, Variance (₹ + %), Tax (at BOQ tax %), Grand Total.
- **Items table** — Code, Description (+ category), Unit, Est. Qty, Rate, Est. Amt, Act. Qty, Act. Amt, **Var %** (per item), Edit.
- **Add / Edit item modal** — Item code, Category (from Masters → BOQ Categories), Description, Unit, Rate, Estimated qty, Actual qty, live Estimated amount / Actual amount / Variance, Remarks.

**Calculation rules (server-side):** item est. amt = est. qty × rate; act. amt = act. qty × rate; BOQ totals roll up items; tax and discount applied at header level; variance % = (actual − estimated) / estimated.

| Action | API | Tables |
|---|---|---|
| List | `GET /api/boq?page=&status=&search=` | `boq` + item total aggregation |
| Create | `POST /api/boq` | `boq`, `audit_logs` |
| Detail | `GET /api/boq/:id` | `boq` + `boq_items` + computed `totals` |
| Save item (new or edit) | `PUT /api/boq/:id` (whole items array) or `PUT /api/boq/items/:itemId` | `boq_items`, `boq` (totals recomputed), `audit_logs` |
| Import | `POST /api/boq/:id/import-json` | `boq_items` (bulk), totals recomputed |
| Export / template | `GET /api/boq/export` · `GET /api/boq/:id/export` · `GET /api/boq/template-csv` | CSV generation, audited |

![BOQ list](assets/screenshots/web-11-boq.png)

![BOQ detail](assets/screenshots/web-12-boq-detail.png)

### 4.15 Payments (Billing & cost entries)

Record project costs against vendors and track what has been paid.

**KPI band** — Total Cost, Paid, Pending Payments, plus a **cost breakdown by project** stacked bar (Consumables / Equipment / Labour, ₹ lakhs) from `GET /api/billing/summary`.

**Cost entries table**

- **Columns** — Date, Type badge (consumable / non-consumable / labour / other), Description (+ project · wing), Category, Qty, Total, Paid, **Pending** (red when > 0), Payment status (unpaid / partial / paid).
- **Filters** — Type, Payment status, Project.
- **New Cost Entry fields** — Project, Wing, Type, Category (Cement, Bricks, Sand, Steel, Aggregate, Tiles, Pipes, Electrical, Paint, Other, Machinery, Equipment, Crane charges, Excavator charges, Vehicle charges, Rental equipment), Description, Date, Bill/invoice no, Bill date, Quantity, Unit, Rate, **Tax/GST % (default 18)**, Paid amount, Vendor/supplier (from Materials → Suppliers), Remarks. `total_amount` = qty × rate × (1 + tax) is computed server-side when quantity/rate are given; `pending_amount` = total − paid.

| Action | API | Tables |
|---|---|---|
| List + filters | `GET /api/billing/cost-entries?entry_type=&payment_status=&projectId=` | `cost_entries` + project/supplier joins, scope-filtered |
| Create / edit / delete | `POST|PUT|DELETE /api/billing/cost-entries…` | `cost_entries`, `audit_logs` (payment_status derived from paid vs total) |
| Summary | `GET /api/billing/summary` · `GET /api/billing/summary/by-wing` | `cost_entries` aggregated per project (and per wing) |
| Export | `GET /api/billing/cost-entries/export` | CSV, audited |

These entries feed the **Dashboard vendor dues** KPI, the **Budget vs Actual** chart/report, and the `pending-collections`/`project-cost` reports.

![Payments / billing](assets/screenshots/web-13-billing.png)
