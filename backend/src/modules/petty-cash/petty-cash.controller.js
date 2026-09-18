import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, isValidDate,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';

const CATEGORIES = [
  { v: 'travel',           l: 'Travel / local conveyance' },
  { v: 'food_catering',    l: 'Food / tea / refreshments' },
  { v: 'fuel',             l: 'Fuel & lubricants' },
  { v: 'labour_incentive', l: 'Labour incentives / advances' },
  { v: 'tools',            l: 'Tools & small consumables' },
  { v: 'office_admin',     l: 'Office & admin' },
  { v: 'misc',             l: 'Misc / others' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

/* ------------- Petty cash summary for a project ------------- */
export const projectSummary = asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  const projectNumber = Number(projectId);
  if (!Number.isInteger(projectNumber) || projectNumber < 1) throw badRequest('projectId required');
  assertProjectAccess(req, projectNumber);
  const totals = await queryOne(
    `SELECT
        COALESCE(SUM(CASE WHEN txn_type = 'topup'   THEN amount ELSE 0 END),0) AS total_topup,
        COALESCE(SUM(CASE WHEN txn_type = 'expense' THEN amount ELSE 0 END),0) AS total_expense,
        COALESCE(SUM(CASE WHEN txn_type = 'replenish' THEN amount ELSE 0 END),0) AS total_replenish,
        COUNT(*) AS total_entries
       FROM petty_cash_entries
      WHERE project_id = ?`, [projectNumber]);
  const byCategory = await query(
    `SELECT category, SUM(amount) AS amount, COUNT(*) AS count
       FROM petty_cash_entries
      WHERE project_id = ? AND txn_type = 'expense'
      GROUP BY category ORDER BY amount DESC`, [projectNumber]);
  const recent = await query(
    `SELECT * FROM petty_cash_entries WHERE project_id = ?
      ORDER BY txn_date DESC, id DESC LIMIT 20`, [projectNumber]);
  res.json({
    success: true,
    data: {
      ...totals,
      balance: Number(totals.total_topup) + Number(totals.total_replenish) - Number(totals.total_expense),
      byCategory,
      recent,
      categoryLabels: CATEGORY_LABEL,
    },
  });
});

/* ------------- List expense entries (filterable) ------------- */
export const listEntries = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('pce.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.txn_type) { conditions.push('pce.txn_type = ?'); params.push(req.query.txn_type); }
  if (req.query.category) { conditions.push('pce.category = ?'); params.push(req.query.category); }
  if (req.query.from) { conditions.push('pce.txn_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('pce.txn_date <= ?'); params.push(req.query.to); }
  if (req.query.search) {
    conditions.push('(pce.description LIKE ? OR pce.paid_to LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'pce.project_id', 'pce.wing_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT pce.*, p.name AS project_name, u.name AS created_by_name, pv.file_path AS receipt_url
       FROM petty_cash_entries pce
       LEFT JOIN projects p ON p.id = pce.project_id
       LEFT JOIN users u ON u.id = pce.created_by
       LEFT JOIN file_uploads pv ON pv.id = pce.receipt_file_id
     ${whereSql} ORDER BY pce.txn_date DESC, pce.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  const count = await queryOne(
    `SELECT COUNT(*) AS total FROM petty_cash_entries pce ${whereSql}`, params);
  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) },
    categoryLabels: CATEGORY_LABEL,
  });
});

