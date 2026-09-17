import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { CrudController } from '../../utils/crud.js';

/* Convenience admin controllers using CrudController */
export const leaveTypes = new CrudController({
  table: 'hrms_leave_types', module: 'hrms',
  fields: ['name', 'code', 'annual_quota', 'is_paid', 'color_code', 'description', 'is_active'],
  searchColumns: ['name', 'code'], defaultSort: 'name ASC',
});

/* ------------------------------- Employees -------------------------------- */

function workingDaysInMonth(month /* YYYY-MM */) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const listEmployees = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('e.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.department) { conditions.push('e.department = ?'); params.push(req.query.department); }
  if (req.query.status) { conditions.push('e.status = ?'); params.push(req.query.status); }
  if (req.query.employment_type) { conditions.push('e.employment_type = ?'); params.push(req.query.employment_type); }
  if (req.query.search) {
    conditions.push('(e.name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR e.phone LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  if (req.query.is_active !== undefined && req.query.is_active !== '') { conditions.push('e.is_active = ?'); params.push(req.query.is_active); }
  const scope = projectScopeSql(req, 'e.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name, u.name AS user_name
       FROM hrms_employees e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w    ON w.id = e.wing_id
       LEFT JOIN users u    ON u.id = e.user_id
     ${whereSql} ORDER BY e.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM hrms_employees e ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const e = await queryOne(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name
       FROM hrms_employees e LEFT JOIN projects p ON p.id=e.project_id LEFT JOIN wings w ON w.id=e.wing_id
      WHERE e.id = ?`, [req.params.id]);
  if (!e) throw notFound('Employee not found');
  assertProjectAccess(req, e.project_id ? Number(e.project_id) : null, e.wing_id ? Number(e.wing_id) : null);
  const structures = await query(`SELECT * FROM hrms_salary_structures WHERE employee_id = ? ORDER BY effective_from DESC`, [req.params.id]);
  const recentLeave = await query(
    `SELECT lr.*, lt.name AS leave_type_name
       FROM hrms_leave_requests lr JOIN hrms_leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? ORDER BY lr.applied_on DESC LIMIT 12`, [req.params.id]);
  const recentPayroll = await query(
    `SELECT * FROM hrms_payroll WHERE employee_id = ? ORDER BY payroll_month DESC LIMIT 12`, [req.params.id]);
  res.json({ success: true, data: { ...e, structures, recentLeave, recentPayroll } });
});

const EMPLOYEE_FIELDS = [
  'employee_code', 'name', 'email', 'phone', 'date_of_birth', 'date_of_joining',
  'department', 'designation', 'project_id', 'wing_id',
  'bank_account', 'pan_number', 'aadhaar_number', 'address', 'gender',
  'employment_type', 'status', 'user_id', 'remarks', 'is_active',
];

export const createEmployee = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of EMPLOYEE_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.name) throw badRequest('name is required');
  if (!data.employee_code) data.employee_code = `EMP-${Date.now().toString(36).toUpperCase()}`;
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);
  const keys = Object.keys(data);
  const r = await query(`INSERT INTO hrms_employees (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'hrms', recordId: r.insertId, newValue: data });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [r.insertId]) });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Employee not found');
  assertProjectAccess(req, existing.project_id ? Number(existing.project_id) : null, existing.wing_id ? Number(existing.wing_id) : null);
  const data = {};
  for (const f of EMPLOYEE_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE hrms_employees SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'hrms', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [req.params.id]) });
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, project_id, wing_id FROM hrms_employees WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Employee not found');
  assertProjectAccess(req, existing.project_id ? Number(existing.project_id) : null, existing.wing_id ? Number(existing.wing_id) : null);
  await query('DELETE FROM hrms_employees WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'hrms', recordId: req.params.id });
  res.json({ success: true, message: 'Employee deleted' });
});

/* ------------------------------- Leave requests ---------------------------- */

