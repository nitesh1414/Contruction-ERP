import { query, queryOne } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';

// --------------------------- Cost entries ---------------------------------

export const listCostEntries = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('ce.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('ce.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.entry_type) { conditions.push('ce.entry_type = ?'); params.push(req.query.entry_type); }
  if (req.query.category) { conditions.push('ce.category = ?'); params.push(req.query.category); }
  if (req.query.payment_status) { conditions.push('ce.payment_status = ?'); params.push(req.query.payment_status); }
  if (req.query.from) { conditions.push('ce.entry_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('ce.entry_date <= ?'); params.push(req.query.to); }
  if (req.query.search) { conditions.push('(ce.description LIKE ? OR ce.bill_number LIKE ? OR ce.category LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'ce.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT ce.*, p.name AS project_name, w.name AS wing_name, s.name AS supplier_name, m.name AS material_name
       FROM cost_entries ce
       JOIN projects p ON p.id = ce.project_id
       LEFT JOIN wings w ON w.id = ce.wing_id
       LEFT JOIN suppliers s ON s.id = ce.supplier_id
       LEFT JOIN materials m ON m.id = ce.material_id
     ${whereSql} ORDER BY ce.entry_date DESC, ce.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM cost_entries ce ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

function computeCostAmounts({ quantity, rate, tax_percent, paid_amount }) {
  const qty = Number(quantity) || 0;
  const r = Number(rate) || 0;
  const taxPct = Number(tax_percent) || 0;
  const line = qty * r;
  const taxAmount = +(line * (taxPct / 100)).toFixed(2);
  const total = +(line + taxAmount).toFixed(2);
  const paid = +(Number(paid_amount) || 0).toFixed(2);
  const status = paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';
  return { tax_amount: taxAmount, total_amount: total, paid_amount: paid, payment_status: status };
}

const COST_FIELDS = ['project_id', 'wing_id', 'entry_type', 'category', 'description', 'material_id', 'supplier_id', 'bill_number', 'bill_date', 'entry_date'];

export const createCostEntry = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.project_id || !b.entry_type || !b.entry_date) throw badRequest('project_id, entry_type and entry_date are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);
  const amounts = computeCostAmounts(b);
  const data = {};
  for (const f of COST_FIELDS) data[f] = nullify(b[f]);
  const keys = Object.keys(data);
  const r = await query(
    `INSERT INTO cost_entries (${keys.join(',')}, quantity, unit, rate, tax_percent, tax_amount, total_amount, paid_amount, payment_status, remarks, created_by, file_id)
     VALUES (${keys.map(() => '?').join(',')},?,?,?,?,?,?,?,?,?,?,?)`,
    [...keys.map((k) => data[k]), Number(b.quantity) || 0, nullify(b.unit), Number(b.rate) || 0, Number(b.tax_percent) || 0,
    amounts.tax_amount, amounts.total_amount, amounts.paid_amount, amounts.payment_status, nullify(b.remarks), req.user.id, nullify(b.file_id)]
  );
  await audit(req, { action: 'create', module: 'billing', recordId: r.insertId, newValue: { ...data, ...amounts } });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM cost_entries WHERE id = ?', [r.insertId]) });
});

export const updateCostEntry = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM cost_entries WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Cost entry not found');
  const merged = { ...existing, ...req.body };
  const amounts = computeCostAmounts(merged);
  const allowed = [...COST_FIELDS.filter((f) => f !== 'project_id'), 'quantity', 'unit', 'rate', 'tax_percent', 'remarks', 'file_id'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (req.body.paid_amount !== undefined) data.paid_amount = amounts.paid_amount;
  data.tax_amount = amounts.tax_amount;
  data.total_amount = amounts.total_amount;
  data.payment_status = amounts.payment_status;
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE cost_entries SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'billing', recordId: req.params.id, oldValue: existing, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM cost_entries WHERE id = ?', [req.params.id]) });
});

export const deleteCostEntry = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM cost_entries WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Cost entry not found');
  await query('DELETE FROM cost_entries WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'billing', recordId: req.params.id });
  res.json({ success: true, message: 'Deleted' });
});

/** Project / wing cost vs budget summary. */
export const costSummary = asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  const scope = projectScopeSql(req, 'ce.project_id');
  const conditions = [];
  const params = [];
  if (projectId) { conditions.push('ce.project_id = ?'); params.push(projectId); }
  const rows = await query(
    `SELECT ce.project_id, p.name AS project_name, p.budget,
            SUM(ce.total_amount) AS total_cost, SUM(ce.paid_amount) AS total_paid, SUM(ce.pending_amount) AS total_pending,
            SUM(CASE WHEN ce.entry_type = 'consumable' THEN ce.total_amount ELSE 0 END) AS consumable_cost,
            SUM(CASE WHEN ce.entry_type = 'non_consumable' THEN ce.total_amount ELSE 0 END) AS non_consumable_cost,
            SUM(CASE WHEN ce.entry_type = 'labour' THEN ce.total_amount ELSE 0 END) AS labour_cost,
            SUM(CASE WHEN ce.entry_type = 'other' THEN ce.total_amount ELSE 0 END) AS other_cost
       FROM cost_entries ce JOIN projects p ON p.id = ce.project_id
      WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
      GROUP BY ce.project_id, p.name, p.budget ORDER BY total_cost DESC`, [...params, ...scope.params]);
  const withVariance = rows.map((r) => ({
    ...r,
    budget_variance: +(Number(r.budget) - Number(r.total_cost)).toFixed(2),
    budget_used_percent: r.budget > 0 ? +((Number(r.total_cost) / Number(r.budget)) * 100).toFixed(2) : null,
  }));
  res.json({ success: true, data: withVariance });
});

export const costSummaryByWing = asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) throw badRequest('projectId required');
  const rows = await query(
    `SELECT ce.wing_id, w.name AS wing_name, SUM(ce.total_amount) AS total_cost, SUM(ce.paid_amount) AS total_paid, SUM(ce.pending_amount) AS total_pending
       FROM cost_entries ce LEFT JOIN wings w ON w.id = ce.wing_id
      WHERE ce.project_id = ? GROUP BY ce.wing_id, w.name`, [projectId]);
  res.json({ success: true, data: rows });
});

export const exportCostEntries = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'ce.project_id');
  const rows = await query(
    `SELECT ce.entry_date, p.name AS project, w.name AS wing, ce.entry_type, ce.category, ce.description, ce.bill_number,
            ce.quantity, ce.unit, ce.rate, ce.tax_percent, ce.tax_amount, ce.total_amount, ce.paid_amount, ce.pending_amount, ce.payment_status
       FROM cost_entries ce JOIN projects p ON p.id = ce.project_id LEFT JOIN wings w ON w.id = ce.wing_id
      WHERE 1=1 ${scope.clause} ORDER BY ce.entry_date DESC LIMIT 10000`, scope.params);
  await audit(req, { action: 'export', module: 'billing' });
  sendCsv(res, 'cost-entries.csv', rows);
});
