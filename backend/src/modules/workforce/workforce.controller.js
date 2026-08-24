import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';
import { CrudController } from '../../utils/crud.js';

export const workerCategories = new CrudController({
  table: 'worker_categories', module: 'workers',
  fields: ['name', 'description', 'base_daily_rate', 'is_active'],
  searchColumns: ['name'], defaultSort: 'name ASC',
});

export const contractors = new CrudController({
  table: 'contractors', module: 'workers',
  fields: ['name', 'contact_person', 'phone', 'email', 'gst_number', 'address', 'is_active'],
  searchColumns: ['name', 'contact_person', 'phone'], defaultSort: 'name ASC',
});

export const labourRates = new CrudController({
  table: 'labour_rates', module: 'workers',
  fields: ['worker_category_id', 'contractor_id', 'daily_rate', 'overtime_rate', 'effective_date', 'remarks'],
  searchColumns: [],
  listSql: `SELECT lr.*, wc.name AS category_name, c.name AS contractor_name FROM labour_rates lr
              LEFT JOIN worker_categories wc ON wc.id = lr.worker_category_id
              LEFT JOIN contractors c ON c.id = lr.contractor_id`,
  countSql: 'SELECT COUNT(*) AS total FROM labour_rates lr',
  filters: [{ key: 'workerCategoryId', column: 'lr.worker_category_id' }, { key: 'contractorId', column: 'lr.contractor_id' }],
  sortableColumns: ['lr.id', 'lr.effective_date'],
  defaultSort: 'lr.effective_date DESC, lr.id DESC',
});

// ------------------------------- Workers -----------------------------------

export const listWorkers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('w.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('w.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.categoryId) { conditions.push('w.category_id = ?'); params.push(req.query.categoryId); }
  if (req.query.contractorId) { conditions.push('w.contractor_id = ?'); params.push(req.query.contractorId); }
  if (req.query.is_active !== undefined && req.query.is_active !== '') { conditions.push('w.is_active = ?'); params.push(req.query.is_active); }
  if (req.query.search) {
    conditions.push('(w.name LIKE ? OR w.worker_code LIKE ? OR w.phone LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'w.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT w.*, wc.name AS category_name, c.name AS contractor_name, p.name AS project_name, wi.name AS wing_name
       FROM workers w
       LEFT JOIN worker_categories wc ON wc.id = w.category_id
       LEFT JOIN contractors c ON c.id = w.contractor_id
       LEFT JOIN projects p ON p.id = w.project_id
       LEFT JOIN wings wi ON wi.id = w.wing_id
     ${whereSql} ORDER BY w.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM workers w ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

const WORKER_FIELDS = ['worker_code', 'name', 'phone', 'category_id', 'contractor_id', 'daily_wage', 'overtime_rate', 'project_id', 'wing_id', 'joining_date', 'id_proof', 'is_active'];

export const createWorker = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of WORKER_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.name) throw badRequest('name is required');
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);
  if (!data.worker_code) data.worker_code = `WK-${Date.now().toString(36).toUpperCase()}`;
  const keys = Object.keys(data);
  const r = await query(`INSERT INTO workers (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'workers', recordId: r.insertId, newValue: data });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM workers WHERE id = ?', [r.insertId]) });
});

export const updateWorker = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM workers WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Worker not found');
  const data = {};
  for (const f of WORKER_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE workers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'workers', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM workers WHERE id = ?', [req.params.id]) });
});

export const deleteWorker = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM workers WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Worker not found');
  await query('DELETE FROM workers WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'workers', recordId: req.params.id });
  res.json({ success: true, message: 'Worker deleted' });
});

// ------------------------------- Attendance --------------------------------

export const listAttendance = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('a.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('a.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.workerId) { conditions.push('a.worker_id = ?'); params.push(req.query.workerId); }
  if (req.query.date) { conditions.push('a.attendance_date = ?'); params.push(req.query.date); }
  if (req.query.from) { conditions.push('a.attendance_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('a.attendance_date <= ?'); params.push(req.query.to); }
  if (req.query.status) { conditions.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.payment_status) { conditions.push('a.payment_status = ?'); params.push(req.query.payment_status); }
  const scope = projectScopeSql(req, 'a.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT a.*, wk.name AS worker_name, wk.worker_code, wc.name AS category_name, c.name AS contractor_name, p.name AS project_name, w.name AS wing_name
       FROM attendance a
       JOIN workers wk ON wk.id = a.worker_id
       LEFT JOIN worker_categories wc ON wc.id = wk.category_id
       LEFT JOIN contractors c ON c.id = wk.contractor_id
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN wings w ON w.id = a.wing_id
     ${whereSql} ORDER BY a.attendance_date DESC, wk.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM attendance a JOIN workers wk ON wk.id = a.worker_id ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

function attendanceAmounts(worker, status, overtimeHours) {
  const daily = Number(worker.daily_wage) || 0;
  const otRate = Number(worker.overtime_rate) || 0;
  const ot = Number(overtimeHours) || 0;
  let dailyAmount = 0;
  if (status === 'present' || status === 'overtime') dailyAmount = daily;
  else if (status === 'half_day') dailyAmount = daily / 2;
  const overtimeAmount = +(ot * otRate).toFixed(2);
  return { daily_amount: +dailyAmount.toFixed(2), overtime_amount: overtimeAmount };
}

/** Bulk attendance entry: { project_id, wing_id?, date, shift, records: [{worker_id, status, check_in?, check_out?, overtime_hours?, remarks?}] } */
export const markAttendance = asyncHandler(async (req, res) => {
  const { project_id, wing_id, date, shift = 'day', records = [] } = req.body;
  if (!project_id || !date || !Array.isArray(records) || !records.length) {
    throw badRequest('project_id, date and records[] are required');
  }
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);

  const workerIds = records.map((r) => r.worker_id);
  const workers = await query(`SELECT id, daily_wage, overtime_rate FROM workers WHERE id IN (${workerIds.map(() => '?').join(',')})`, workerIds);
  const workerMap = new Map(workers.map((w) => [Number(w.id), w]));

  let created = 0; let updated = 0;
  await withTransaction(async (conn) => {
    for (const rec of records) {
      const worker = workerMap.get(Number(rec.worker_id));
      if (!worker) continue;
      const status = ['present', 'absent', 'leave', 'half_day', 'overtime'].includes(rec.status) ? rec.status : 'present';
      const amounts = attendanceAmounts(worker, status, rec.overtime_hours);
      const [existing] = await conn.query(
        'SELECT id FROM attendance WHERE worker_id = ? AND attendance_date = ? AND shift = ?', [rec.worker_id, date, shift]);
      if (existing.length) {
        await conn.query(
          `UPDATE attendance SET status = ?, check_in = ?, check_out = ?, overtime_hours = ?, daily_amount = ?, overtime_amount = ?, remarks = ?, wing_id = ?, marked_by = ? WHERE id = ?`,
          [status, nullify(rec.check_in), nullify(rec.check_out), Number(rec.overtime_hours) || 0, amounts.daily_amount,
          amounts.overtime_amount, nullify(rec.remarks), nullify(wing_id), req.user.id, existing[0].id]
        );
        updated += 1;
      } else {
        await conn.query(
          `INSERT INTO attendance (worker_id, project_id, wing_id, attendance_date, shift, check_in, check_out, status, overtime_hours, daily_amount, overtime_amount, remarks, marked_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [rec.worker_id, project_id, nullify(wing_id), date, shift, nullify(rec.check_in), nullify(rec.check_out), status,
          Number(rec.overtime_hours) || 0, amounts.daily_amount, amounts.overtime_amount, nullify(rec.remarks), req.user.id]
        );
        created += 1;
      }
    }
  });
  await audit(req, { action: 'create', module: 'attendance', newValue: { date, created, updated } });
  res.json({ success: true, message: `Attendance saved (${created} created, ${updated} updated)` });
});

