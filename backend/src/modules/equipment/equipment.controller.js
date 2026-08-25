import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';

/* CRUD list handler for equipment fleet */
export const listEquipment = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('e.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('e.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.status) { conditions.push('e.status = ?'); params.push(req.query.status); }
  if (req.query.equipment_type) { conditions.push('e.equipment_type = ?'); params.push(req.query.equipment_type); }
  if (req.query.ownership) { conditions.push('e.ownership = ?'); params.push(req.query.ownership); }
  if (req.query.is_active !== undefined && req.query.is_active !== '') { conditions.push('e.is_active = ?'); params.push(req.query.is_active); }
  if (req.query.search) {
    conditions.push('(e.name LIKE ? OR e.equipment_code LIKE ? OR e.operator_name LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'e.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT e.*,
            p.name AS project_name,
            w.name AS wing_name,
            COALESCE(SUM(erl.deployed_hours),0)  AS total_deployed_hours,
            COALESCE(SUM(erl.running_hours),0)   AS total_running_hours,
            COALESCE(SUM(erl.idle_hours),0)      AS total_idle_hours,
            COALESCE(SUM(erl.breakdown_hours),0) AS total_breakdown_hours,
            COALESCE(SUM(erl.fuel_quantity),0)   AS total_fuel,
            MAX(erl.log_date)                    AS last_log_date
       FROM equipment e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w ON w.id = e.wing_id
       LEFT JOIN equipment_logs erl ON erl.equipment_id = e.id
     ${whereSql} GROUP BY e.id ORDER BY e.status, e.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM equipment e ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getEquipment = asyncHandler(async (req, res) => {
  const e = await queryOne(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name
       FROM equipment e LEFT JOIN projects p ON p.id=e.project_id LEFT JOIN wings w ON w.id=e.wing_id
      WHERE e.id = ?`, [req.params.id]);
  if (!e) throw notFound('Equipment not found');
  const logs = await query(
    `SELECT * FROM equipment_logs WHERE equipment_id = ? ORDER BY log_date DESC LIMIT 200`,
    [req.params.id]);
  const billing = await query(
    `SELECT * FROM equipment_billing WHERE equipment_id = ? ORDER BY billing_month DESC LIMIT 24`,
    [req.params.id]);
  res.json({ success: true, data: { ...e, logs, billing } });
});

const EQUIPMENT_FIELDS = [
  'equipment_code', 'name', 'equipment_type', 'ownership', 'vendor_id',
  'project_id', 'wing_id', 'hourly_rate', 'daily_rate', 'monthly_rate',
  'capacity', 'registration_no', 'operator_name', 'status', 'deployed_on',
  'remarks', 'is_active',
];

export const createEquipment = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of EQUIPMENT_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.name) throw badRequest('name is required');
  if (!data.equipment_code) data.equipment_code = `EQ-${Date.now().toString(36).toUpperCase()}`;
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);
  data.created_by = req.user.id;
  const keys = Object.keys(data);
  const r = await query(
    `INSERT INTO equipment (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'equipment', recordId: r.insertId, newValue: data });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM equipment WHERE id = ?', [r.insertId]) });
});

export const updateEquipment = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM equipment WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Equipment not found');
  const data = {};
  for (const f of EQUIPMENT_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE equipment SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'equipment', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM equipment WHERE id = ?', [req.params.id]) });
});

export const deleteEquipment = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM equipment WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Equipment not found');
  await query('DELETE FROM equipment WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'equipment', recordId: req.params.id });
  res.json({ success: true, message: 'Equipment deleted' });
});