export const listLeaveRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.employeeId) { conditions.push('lr.employee_id = ?'); params.push(req.query.employeeId); }
  if (req.query.status) { conditions.push('lr.status = ?'); params.push(req.query.status); }
  if (req.query.leave_type_id) { conditions.push('lr.leave_type_id = ?'); params.push(req.query.leave_type_id); }
  if (req.query.from) { conditions.push('lr.from_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('lr.to_date <= ?'); params.push(req.query.to); }
  if (req.query.search) { conditions.push('(e.name LIKE ? OR e.employee_code LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'e.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT lr.*, e.name AS employee_name, e.employee_code, e.department, lt.name AS leave_type_name, lt.code AS leave_type_code,
            u.name AS decided_by_name, p.name AS project_name
       FROM hrms_leave_requests lr
       JOIN hrms_employees e   ON e.id = lr.employee_id
       LEFT JOIN projects p     ON p.id = e.project_id
       JOIN hrms_leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users u        ON u.id = lr.decided_by
     ${whereSql} ORDER BY lr.applied_on DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(
    `SELECT COUNT(*) AS total FROM hrms_leave_requests lr JOIN hrms_employees e ON e.id = lr.employee_id ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

function diffDays(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  const days = Math.round((b - a) / 86400000) + 1;
  return days > 0 ? days : 1;
}

export const createLeaveRequest = asyncHandler(async (req, res) => {
  const { employee_id, leave_type_id, from_date, to_date, reason } = req.body;
  if (!employee_id || !leave_type_id || !from_date || !to_date) throw badRequest('employee_id, leave_type_id, from_date, to_date are required');
  const emp = await queryOne('SELECT project_id FROM hrms_employees WHERE id = ?', [employee_id]);
  if (!emp) throw notFound('Employee not found');
  if (emp.project_id) assertProjectAccess(req, Number(emp.project_id));
  const total_days = +(diffDays(from_date, to_date)).toFixed(1);
  const r = await query(
    `INSERT INTO hrms_leave_requests (employee_id, leave_type_id, from_date, to_date, total_days, reason, status)
     VALUES (?,?,?,?,?,?,?)`,
    [employee_id, leave_type_id, from_date, to_date, total_days, nullify(reason), 'pending']);
  await audit(req, { action: 'create', module: 'hrms_leave', recordId: r.insertId, newValue: req.body });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM hrms_leave_requests WHERE id = ?', [r.insertId]) });
});

export const decideLeave = asyncHandler(async (req, res) => {
  const { status, remarks } = req.body;
  if (!['approved', 'rejected', 'cancelled'].includes(status)) throw badRequest('status must be approved, rejected or cancelled');
  const existing = await queryOne(
    `SELECT lr.*, e.project_id, e.wing_id FROM hrms_leave_requests lr
       JOIN hrms_employees e ON e.id = lr.employee_id WHERE lr.id = ?`, [req.params.id]);
  if (!existing) throw notFound('Leave request not found');
  assertProjectAccess(req, existing.project_id ? Number(existing.project_id) : null, existing.wing_id ? Number(existing.wing_id) : null);
  if (existing.status !== 'pending') throw badRequest(`Already ${existing.status}`);
  await query(
    `UPDATE hrms_leave_requests SET status = ?, decided_by = ?, decided_on = NOW(), decision_remarks = ? WHERE id = ?`,
    [status, req.user.id, nullify(remarks), req.params.id]);
  await audit(req, { action: 'update', module: 'hrms_leave', recordId: req.params.id, newValue: { status, remarks } });
  res.json({ success: true, data: await queryOne('SELECT * FROM hrms_leave_requests WHERE id = ?', [req.params.id]) });
});

/* ------------------------------- Salary structures ----------------------- */

export const listSalaryStructures = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.employeeId) { conditions.push('ss.employee_id = ?'); params.push(req.query.employeeId); }
  const scope = projectScopeSql(req, 'e.project_id');
  const whereSql = `WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'}${scope.clause}`;
  params.push(...scope.params);
  const rows = await query(
    `SELECT ss.*, e.name AS employee_name, e.employee_code, e.department, e.project_id, pr.name AS project_name
       FROM hrms_salary_structures ss
       JOIN hrms_employees e ON e.id = ss.employee_id
       LEFT JOIN projects pr ON pr.id = e.project_id
      ${whereSql}
      ORDER BY e.name, ss.effective_from DESC LIMIT 1000`, params);
  res.json({ success: true, data: rows });
});

export const upsertSalaryStructure = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of ['employee_id', 'effective_from', 'basic', 'hra', 'da', 'special_allowance', 'other_allowance',
    'pf_employee', 'pf_employer', 'esic_employee', 'esic_employer', 'professional_tax', 'remarks']) {
    if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  }
  if (!data.employee_id || !data.effective_from) throw badRequest('employee_id and effective_from are required');
  const employee = await queryOne('SELECT project_id, wing_id FROM hrms_employees WHERE id = ?', [data.employee_id]);
  if (!employee) throw notFound('Employee not found');
  assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null, employee.wing_id ? Number(employee.wing_id) : null);
  const existing = await queryOne('SELECT id FROM hrms_salary_structures WHERE employee_id = ? AND effective_from = ?',
    [data.employee_id, data.effective_from]);
  let result;
  if (existing) {
    const keys = Object.keys(data);
    await query(`UPDATE hrms_salary_structures SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((k) => data[k]), existing.id]);
    result = await queryOne('SELECT * FROM hrms_salary_structures WHERE id = ?', [existing.id]);
  } else {
    const keys = Object.keys(data);
    const r = await query(`INSERT INTO hrms_salary_structures (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      keys.map((k) => data[k]));
    result = await queryOne('SELECT * FROM hrms_salary_structures WHERE id = ?', [r.insertId]);
  }
  await audit(req, { action: 'upsert', module: 'hrms_salary', recordId: result.id });
  res.json({ success: true, data: result });
});

