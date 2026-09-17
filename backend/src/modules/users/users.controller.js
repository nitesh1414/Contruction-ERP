import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, forbidden, notFound, conflict, parsePagination, orderByClause, searchClause, nullify,
} from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';
import { assertProjectAccess } from '../../middleware/permissions.js';

const USER_COLUMNS = `u.id, u.employee_code, u.name, u.email, u.phone, u.profile_photo, u.status, u.last_login_at, u.created_at,
  (SELECT e.id FROM hrms_employees e WHERE e.user_id = u.id LIMIT 1) AS employee_id,
  (SELECT e.employee_code FROM hrms_employees e WHERE e.user_id = u.id LIMIT 1) AS linked_employee_code,
  (SELECT e.status FROM hrms_employees e WHERE e.user_id = u.id LIMIT 1) AS employee_status`;

async function assertUserScope(req, userId) {
  if (req.user.isSuperAdmin || req.projectScope === null || req.projectScope === undefined) return;
  if (!req.projectScope.size) throw forbidden('No project access is assigned to your account');
  const ids = [...req.projectScope];
  const placeholders = ids.map(() => '?').join(',');
  const accessible = await queryOne(
    `SELECT u.id FROM users u
      WHERE u.id = ? AND (
        EXISTS (SELECT 1 FROM user_projects up WHERE up.user_id = u.id AND up.project_id IN (${placeholders}))
        OR EXISTS (SELECT 1 FROM hrms_employees e WHERE e.user_id = u.id AND e.project_id IN (${placeholders}))
      ) LIMIT 1`,
    [userId, ...ids, ...ids]
  );
  if (!accessible) throw forbidden('You do not have project access to this user');
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order } = parsePagination(req);
  const { where, params } = searchClause(req.query.search, ['u.name', 'u.email', 'u.employee_code', 'u.phone']);
  const conditions = where ? [where] : [];
  if (req.query.status) { conditions.push('u.status = ?'); params.push(req.query.status); }
  if (req.query.roleId) { conditions.push('EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ?)'); params.push(req.query.roleId); }
  if (!req.user.isSuperAdmin && req.projectScope !== null && req.projectScope !== undefined) {
    if (!req.projectScope.size) conditions.push('1 = 0');
    else {
      const ids = [...req.projectScope];
      const placeholders = ids.map(() => '?').join(',');
      conditions.push(`(EXISTS (SELECT 1 FROM user_projects scoped_up WHERE scoped_up.user_id = u.id AND scoped_up.project_id IN (${placeholders}))
        OR EXISTS (SELECT 1 FROM hrms_employees scoped_e WHERE scoped_e.user_id = u.id AND scoped_e.project_id IN (${placeholders})))`);
      params.push(...ids, ...ids);
    }
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderSql = orderByClause(sort, order, ['u.id', 'u.name', 'u.email', 'u.created_at'], 'u.id DESC');

  const rows = await query(
    `SELECT ${USER_COLUMNS}, (SELECT GROUP_CONCAT(r.name SEPARATOR ', ') FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = u.id) AS role_names,
            (SELECT GROUP_CONCAT(r.id) FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = u.id) AS role_ids
     FROM users u ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const countRow = await queryOne(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(countRow.total), totalPages: Math.ceil(countRow.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [req.params.id]);
  if (!user) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  const roles = await query('SELECT r.id, r.name, r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?', [req.params.id]);
  const projects = await query(
    `SELECT up.id, up.project_id, up.wing_id, p.name AS project_name, w.name AS wing_name
       FROM user_projects up JOIN projects p ON p.id = up.project_id
       LEFT JOIN wings w ON w.id = up.wing_id WHERE up.user_id = ?`, [req.params.id]);
  const employee = await queryOne(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name
       FROM hrms_employees e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w ON w.id = e.wing_id
      WHERE e.user_id = ?`, [req.params.id]
  );
  if (employee) assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null, employee.wing_id ? Number(employee.wing_id) : null);
  res.json({ success: true, data: { ...user, roles, projectAccess: projects, employee } });
});