export const updateAttendance = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM attendance WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Attendance record not found');
  const allowed = ['status', 'check_in', 'check_out', 'overtime_hours', 'remarks', 'payment_status', 'wing_id', 'shift'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE attendance SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'attendance', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM attendance WHERE id = ?', [req.params.id]) });
});

export const attendanceSummary = asyncHandler(async (req, res) => {
  const { projectId, date } = req.query;
  if (!projectId) throw badRequest('projectId required');
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const rows = await query(
    `SELECT a.status, COUNT(*) AS count FROM attendance a WHERE a.project_id = ? AND a.attendance_date = ? GROUP BY a.status`,
    [projectId, targetDate]);
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  res.json({ success: true, data: { date: targetDate, total, byStatus: rows } });
});

/** Monthly worker-wise attendance & wage report. */
export const monthlyReport = asyncHandler(async (req, res) => {
  const { projectId, month } = req.query; // month = YYYY-MM
  if (!projectId || !month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('projectId and month (YYYY-MM) required');
  const scope = projectScopeSql(req, 'a.project_id');
  const rows = await query(
    `SELECT a.worker_id, wk.name AS worker_name, wk.worker_code, wc.name AS category_name, c.name AS contractor_name,
            SUM(CASE WHEN a.status IN ('present','overtime') THEN 1 WHEN a.status = 'half_day' THEN 0.5 ELSE 0 END) AS days_worked,
            SUM(a.overtime_hours) AS overtime_hours,
            SUM(a.daily_amount + a.overtime_amount) AS total_amount,
            SUM(CASE WHEN a.payment_status = 'paid' THEN a.daily_amount + a.overtime_amount ELSE 0 END) AS paid_amount,
            SUM(CASE WHEN a.payment_status = 'pending' THEN a.daily_amount + a.overtime_amount ELSE 0 END) AS pending_amount
       FROM attendance a
       JOIN workers wk ON wk.id = a.worker_id
       LEFT JOIN worker_categories wc ON wc.id = wk.category_id
       LEFT JOIN contractors c ON c.id = wk.contractor_id
      WHERE a.project_id = ? AND DATE_FORMAT(a.attendance_date, '%Y-%m') = ? ${scope.clause}
      GROUP BY a.worker_id, wk.name, wk.worker_code, wc.name, c.name
      ORDER BY wk.name`, [projectId, month, ...scope.params]);
  res.json({ success: true, data: rows });
});

export const exportAttendance = asyncHandler(async (req, res) => {
  const { projectId, from, to } = req.query;
  const conditions = [];
  const params = [];
  if (projectId) { conditions.push('a.project_id = ?'); params.push(projectId); }
  if (from) { conditions.push('a.attendance_date >= ?'); params.push(from); }
  if (to) { conditions.push('a.attendance_date <= ?'); params.push(to); }
  const scope = projectScopeSql(req, 'a.project_id');
  const rows = await query(
    `SELECT a.attendance_date, wk.worker_code, wk.name AS worker_name, wc.name AS category, c.name AS contractor,
            a.shift, a.status, a.check_in, a.check_out, a.overtime_hours, a.daily_amount, a.overtime_amount, a.payment_status
       FROM attendance a
       JOIN workers wk ON wk.id = a.worker_id
       LEFT JOIN worker_categories wc ON wc.id = wk.category_id
       LEFT JOIN contractors c ON c.id = wk.contractor_id
      WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
      ORDER BY a.attendance_date DESC, wk.name LIMIT 20000`, [...params, ...scope.params]);
  await audit(req, { action: 'export', module: 'attendance' });
  sendCsv(res, 'attendance.csv', rows);
});

// ------------------------------- Labour payments ---------------------------

export const listLabourPayments = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'lp.project_id');
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('lp.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.status) { conditions.push('lp.status = ?'); params.push(req.query.status); }
  if (req.query.workerId) { conditions.push('lp.worker_id = ?'); params.push(req.query.workerId); }
  const rows = await query(
    `SELECT lp.*, wk.name AS worker_name, wk.worker_code, p.name AS project_name
       FROM labour_payments lp JOIN workers wk ON wk.id = lp.worker_id JOIN projects p ON p.id = lp.project_id
      WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
      ORDER BY lp.id DESC LIMIT 1000`, [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

/** Create a payment from attendance totals for a period. */
export const createLabourPayment = asyncHandler(async (req, res) => {
  const { worker_id, project_id, period_start, period_end, deductions = 0, paid_amount = 0, payment_date, payment_mode, remarks } = req.body;
  if (!worker_id || !project_id || !period_start || !period_end) throw badRequest('worker_id, project_id, period_start, period_end are required');
  assertProjectAccess(req, Number(project_id));

  const totals = await queryOne(
    `SELECT SUM(CASE WHEN status IN ('present','overtime') THEN 1 WHEN status = 'half_day' THEN 0.5 ELSE 0 END) AS days,
            SUM(overtime_hours) AS ot, SUM(daily_amount + overtime_amount) AS gross
       FROM attendance WHERE worker_id = ? AND project_id = ? AND attendance_date BETWEEN ? AND ?`,
    [worker_id, project_id, period_start, period_end]);
  const gross = Number(totals?.gross) || 0;
  const net = +(gross - (Number(deductions) || 0)).toFixed(2);
  const paid = Math.min(Number(paid_amount) || 0, net);
  const status = paid <= 0 ? 'pending' : paid >= net ? 'paid' : 'partial';

  const r = await query(
    `INSERT INTO labour_payments (worker_id, project_id, period_start, period_end, total_days, total_overtime_hours, gross_amount, deductions, net_amount, paid_amount, payment_date, payment_mode, status, remarks, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [worker_id, project_id, period_start, period_end, Number(totals?.days) || 0, Number(totals?.ot) || 0, +gross.toFixed(2),
    Number(deductions) || 0, net, +paid.toFixed(2), nullify(payment_date), nullify(payment_mode), status, nullify(remarks), req.user.id]
  );
  if (status === 'paid' || status === 'partial') {
    await query(
      `UPDATE attendance SET payment_status = 'paid'
        WHERE worker_id = ? AND project_id = ? AND attendance_date BETWEEN ? AND ?`,
      [worker_id, project_id, period_start, period_end]);
  }
  await audit(req, { action: 'create', module: 'labour_payments', recordId: r.insertId, newValue: req.body });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM labour_payments WHERE id = ?', [r.insertId]) });
});

export const updateLabourPayment = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM labour_payments WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Payment not found');
  const allowed = ['paid_amount', 'payment_date', 'payment_mode', 'remarks'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (data.paid_amount !== undefined) {
    const paid = Number(data.paid_amount) || 0;
    data.status = paid <= 0 ? 'pending' : paid >= Number(existing.net_amount) ? 'paid' : 'partial';
  }
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE labour_payments SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'labour_payments', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM labour_payments WHERE id = ?', [req.params.id]) });
});