export const deleteSalaryStructure = asyncHandler(async (req, res) => {
  const existing = await queryOne(
    `SELECT ss.id, e.project_id, e.wing_id FROM hrms_salary_structures ss
       JOIN hrms_employees e ON e.id = ss.employee_id WHERE ss.id = ?`, [req.params.id]);
  if (!existing) throw notFound('Salary structure not found');
  assertProjectAccess(req, existing.project_id ? Number(existing.project_id) : null, existing.wing_id ? Number(existing.wing_id) : null);
  await query('DELETE FROM hrms_salary_structures WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'hrms_salary', recordId: req.params.id });
  res.json({ success: true, message: 'Deleted' });
});

/* ------------------------------- Payroll ---------------------------------- */

export const listPayroll = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.payroll_month) { conditions.push('p.payroll_month = ?'); params.push(req.query.payroll_month); }
  if (req.query.payment_status) { conditions.push('p.payment_status = ?'); params.push(req.query.payment_status); }
  if (req.query.employeeId) { conditions.push('p.employee_id = ?'); params.push(req.query.employeeId); }
  if (req.query.search) { conditions.push('(e.name LIKE ? OR e.employee_code LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'e.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT p.*, e.name AS employee_name, e.employee_code, e.department, e.project_id AS employee_project_id, pr.name AS project_name
       FROM hrms_payroll p JOIN hrms_employees e ON e.id = p.employee_id
       LEFT JOIN projects pr ON pr.id = e.project_id
     ${whereSql} ORDER BY p.payroll_month DESC, e.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(
    `SELECT COUNT(*) AS total FROM hrms_payroll p JOIN hrms_employees e ON e.id = p.employee_id ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getPayroll = asyncHandler(async (req, res) => {
  const p = await queryOne(
    `SELECT p.*, e.name AS employee_name, e.employee_code, e.department, e.project_id AS employee_project_id, pr.name AS project_name, g.name AS generated_by_name
       FROM hrms_payroll p JOIN hrms_employees e ON e.id = p.employee_id
       LEFT JOIN projects pr ON pr.id = e.project_id
       LEFT JOIN users g ON g.id = p.generated_by
      WHERE p.id = ?`, [req.params.id]);
  if (!p) throw notFound('Payroll record not found');
  assertProjectAccess(req, p.employee_project_id ? Number(p.employee_project_id) : null);
  res.json({ success: true, data: p });
});

/** Generate payroll for a single employee for a specific month. */
export const generateSingle = asyncHandler(async (req, res) => {
  const { employee_id, payroll_month } = req.body;
  if (!employee_id || !/^\d{4}-\d{2}$/.test(payroll_month || '')) throw badRequest('employee_id and payroll_month (YYYY-MM) required');
  const employee = await queryOne('SELECT project_id FROM hrms_employees WHERE id = ?', [employee_id]);
  if (!employee) throw notFound('Employee not found');
  assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null);
  await generateFor(req.user, { employee_id, payroll_month });
  res.json({ success: true, data: await queryOne(
    'SELECT * FROM hrms_payroll WHERE employee_id = ? AND payroll_month = ?', [employee_id, payroll_month]) });
});

/** Bulk-generate payroll for all active employees. */
export const generateBulk = asyncHandler(async (req, res) => {
  const { payroll_month, project_id } = req.body;
  if (!/^\d{4}-\d{2}$/.test(payroll_month || '')) throw badRequest('payroll_month (YYYY-MM) is required');
  const conditions = ['e.status = "active"'];
  const params = [];
  if (project_id) { conditions.push('e.project_id = ?'); params.push(project_id); }
  const scope = projectScopeSql(req, 'e.project_id');
  const emps = await query(`SELECT e.id FROM hrms_employees e WHERE ${conditions.join(' AND ')} ${scope.clause}`, [...params, ...scope.params]);
  let generated = 0;
  for (const emp of emps) {
    try { await generateFor(req.user, { employee_id: emp.id, payroll_month }); generated++; } catch { /* skip */ }
  }
  await audit(req, { action: 'create', module: 'hrms_payroll', newValue: { payroll_month, count: generated, project_id } });
  res.json({ success: true, message: `Generated payroll for ${generated} employees`, generated });
});

/** Internal generator — shared by single + bulk. */
async function generateFor(user, { employee_id, payroll_month }) {
  const emp = await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [employee_id]);
  if (!emp) throw badRequest(`Employee #${employee_id} not found`);
  const structure = await queryOne('SELECT * FROM hrms_salary_structures WHERE employee_id = ? AND effective_from <= CURRENT_DATE ORDER BY effective_from DESC LIMIT 1',
    [employee_id]);
  if (!structure) throw badRequest(`No salary structure defined for employee ${emp.name}`);

  const total = workingDaysInMonth(payroll_month);
  const lopAgg = await queryOne(
    `SELECT COALESCE(SUM(total_days), 0) AS lop
       FROM hrms_leave_requests
      WHERE employee_id = ? AND status = 'approved'
        AND ((from_date <= LAST_DAY(?) AND to_date >= ?))`,
    [employee_id, `${payroll_month}-01`, `${payroll_month}-01`]);

  const paid = Math.max(0, total - Number(lopAgg.lop || 0));
  const ratio = paid / total;
  const round2 = (x) => +Number(x).toFixed(2);
  const basic = round2(structure.basic * ratio);
  const hra   = round2(structure.hra * ratio);
  const da    = round2(structure.da * ratio);
  const spec  = round2(structure.special_allowance * ratio);
  const other = round2(structure.other_allowance * ratio);
  const gross = round2(basic + hra + da + spec + other);
  const pf    = round2(structure.pf_employee);
  const esic  = round2(structure.esic_employee);
  const pt    = round2(structure.professional_tax);
  const totalDeductions = round2(pf + esic + pt);
  const net = round2(gross - totalDeductions);

  const existing = await queryOne('SELECT id FROM hrms_payroll WHERE employee_id = ? AND payroll_month = ?',
    [employee_id, payroll_month]);
  if (existing) {
    await query(
      `UPDATE hrms_payroll SET total_working_days = ?, paid_days = ?, lop_days = ?, basic_pay = ?, hra_pay = ?,
           da_pay = ?, special_pay = ?, other_pay = ?, gross_pay = ?, pf_deduction = ?, esic_deduction = ?,
           professional_tax = ?, total_deductions = ?, net_pay = ?, generated_by = ?, generated_at = NOW()
         WHERE id = ?`,
      [total, paid, Number(lopAgg.lop || 0), basic, hra, da, spec, other, gross, pf, esic, pt, totalDeductions, net, user.id, existing.id]);
  } else {
    await query(
      `INSERT INTO hrms_payroll (employee_id, payroll_month, total_working_days, paid_days, lop_days,
            basic_pay, hra_pay, da_pay, special_pay, other_pay, gross_pay, pf_deduction, esic_deduction,
            professional_tax, total_deductions, net_pay, generated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [employee_id, payroll_month, total, paid, Number(lopAgg.lop || 0),
       basic, hra, da, spec, other, gross, pf, esic, pt, totalDeductions, net, user.id]);
  }
}

export const updatePayrollPayment = asyncHandler(async (req, res) => {
  const { paid_amount, payment_date, payment_reference, payment_status } = req.body;
  const existing = await queryOne(
    `SELECT p.*, e.project_id AS employee_project_id FROM hrms_payroll p
       JOIN hrms_employees e ON e.id = p.employee_id WHERE p.id = ?`, [req.params.id]);
  if (!existing) throw notFound('Payroll record not found');
  assertProjectAccess(req, existing.employee_project_id ? Number(existing.employee_project_id) : null);
  const data = {};
  if (paid_amount !== undefined) data.paid_amount = +Number(paid_amount).toFixed(2);
  if (payment_date !== undefined) data.payment_date = nullify(payment_date);
  if (payment_reference !== undefined) data.payment_reference = nullify(payment_reference);
  if (data.paid_amount !== undefined) {
    const paid = Number(data.paid_amount);
    data.payment_status = paid <= 0 ? 'pending' : paid >= Number(existing.net_pay) ? 'paid' : 'partial';
  } else if (payment_status && ['pending', 'paid', 'partial'].includes(payment_status)) {
    data.payment_status = payment_status;
  }
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE hrms_payroll SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'hrms_payroll', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM hrms_payroll WHERE id = ?', [req.params.id]) });
});

/** Dashboard summary: active employees, on-leave today, payroll due. */
export const hrmsSummary = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'e.project_id');
  const onLeave = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_employees e
      WHERE e.is_active = 1 AND e.status = 'on_leave'${scope.clause}`, scope.params);
  const active = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_employees e WHERE e.is_active = 1 AND e.status = 'active'${scope.clause}`, scope.params);
  const pendingLeave = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_leave_requests lr
       JOIN hrms_employees e ON e.id = lr.employee_id
      WHERE lr.status = 'pending'${scope.clause}`, scope.params);
  const month = new Date().toISOString().slice(0, 7);
  const payroll = await queryOne(
    `SELECT COALESCE(SUM(p.net_pay), 0) AS net_due, COALESCE(SUM(p.paid_amount), 0) AS paid, COUNT(*) AS records,
            SUM(CASE WHEN p.payment_status = 'pending' THEN p.net_pay ELSE 0 END) AS pending_net
       FROM hrms_payroll p JOIN hrms_employees e ON e.id = p.employee_id
      WHERE p.payroll_month = ?${scope.clause}`, [month, ...scope.params]);
  res.json({ success: true, data: { onLeave: Number(onLeave.c), active: Number(active.c), pendingLeave: Number(pendingLeave.c), month, payroll } });
});