const truthy = (value) => value === true || value === 1 || value === '1' || value === 'true';
const PROTECTED_ROLE_CODES = new Set(['super_admin', 'admin']);

async function validateRoleIds(req, roleIds, { required = true } = {}) {
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id) => Number(id)).filter(Number.isInteger))];
  if (required && !ids.length) throw badRequest('Select at least one role');
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(`SELECT id, code FROM roles WHERE is_active = 1 AND id IN (${placeholders})`, ids);
  if (rows.length !== ids.length) throw badRequest('One or more selected roles are invalid or inactive');
  if (!req.user.isSuperAdmin && rows.some((role) => PROTECTED_ROLE_CODES.has(role.code))) {
    throw forbidden('Only an administrator can assign an administrator role');
  }
  return ids;
}

const HR_EMPLOYMENT_TYPES = new Set(['permanent', 'contract', 'probation', 'intern']);
const HR_STATUSES = new Set(['active', 'on_leave', 'resigned', 'terminated']);
const HR_GENDERS = new Set(['male', 'female', 'other']);

function buildEmployeeFromUser(body, generatedCode) {
  const input = body.employee && typeof body.employee === 'object' ? body.employee : {};
  const employee = {
    employee_code: nullify(input.employee_code || body.employee_code) || generatedCode,
    name: input.name || body.name,
    email: nullify(input.email !== undefined ? input.email : body.email),
    phone: nullify(input.phone !== undefined ? input.phone : body.phone),
    date_of_birth: nullify(input.date_of_birth),
    date_of_joining: nullify(input.date_of_joining),
    department: nullify(input.department),
    designation: nullify(input.designation),
    project_id: nullify(input.project_id),
    wing_id: nullify(input.wing_id),
    employment_type: HR_EMPLOYMENT_TYPES.has(input.employment_type) ? input.employment_type : 'permanent',
    status: HR_STATUSES.has(input.status) ? input.status : 'active',
    gender: HR_GENDERS.has(input.gender) ? input.gender : null,
    bank_account: nullify(input.bank_account),
    pan_number: nullify(input.pan_number),
    aadhaar_number: nullify(input.aadhaar_number),
    address: nullify(input.address),
    remarks: nullify(input.remarks),
    is_active: input.is_active === undefined ? 1 : (truthy(input.is_active) ? 1 : 0),
  };
  return employee;
}