/* Daily log entries — deployed / running / idle / breakdown hours, fuel etc. */
export const createLog = asyncHandler(async (req, res) => {
  const { equipment_id, project_id, wing_id, log_date, deployed_hours = 0, running_hours = 0,
          idle_hours = 0, breakdown_hours = 0, fuel_quantity = 0, operator_name,
          work_done, status_after, remarks } = req.body;
  if (!equipment_id || !project_id || !log_date) throw badRequest('equipment_id, project_id, log_date are required');
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);
  const eq = await queryOne('SELECT id FROM equipment WHERE id = ?', [equipment_id]);
  if (!eq) throw notFound('Equipment not found');
  const totalDay = Number(deployed_hours) + Number(idle_hours) + Number(breakdown_hours);
  if (totalDay > 24) throw badRequest('Daily hours total cannot exceed 24');
  const r = await query(
    `INSERT INTO equipment_logs (equipment_id, project_id, wing_id, log_date,
       deployed_hours, running_hours, idle_hours, breakdown_hours, fuel_quantity,
       operator_name, work_done, status_after, remarks, marked_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [equipment_id, project_id, nullify(wing_id), log_date,
     Number(deployed_hours) || 0, Number(running_hours) || 0,
     Number(idle_hours) || 0, Number(breakdown_hours) || 0,
     Number(fuel_quantity) || 0,
     nullify(operator_name), nullify(work_done), nullify(status_after) || 'deployed',
     nullify(remarks), req.user.id]);
  if (status_after) {
    await query('UPDATE equipment SET status = ? WHERE id = ?', [status_after, equipment_id]);
  }
  await audit(req, { action: 'create', module: 'equipment_logs', recordId: r.insertId, newValue: req.body });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM equipment_logs WHERE id = ?', [r.insertId]) });
});

export const updateLog = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM equipment_logs WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Log not found');
  const allowed = ['deployed_hours', 'running_hours', 'idle_hours', 'breakdown_hours', 'fuel_quantity',
                   'operator_name', 'work_done', 'status_after', 'remarks'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE equipment_logs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'equipment_logs', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM equipment_logs WHERE id = ?', [req.params.id]) });
});

export const deleteLog = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM equipment_logs WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Log not found');
  await query('DELETE FROM equipment_logs WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'equipment_logs', recordId: req.params.id });
  res.json({ success: true, message: 'Log deleted' });
});

/* Hire billing aggregation */
export const generateBilling = asyncHandler(async (req, res) => {
  const { equipment_id, billing_month } = req.body;
  if (!equipment_id || !billing_month || !/^\d{4}-\d{2}$/.test(billing_month)) {
    throw badRequest('equipment_id and billing_month (YYYY-MM) required');
  }
  const eq = await queryOne('SELECT * FROM equipment WHERE id = ?', [equipment_id]);
  if (!eq) throw notFound('Equipment not found');

  const totals = await queryOne(
    `SELECT
        SUM(deployed_hours) AS deployed,
        SUM(running_hours) AS running,
        SUM(breakdown_hours) AS breakdown
       FROM equipment_logs
      WHERE equipment_id = ? AND DATE_FORMAT(log_date, '%Y-%m') = ?`,
    [equipment_id, billing_month]);
  const billableHours = Number(totals?.running) || Number(totals?.deployed) || 0;
  const total = +(billableHours * Number(eq.hourly_rate || 0)).toFixed(2);

  const existing = await queryOne('SELECT id FROM equipment_billing WHERE equipment_id = ? AND billing_month = ?',
    [equipment_id, billing_month]);
  if (existing) {
    await query(`UPDATE equipment_billing SET total_hours = ?, hourly_rate = ?, total_amount = ? WHERE id = ?`,
      [billableHours, eq.hourly_rate || 0, total, existing.id]);
  } else {
    await query(
      `INSERT INTO equipment_billing (equipment_id, project_id, billing_month, total_hours, hourly_rate, total_amount)
       VALUES (?,?,?,?,?,?)`,
      [equipment_id, eq.project_id, billing_month, billableHours, eq.hourly_rate || 0, total]);
  }
  await audit(req, { action: 'create', module: 'equipment_billing', newValue: { equipment_id, billing_month, total } });
  res.json({ success: true, data: await queryOne('SELECT * FROM equipment_billing WHERE equipment_id = ? AND billing_month = ?',
    [equipment_id, billing_month]) });
});

export const updateBilling = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM equipment_billing WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Billing record not found');
  const allowed = ['paid_amount', 'payment_status', 'invoice_number', 'invoice_date', 'remarks'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE equipment_billing SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'equipment_billing', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM equipment_billing WHERE id = ?', [req.params.id]) });
});

export const listBilling = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('eb.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.billing_month) { conditions.push('eb.billing_month = ?'); params.push(req.query.billing_month); }
  if (req.query.payment_status) { conditions.push('eb.payment_status = ?'); params.push(req.query.payment_status); }
  const scope = projectScopeSql(req, 'eb.project_id');
  const rows = await query(
    `SELECT eb.*, e.name AS equipment_name, e.equipment_code, e.equipment_type, p.name AS project_name
       FROM equipment_billing eb
       JOIN equipment e ON e.id = eb.equipment_id
       JOIN projects p ON p.id = eb.project_id
      WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
      ORDER BY eb.billing_month DESC, eb.id DESC LIMIT 1000`,
    [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

/* Dashboard summary: equipment on site, fuel usage, breakdown exposure */
export const equipmentSummary = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'e.project_id');
  const fleet = await query(
    `SELECT e.status, COUNT(*) AS count FROM equipment e ${scope.clause ? `WHERE 1=1 ${scope.clause}` : 'WHERE 1=1'} GROUP BY e.status`,
    scope.params);
  const month = new Date().toISOString().slice(0, 7);
  const usage = await queryOne(
    `SELECT
        COALESCE(SUM(deployed_hours),0)  AS deployed,
        COALESCE(SUM(running_hours),0)   AS running,
        COALESCE(SUM(breakdown_hours),0) AS breakdown,
        COALESCE(SUM(fuel_quantity),0)   AS fuel
       FROM equipment_logs erl
       JOIN equipment e ON e.id = erl.equipment_id
      WHERE DATE_FORMAT(erl.log_date, '%Y-%m') = ? ${scope.clause}`,
    [month, ...scope.params]);
  res.json({ success: true, data: { byStatus: fleet, monthUsage: usage, month } });
});