/* ------------- CSV export ------------- */
export const exportEntries = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('pce.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.txn_type) { conditions.push('pce.txn_type = ?'); params.push(req.query.txn_type); }
  if (req.query.category) { conditions.push('pce.category = ?'); params.push(req.query.category); }
  if (req.query.from) { conditions.push('pce.txn_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('pce.txn_date <= ?'); params.push(req.query.to); }
  if (req.query.search) {
    conditions.push('(pce.description LIKE ? OR pce.paid_to LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'pce.project_id', 'pce.wing_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT pce.txn_date, pce.txn_type, pce.category, pce.amount, pce.description,
            pce.paid_to, pce.received_by, pce.remarks, p.name AS project_name,
            u.name AS created_by_name
       FROM petty_cash_entries pce
       LEFT JOIN projects p ON p.id = pce.project_id
       LEFT JOIN users u ON u.id = pce.created_by
     ${whereSql} ORDER BY pce.txn_date DESC, pce.id DESC`, params);
  await audit(req, { action: 'export', module: 'petty_cash' });
  sendCsv(res, 'petty-cash.csv', rows);
});

/* ------------- Create / top up / expense ------------- */
export const createEntry = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.project_id || !body.txn_type || body.amount === undefined || body.amount === null || !body.txn_date) {
    throw badRequest('project_id, txn_type, amount, txn_date are required');
  }
  const projectNumber = Number(body.project_id);
  if (!Number.isInteger(projectNumber) || projectNumber < 1) throw badRequest('project_id must be a positive integer');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('amount must be greater than zero');
  if (!isValidDate(body.txn_date)) throw badRequest('txn_date must be a valid YYYY-MM-DD date');
  assertProjectAccess(req, projectNumber);
  if (!['topup', 'expense', 'replenish'].includes(body.txn_type)) {
    throw badRequest('txn_type must be topup, expense or replenish');
  }
  if (body.txn_type === 'expense' && !body.paid_to) {
    throw badRequest('paid_to is required for expense entries');
  }
  const data = {
    project_id: projectNumber,
    wing_id:    nullify(body.wing_id),
    txn_type:   body.txn_type,
    category:   nullify(body.category),
    amount:     +amount.toFixed(2),
    txn_date:   body.txn_date,
    description: nullify(body.description),
    paid_to:    nullify(body.paid_to),
    received_by: nullify(body.received_by),
    receipt_file_id: nullify(body.receipt_file_id),
    remarks:    nullify(body.remarks),
    created_by: req.user.id,
  };
  const r = await query(
    `INSERT INTO petty_cash_entries
       (project_id, wing_id, txn_type, category, amount, txn_date, description,
        paid_to, received_by, receipt_file_id, remarks, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    Object.values(data));
  await audit(req, { action: 'create', module: 'petty_cash', recordId: r.insertId, newValue: data });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM petty_cash_entries WHERE id = ?', [r.insertId]) });
});

export const updateEntry = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM petty_cash_entries WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Petty cash entry not found');
  assertProjectAccess(req, Number(existing.project_id), existing.wing_id ? Number(existing.wing_id) : null);
  const allowed = ['txn_type', 'category', 'amount', 'txn_date', 'description', 'paid_to', 'received_by', 'receipt_file_id', 'remarks', 'wing_id'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (data.txn_date !== undefined && !isValidDate(data.txn_date)) throw badRequest('txn_date must be a valid YYYY-MM-DD date');
  if (data.amount !== undefined) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('amount must be greater than zero');
    data.amount = +amount.toFixed(2);
  }
  if (data.txn_type !== undefined && !['topup', 'expense', 'replenish'].includes(data.txn_type)) throw badRequest('txn_type must be topup, expense or replenish');
  if (data.wing_id !== undefined && data.wing_id !== null) assertProjectAccess(req, Number(existing.project_id), Number(data.wing_id));
  const nextType = data.txn_type || existing.txn_type;
  const nextPaidTo = data.paid_to !== undefined ? data.paid_to : existing.paid_to;
  if (nextType === 'expense' && !nextPaidTo) throw badRequest('paid_to is required for expense entries');
  const keys = Object.keys(data);
  if (!keys.length) return res.json({ success: true, data: existing });
  await query(`UPDATE petty_cash_entries SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'petty_cash', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM petty_cash_entries WHERE id = ?', [req.params.id]) });
});

export const deleteEntry = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, project_id, wing_id FROM petty_cash_entries WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Petty cash entry not found');
  assertProjectAccess(req, Number(existing.project_id), existing.wing_id ? Number(existing.wing_id) : null);
  await query('DELETE FROM petty_cash_entries WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'petty_cash', recordId: req.params.id });
  res.json({ success: true, message: 'Petty cash entry deleted' });
});

/* ------------- Top-up — single transaction endpoint called by accounts ------------- */
export const topup = asyncHandler(async (req, res) => {
  req.body = { ...req.body, txn_type: 'topup', category: nullify(req.body.category), paid_to: nullify(req.body.paid_to) };
  return createEntry(req, res);
});