export const create = asyncHandler(async (req, res) => {
  const {
    employee_code, name, email, phone, password, status, roleIds = [], projectAccess = [],
    createEmployee = false,
  } = req.body;
  if (!name || !email) throw badRequest('name and email are required');
  if (!password || String(password).length < 8) throw badRequest('password must be at least 8 characters');
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw conflict('A user with this email already exists');
  const normalizedRoleIds = await validateRoleIds(req, roleIds);

  const wantsEmployee = truthy(createEmployee);
  if (wantsEmployee && !req.user.isSuperAdmin && !req.user.permissions.has('hrms.create')) {
    throw forbidden('HRMS → Create permission is required to create the linked employee record');
  }
  const generatedCode = nullify(employee_code) || `EMP-${Date.now().toString(36).toUpperCase()}`;
  const employee = wantsEmployee ? buildEmployeeFromUser(req.body, generatedCode) : null;
  if (employee?.project_id) assertProjectAccess(req, Number(employee.project_id), employee.wing_id ? Number(employee.wing_id) : null);
  const effectiveProjectAccess = [...projectAccess];
  if (employee?.project_id && !effectiveProjectAccess.some((entry) => Number(entry.project_id) === Number(employee.project_id))) {
    effectiveProjectAccess.push({ project_id: employee.project_id, wing_id: employee.wing_id || 0 });
  }
  for (const pa of effectiveProjectAccess) {
    if (pa.project_id) assertProjectAccess(req, Number(pa.project_id), pa.wing_id ? Number(pa.wing_id) : null);
  }
  if (!req.user.isSuperAdmin && req.projectScope !== null && req.projectScope !== undefined
    && !effectiveProjectAccess.some((entry) => entry.project_id)) {
    throw forbidden('Assign the new user to at least one project within your scope');
  }

  const hash = await bcrypt.hash(String(password), 10);
  const result = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO users (employee_code, name, email, phone, password_hash, status) VALUES (?,?,?,?,?,?)',
      [nullify(employee_code), name, email, nullify(phone), hash, status === 'inactive' ? 'inactive' : 'active']
    );
    const userId = r.insertId;
    for (const roleId of normalizedRoleIds) {
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [userId, roleId]);
    }
    for (const pa of effectiveProjectAccess) {
      if (!pa.project_id) continue;
      await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [userId, pa.project_id, pa.wing_id || 0]);
    }

    let employeeId = null;
    let employeeCreated = false;
    if (employee) {
      // A matching unlinked HR record is linked rather than duplicated. This also
      // repairs a user-first workflow that was completed in two separate steps.
      const [matches] = await conn.query(
        `SELECT id, user_id FROM hrms_employees
          WHERE employee_code = ? OR (email IS NOT NULL AND email = ?)
          LIMIT 1 FOR UPDATE`, [employee.employee_code, employee.email]
      );
      if (matches[0]?.user_id && Number(matches[0].user_id) !== Number(userId)) {
        throw conflict('An employee with this code or email is already linked to another user');
      }
      if (matches[0]) {
        employeeId = matches[0].id;
        await conn.query(
          `UPDATE hrms_employees SET user_id = ?, name = ?, email = ?, phone = ?,
             department = COALESCE(?, department), designation = COALESCE(?, designation),
             project_id = COALESCE(?, project_id), wing_id = COALESCE(?, wing_id), status = ?
           WHERE id = ?`,
          [userId, employee.name, employee.email, employee.phone, employee.department, employee.designation,
            employee.project_id, employee.wing_id, employee.status, employeeId]
        );
      } else {
        const keys = Object.keys(employee);
        const [employeeResult] = await conn.query(
          `INSERT INTO hrms_employees (${keys.join(',')}, user_id)
           VALUES (${keys.map(() => '?').join(',')}, ?)`, [...keys.map((key) => employee[key]), userId]
        );
        employeeId = employeeResult.insertId;
        employeeCreated = true;
      }
    }
    return { userId, employeeId, employeeCreated };
  });
  await audit(req, {
    action: 'create', module: 'users', recordId: result.userId,
    newValue: { name, email, roleIds, employee_id: result.employeeId, employee_created: result.employeeCreated },
  });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [result.userId]);
  const linkedEmployee = result.employeeId
    ? await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [result.employeeId])
    : null;
  res.status(201).json({ success: true, data: { ...user, employee: linkedEmployee }, meta: { employeeCreated: result.employeeCreated } });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, email, name, status FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  const { employee_code, name, phone, status, profile_photo } = req.body;
  const linkedEmployee = await queryOne('SELECT id, project_id, wing_id FROM hrms_employees WHERE user_id = ?', [req.params.id]);
  if (linkedEmployee) assertProjectAccess(req, linkedEmployee.project_id ? Number(linkedEmployee.project_id) : null, linkedEmployee.wing_id ? Number(linkedEmployee.wing_id) : null);
  await withTransaction(async (conn) => {
    await conn.query(
      `UPDATE users SET employee_code = COALESCE(?, employee_code), name = COALESCE(?, name),
         phone = COALESCE(?, phone), status = COALESCE(?, status), profile_photo = COALESCE(?, profile_photo)
       WHERE id = ?`,
      [nullify(employee_code), nullify(name), nullify(phone), ['active', 'inactive'].includes(status) ? status : null, nullify(profile_photo), req.params.id]
    );
    // Keep the identity shown by HR, leave, salary and payroll workflows in sync
    // with the login directory without allowing the user form to relink records.
    if (linkedEmployee) {
      await conn.query(
        `UPDATE hrms_employees SET employee_code = COALESCE(?, employee_code),
           name = COALESCE(?, name), phone = COALESCE(?, phone)
         WHERE id = ?`,
        [nullify(employee_code), nullify(name), nullify(phone), linkedEmployee.id]
      );
    }
  });
  await audit(req, { action: 'update', module: 'users', recordId: req.params.id, oldValue: existing, newValue: req.body });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [req.params.id]);
  res.json({ success: true, data: user });
});

