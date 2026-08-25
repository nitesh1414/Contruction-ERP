import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';
import { notify, isEventEnabled } from '../../utils/notify.js';

const SELECT = `SELECT s.*, p.name AS project_name, w.name AS wing_name, f.name AS floor_name,
  un.unit_number, un.unit_type, un.carpet_area, un.saleable_area, u.name AS sold_by_name
  FROM sales s
  JOIN projects p ON p.id = s.project_id
  JOIN wings w ON w.id = s.wing_id
  LEFT JOIN floors f ON f.id = s.floor_id
  JOIN units un ON un.id = s.unit_id
  LEFT JOIN users u ON u.id = s.sold_by`;

function paymentStatus(saleAmount, amountReceived) {
  const total = Number(saleAmount) || 0;
  const received = Number(amountReceived) || 0;
  if (received <= 0) return 'pending';
  if (received >= total) return 'paid';
  return 'partially_paid';
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('s.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('s.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.floorId) { conditions.push('s.floor_id = ?'); params.push(req.query.floorId); }
  if (req.query.payment_status) { conditions.push('s.payment_status = ?'); params.push(req.query.payment_status); }
  if (req.query.status) { conditions.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.is_gst !== undefined && req.query.is_gst !== '') { conditions.push('s.is_gst = ?'); params.push(req.query.is_gst); }
  if (req.query.search) {
    conditions.push('(s.customer_name LIKE ? OR s.customer_phone LIKE ? OR un.unit_number LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 's.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(`${SELECT} ${whereSql} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM sales s JOIN units un ON un.id = s.unit_id ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const sale = await queryOne(`${SELECT} WHERE s.id = ?`, [req.params.id]);
  if (!sale) throw notFound('Sale not found');
  const payments = await query(
    `SELECT sp.*, u.name AS received_by_name FROM sales_payments sp LEFT JOIN users u ON u.id = sp.received_by WHERE sp.sale_id = ? ORDER BY sp.payment_date DESC, sp.id DESC`, [sale.id]);
  res.json({ success: true, data: { ...sale, payments } });
});

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.unit_id || !b.customer_name || !b.sale_amount) throw badRequest('unit_id, customer_name and sale_amount are required');
  const unit = await queryOne('SELECT * FROM units WHERE id = ?', [b.unit_id]);
  if (!unit) throw badRequest('Unit not found');
  assertProjectAccess(req, unit.project_id, unit.wing_id);
  if (unit.status === 'sold') throw badRequest('This unit is already sold');

  const gstAmount = b.is_gst ? +(((Number(b.sale_amount) || 0) * (Number(b.gst_percent) || 5)) / 100).toFixed(2) : 0;
  const totalWithGst = (Number(b.sale_amount) || 0) + gstAmount + (Number(b.other_charges) || 0);
  const received = Number(b.amount_received) || 0;
  const status = paymentStatus(totalWithGst, received);

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO sales (project_id, wing_id, floor_id, unit_id, customer_name, customer_phone, customer_email, booking_date, sale_date, sale_amount, amount_received, payment_status, is_gst, gst_amount, other_charges, status, sold_by, remarks)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [unit.project_id, unit.wing_id, b.floor_id || unit.floor_id, unit.id, b.customer_name, nullify(b.customer_phone),
      nullify(b.customer_email), nullify(b.booking_date), nullify(b.sale_date), totalWithGst, received, status,
      b.is_gst ? 1 : 0, gstAmount, Number(b.other_charges) || 0, b.status || 'booked', req.user.id, nullify(b.remarks)]
    );
    await conn.query('UPDATE units SET status = ? WHERE id = ?', [(b.status || 'booked') === 'sold' ? 'sold' : 'booked', unit.id]);
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'sales', recordId: id, newValue: { customer: b.customer_name, amount: totalWithGst } });
  res.status(201).json({ success: true, data: await queryOne(`${SELECT} WHERE s.id = ?`, [id]) });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM sales WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Sale not found');
  const allowed = ['customer_name', 'customer_phone', 'customer_email', 'booking_date', 'sale_date', 'sale_amount', 'is_gst', 'gst_amount', 'other_charges', 'status', 'remarks'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = req.body[f];
  if (data.is_gst !== undefined || data.sale_amount !== undefined) {
    const isGst = data.is_gst !== undefined ? (data.is_gst ? 1 : 0) : existing.is_gst;
    const amount = data.sale_amount !== undefined ? Number(data.sale_amount) : Number(existing.sale_amount);
    data.is_gst = isGst;
    if (isGst && data.gst_amount === undefined) data.gst_amount = +(amount * 0.05).toFixed(2);
    data.payment_status = paymentStatus(amount, existing.amount_received);
  }
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE sales SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  if (data.status === 'cancelled') {
    await query('UPDATE units SET status = "available" WHERE id = ?', [existing.unit_id]);
    await query('UPDATE sales SET status = "cancelled" WHERE id = ?', [req.params.id]);
  } else if (data.status === 'sold') {
    await query('UPDATE units SET status = "sold" WHERE id = ?', [existing.unit_id]);
  }
  await audit(req, { action: 'update', module: 'sales', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne(`${SELECT} WHERE s.id = ?`, [req.params.id]) });
});

export const addPayment = asyncHandler(async (req, res) => {
  const { payment_date, amount, payment_mode, is_gst, reference_number, remarks } = req.body;
  if (!payment_date || !amount) throw badRequest('payment_date and amount are required');
  const sale = await queryOne('SELECT * FROM sales WHERE id = ?', [req.params.id]);
  if (!sale) throw notFound('Sale not found');
  assertProjectAccess(req, sale.project_id, sale.wing_id);

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO sales_payments (sale_id, payment_date, amount, payment_mode, is_gst, reference_number, remarks, received_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [sale.id, payment_date, amount, payment_mode || 'bank_transfer', is_gst ? 1 : 0, nullify(reference_number), nullify(remarks), req.user.id]
    );
    const newReceived = Number(sale.amount_received) + Number(amount);
    await conn.query('UPDATE sales SET amount_received = ?, payment_status = ? WHERE id = ?',
      [newReceived, paymentStatus(sale.sale_amount, newReceived), sale.id]);
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'sales', recordId: sale.id, newValue: { amount, payment_date } });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM sales_payments WHERE id = ?', [id]) });
});

export const summary = asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  const scope = projectScopeSql(req, 's.project_id');
  const conditions = [];
  const params = [];
  if (projectId) { conditions.push('s.project_id = ?'); params.push(projectId); }
  const wingWise = await query(
    `SELECT s.wing_id, w.name AS wing_name,
            COUNT(*) AS units_sold,
            SUM(s.sale_amount) AS sales_value,
            SUM(s.amount_received) AS amount_received,
            SUM(s.pending_amount) AS pending_amount,
            SUM(s.gst_amount) AS gst_collected
       FROM sales s JOIN wings w ON w.id = s.wing_id
      WHERE s.status != 'cancelled' ${conditions.length ? ' AND ' + conditions.join(' AND ') : ''} ${scope.clause}
      GROUP BY s.wing_id, w.name ORDER BY w.name`, [...params, ...scope.params]);
  const totals = await queryOne(
    `SELECT COUNT(*) AS units_sold, COALESCE(SUM(s.sale_amount),0) AS sales_value,
            COALESCE(SUM(s.amount_received),0) AS amount_received, COALESCE(SUM(s.pending_amount),0) AS pending_amount
       FROM sales s WHERE s.status != 'cancelled' ${conditions.length ? ' AND ' + conditions.join(' AND ') : ''} ${scope.clause}`,
    [...params, ...scope.params]);
  res.json({ success: true, data: { totals, wingWise } });
});

export const unitAvailability = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'u.project_id');
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('u.project_id = ?'); params.push(req.query.projectId); }
  const rows = await query(
    `SELECT u.wing_id, w.name AS wing_name, u.status, COUNT(*) AS count
       FROM units u JOIN wings w ON w.id = u.wing_id
      WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
      GROUP BY u.wing_id, u.status, w.name ORDER BY w.name, u.status`, [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

export const exportSales = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 's.project_id');
  const rows = await query(
    `SELECT p.name AS project, w.name AS wing, f.name AS floor, un.unit_number, un.unit_type,
            s.customer_name, s.customer_phone, s.sale_date, s.sale_amount, s.amount_received, s.pending_amount,
            s.payment_status, s.is_gst, s.gst_amount, s.other_charges, s.status
       FROM sales s
       JOIN projects p ON p.id = s.project_id JOIN wings w ON w.id = s.wing_id
       LEFT JOIN floors f ON f.id = s.floor_id JOIN units un ON un.id = s.unit_id
      WHERE 1=1 ${scope.clause} ORDER BY p.name, w.name, un.unit_number LIMIT 10000`, scope.params);
  await audit(req, { action: 'export', module: 'sales' });
  sendCsv(res, 'sales.csv', rows);
});

export async function notifyPendingCollections() {
  if (!(await isEventEnabled('sales_payment_due'))) return;
  const rows = await query(
    `SELECT s.id, s.customer_name, s.pending_amount, s.sold_by FROM sales s
      WHERE s.payment_status IN ('pending','partially_paid') AND s.status != 'cancelled'
        AND s.sale_date <= CURDATE() - INTERVAL 15 DAY AND s.sold_by IS NOT NULL LIMIT 200`);
  for (const r of rows) {
    await notify(r.sold_by, {
      title: 'Pending collection',
      message: `₹${Number(r.pending_amount).toLocaleString('en-IN')} pending from ${r.customer_name}.`,
      type: 'warning', module: 'sales', recordId: r.id,
    });
  }
}
