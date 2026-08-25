# Database Guide

MySQL 8+ is the single datastore for the whole platform. The backend connects through
`mysql2` with a pooled connection and **parameterized queries everywhere** (SQL-injection safe
by construction). Full DDL lives in [`backend/database/schema.sql`](../backend/database/schema.sql).

---

## 1. Setup

```bash
cd backend
cp .env.example .env        # DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
npm run migrate             # creates database + tables + indexes + view (idempotent)
npm run seed                # inserts permissions, roles, demo users & sample records
# or both at once / from scratch:
npm run db:setup
npm run db:reset            # DROP + recreate + seed (destructive!)
```

`migrate` is idempotent (every statement is `CREATE … IF NOT EXISTS`) and accepts `--drop`
to wipe the schema first. `seed` is also idempotent (it skips sections that already have rows)
and accepts `--force` to reseed demo business data in a fresh database.

Manual MySQL alternative:

```bash
mysql -u root -p < backend/database/schema.sql
```

## 2. Conventions

- Engine **InnoDB**, charset **utf8mb4**.
- Primary keys `id INT UNSIGNED AUTO_INCREMENT`.
- Foreign keys with explicit `ON DELETE` behaviour (`CASCADE` for child rows such as
  wings→floors→units, `RESTRICT`/`SET NULL` for references that must not vanish silently).
- `created_at` / `updated_at` timestamps on all business tables.
- Indexes on every FK and on the hot filter columns (project_id, status, dates).
- Business numbers (`PRJ-000001`, `PO-000123`, `ISS-000456`…) are generated in code with a
  table-prefix + zero-padded id — human-readable and collision-free.
- Money as `DECIMAL(14,2)`; percentages as `DECIMAL(5,2)`; GPS as `DECIMAL(10,7)`.

## 3. Table map (55 tables + 1 view)

### Identity & access
| Table | Purpose |
|---|---|
| `users` | employee accounts (bcrypt password hash, status, last login) |
| `roles` | role master — seeded: Super Admin, Admin, Project Manager, Site Engineer, Civil/Electrical/Plumbing Engineer, Sales Executive, Store Manager, Accountant, Safety Officer, Quality Engineer *(custom roles supported)* |
| `permissions` | one row per `module.action` — view / create / edit / delete / approve / export / upload / download across 21 modules |
| `role_permissions` | role ↔ permission matrix |
| `user_roles` | users can hold multiple roles |
| `user_projects` | **project-level access control**: user → project (+ optional wing restriction) |
| `refresh_tokens` | hashed, revocable refresh tokens with device info |
| `user_push_tokens` | Expo push tokens for mobile notifications |
| `password_reset_tokens` | sha-256 hashed one-time reset tokens |

### Project structure
| Table | Purpose |
|---|---|
| `projects` | code, client, location, type, status (planning / in_progress / on_hold / completed / cancelled), budget, dates, `overall_progress` |
| `wings` | wings / blocks / towers per project, own progress |
| `floors` | floors per wing, own progress |
| `units` | sellable units per floor/wing (type, area, price, status) |
| `milestones` | planned vs actual dates, status pending / in_progress / completed / delayed |

### Site execution
| Table | Purpose |
|---|---|
| `daily_progress` | daily site reports: description, %, labour count, materials, weather, remarks, GPS, `client_ref` for offline dedupe |
| `file_uploads` | central file registry (path, mime, size, module, uploader, source camera/upload) |
| `progress_photos` | photos linked to a report with **latitude, longitude, captured_at, uploaded_by** |
| `drawings` + `drawing_revisions` | drawing register with version-controlled revisions & approval |

### Materials & inventory
| Table | Purpose |
|---|---|
| `material_categories`, `materials`, `suppliers` | masters (unit of measure, min stock level) |
| `material_requirements` | site requirement requests with approve → PO flow |
| `purchase_orders` + `purchase_order_items` | POs with qty×rate lines, subtotal, tax %, discount, grand total, status |
| `material_receipts` + `material_receipt_items` | GRNs against POs incl. **damaged qty** |
| `material_consumption` | issues material to work, **stock-checked** before deducting |
| `material_returns` | damaged/excess returns, approval driven |
| `stock_transactions` | immutable ledger: receipt / consumption / return / damage (+/- qty) |
| `v_stock_summary` *(view)* | live current stock per project × material, aggregated from the ledger — used by low-stock alerts |

### Cost, BOQ & sales
| Table | Purpose |
|---|---|
| `cost_entries` | vendor bills & site costs by category; `pending_amount` generated column; payment status |
| `boq_categories`, `boq`, `boq_items` | BOQ headers (subtotal/tax/discount/grand total) and items (qty × rate, `estimated_amount` generated, actual qty/rate + computed variances) |
| `sales` | unit sales with GST, `pending_amount` generated column |
| `sales_payments` | staged collection entries |

### Quality & safety
| Table | Purpose |
|---|---|
| `test_types`, `test_reports` | material test reports (cube strength, soil compaction…) with approve/reject workflow |
| `inspection_types` (checklist templates), `inspections`, `inspection_items` | checklist items with pass / fail / na / pending, GPS + photos |

### Issues
| Table | Purpose |
|---|---|
| `issue_categories`, `issues`, `issue_comments` | snags with priority, assignment, due dates, status workflow, discussion, `client_ref` for offline |

### Workforce
| Table | Purpose |
|---|---|
| `worker_categories`, `contractors`, `labour_rates`, `workers` | masters (daily wage, OT rate) |
| `attendance` | per worker/day/shift: status, check-in/out, overtime hours, **auto-computed daily + OT amounts**, payment status |
| `labour_payments` | week/month wage settlements generated from attendance (net = earned − deductions, paid tracking) |

### Cross-cutting
| Table | Purpose |
|---|---|
| `project_documents` | site documents with expiry tracking (insurance, permits…) |
| `notifications`, `notification_settings` | in-app notification inbox + per-event enable/push toggles |
| `audit_logs` | **every mutation**: user, action, module, record id, old/new JSON, IP |

## 4. What the seeder creates

- **21 permission modules × actions** and the 12 roles above with sensible matrices.
- Super admin + 11 demo users (see README table), incl. wing-scoped engineers.
- 2 demo projects (high-rise "Sunrise Heights" with 3 wings × 12 floors × units; "Tech Park Phase 2").
- Materials (cement, TMT steel, aggregates…), suppliers, worker categories, labour rates, 12 workers, 5 days of attendance.
- Sample daily progress w/ milestones, requirement → PO → GRN → consumption → return chain (with stock transactions), cost entries, a priced BOQ, test reports, an inspection with checklist, an issue with comment, 2 unit sales with payments, notification settings.

## 5. Backups

```bash
mysqldump -u root -p --single-transaction --routines construction_erp > backup-$(date +%F).sql
```

Schedule it nightly (cron) in production and back up `backend/uploads/` alongside — see
[DEPLOYMENT.md](DEPLOYMENT.md#backups).