export const setRoles = asyncHandler(async (req, res) => {
  const { roleIds } = req.body;
  if (!Array.isArray(roleIds)) throw badRequest('roleIds must be an array');
  const normalizedRoleIds = await validateRoleIds(req, roleIds, { required: false });
  const existing = await queryOne('SELECT id, name FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [req.params.id]);
    for (const roleId of normalizedRoleIds) {
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [req.params.id, roleId]);
    }
  });
  await audit(req, { action: 'update', module: 'users', recordId: req.params.id, newValue: { roleIds: normalizedRoleIds } });
  res.json({ success: true, message: 'Roles updated' });
});

export const setProjectAccess = asyncHandler(async (req, res) => {
  const { entries } = req.body; // [{project_id, wing_id}]
  if (!Array.isArray(entries)) throw badRequest('entries must be an array');
  const existing = await queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  for (const entry of entries) {
    if (entry.project_id) assertProjectAccess(req, Number(entry.project_id), entry.wing_id ? Number(entry.wing_id) : null);
  }
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM user_projects WHERE user_id = ?', [req.params.id]);
    for (const e of entries) {
      if (!e.project_id) continue;
      await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [req.params.id, e.project_id, e.wing_id || 0]);
    }
  });
  await audit(req, { action: 'update', module: 'users', recordId: req.params.id, newValue: { entries } });
  res.json({ success: true, message: 'Project access updated' });
});

export const adminResetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) throw badRequest('newPassword must be at least 8 characters');
  const existing = await queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  const hash = await bcrypt.hash(String(newPassword), 10);
  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    await conn.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [req.params.id]);
  });
  await audit(req, { action: 'change_password', module: 'users', recordId: req.params.id });
  res.json({ success: true, message: 'Password reset successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw badRequest('You cannot delete your own account');
  const existing = await queryOne('SELECT id, email FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  await query('DELETE FROM users WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'users', recordId: req.params.id, oldValue: { email: existing.email } });
  res.json({ success: true, message: 'User deleted' });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (!req.user.isSuperAdmin && req.projectScope !== null && req.projectScope !== undefined) {
    if (!req.projectScope.size) return sendCsv(res, 'users.csv', []);
    const ids = [...req.projectScope];
    const placeholders = ids.map(() => '?').join(',');
    conditions.push(`(EXISTS (SELECT 1 FROM user_projects scoped_up WHERE scoped_up.user_id = u.id AND scoped_up.project_id IN (${placeholders}))
      OR EXISTS (SELECT 1 FROM hrms_employees scoped_e WHERE scoped_e.user_id = u.id AND scoped_e.project_id IN (${placeholders})))`);
    params.push(...ids, ...ids);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    `SELECT u.employee_code, u.name, u.email, u.phone, u.status,
       (SELECT GROUP_CONCAT(r.name SEPARATOR ', ') FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = u.id) AS roles,
       (SELECT e.employee_code FROM hrms_employees e WHERE e.user_id = u.id LIMIT 1) AS linked_employee_code
     FROM users u ${whereSql} ORDER BY u.name`, params
  );
  sendCsv(res, 'users.csv', rows);
});
