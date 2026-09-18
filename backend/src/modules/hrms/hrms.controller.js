import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, conflict, forbidden, notFound, parsePagination, nullify, isValidDate, isValidMonth,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { CrudController } from '../../utils/crud.js';
import {
  validateEmployeeMasterValues, getDesignationRoleId, validateDepartmentMaster, validateDesignationMaster,
  preventUsedMasterDelete, preventUsedMasterDisable, preventUsedMasterRename,
} from './hrms-masters.js';

/* Convenience admin controllers using CrudController */
export const leaveTypes = new CrudController({
  table: 'hrms_leave_types', module: 'hrms',
  fields: ['name', 'code', 'annual_quota', 'is_paid', 'color_code', 'description', 'is_active'],
  searchColumns: ['name', 'code'], defaultSort: 'name ASC',
});

export const departments = new CrudController({
  table: 'hrms_departments', module: 'hrms',
  fields: ['name', 'code', 'description', 'is_active'],
  searchColumns: ['name', 'code', 'description'],
  filters: [{ key: 'is_active', column: 'hrms_departments.is_active' }],
  defaultSort: 'hrms_departments.name ASC',
  beforeCreate: (data) => validateDepartmentMaster(data),
  beforeUpdate: async (data, _req, existing) => {
    await preventUsedMasterDisable('hrms_departments', existing, data, 'department');
    await preventUsedMasterRename('hrms_departments', existing, data, 'department');
    if (data.name === undefined && data.code === undefined) return data;
    return validateDepartmentMaster({ ...existing, ...data });
  },
  beforeDelete: (existing) => preventUsedMasterDelete('hrms_departments', existing.name, 'department'),
});

export const designations = new CrudController({
  table: 'hrms_designations', module: 'hrms',
  fields: ['name', 'code', 'role_id', 'description', 'is_active'],
  searchColumns: ['d.name', 'd.code', 'r.name', 'r.code'],
  filters: [{ key: 'is_active', column: 'd.is_active' }],
  sortableColumns: ['d.name', 'd.code', 'r.name'],
  defaultSort: 'd.name ASC',
  listSql: `SELECT d.*, r.name AS role_name, r.code AS role_code
              FROM hrms_designations d LEFT JOIN roles r ON r.id = d.role_id`,
  countSql: `SELECT COUNT(*) AS total FROM hrms_designations d LEFT JOIN roles r ON r.id = d.role_id`,
  beforeCreate: (data) => validateDesignationMaster(data),
  beforeUpdate: async (data, _req, existing) => {
    await preventUsedMasterDisable('hrms_designations', existing, data, 'designation');
    await preventUsedMasterRename('hrms_designations', existing, data, 'designation');
    const merged = await validateDesignationMaster({ ...existing, ...data });
    if (data.name !== undefined) data.name = merged.name;
    if (data.name !== undefined || data.code !== undefined) data.code = merged.code;
    if (data.role_id !== undefined) data.role_id = merged.role_id;
    return data;
  },
  beforeDelete: (existing) => preventUsedMasterDelete('hrms_designations', existing.name, 'designation'),
});

/* ------------------------------- Employees -------------------------------- */

function workingDaysInMonth(month /* YYYY-MM */) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const LOGIN_PROTECTED_ROLES = new Set(['super_admin', 'admin']);
const HR_EMPLOYMENT_TYPES = new Set(['permanent', 'contract', 'probation', 'intern']);
const HR_STATUSES = new Set(['active', 'on_leave', 'resigned', 'terminated']);
const HR_GENDERS = new Set(['male', 'female', 'other']);

function truthy(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function assertCanCreateLogin(req) {
  if (!req.user.isSuperAdmin && !req.user.permissions.has('users.create')) {
    throw forbidden('Users → Create permission is required to provision login credentials');
  }
}

/** Return roles that may be assigned to an employee login from an HR screen. */
export const loginRoles = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT id, name, code, description FROM roles
      WHERE is_active = 1 ${req.user.isSuperAdmin ? '' : "AND code NOT IN ('super_admin', 'admin')"}
      ORDER BY name`,
  );
  res.json({ success: true, data: rows });
});

async function validateLoginRoles(req, roleIds) {
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id) => Number(id)).filter(Number.isInteger))];
  if (!ids.length) throw badRequest('Select at least one role for the login account');
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(`SELECT id, code FROM roles WHERE is_active = 1 AND id IN (${placeholders})`, ids);
  if (rows.length !== ids.length) throw badRequest('One or more selected login roles are invalid or inactive');
  if (!req.user.isSuperAdmin && rows.some((role) => LOGIN_PROTECTED_ROLES.has(role.code))) {
    throw forbidden('Only an administrator can assign an administrator login role');
  }
  return ids;
}

/**
 * Create a user and link it to an employee inside the caller's transaction.
 * An existing unlinked user with the same email is linked instead of duplicated.
 */
function normalizeEmail(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim().toLowerCase();
}

function normalizeCode(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim();
}

function duplicateConflict(error, message) {
  if (error?.code === 'ER_DUP_ENTRY') throw conflict(message);
  throw error;
}

async function assertEmployeeCodeAvailable(conn, employeeCode, employeeId = null) {
  if (!employeeCode) throw badRequest('employee_code is required');
  const [rows] = await conn.query(
    'SELECT id FROM hrms_employees WHERE employee_code = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE',
    [employeeCode, employeeId]
  );
  if (rows[0]) throw conflict('An employee with this code already exists');
}

async function assertEmployeeEmailAvailable(conn, email, employeeId = null) {
  if (!email) return;
  const [rows] = await conn.query(
    'SELECT id FROM hrms_employees WHERE email = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE',
    [email, employeeId]
  );
  if (rows[0]) throw conflict('An employee with this email already exists');
}

async function assertUserIdentityAvailable(conn, { email, employeeCode, userId = null }) {
  const [emailRows] = await conn.query(
    'SELECT id FROM users WHERE email = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE', [email, userId]
  );
  if (emailRows[0]) throw conflict('A user with this email already exists');
  if (employeeCode) {
    const [codeRows] = await conn.query(
      'SELECT id FROM users WHERE employee_code = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE', [employeeCode, userId]
    );
    if (codeRows[0]) throw conflict('A user with this employee code already exists');
  }
}

/** Create a user or link an existing unlinked user to an employee atomically. */
async function createOrLinkLogin(conn, req, employee, password, roleIds) {
  const employeeCode = normalizeCode(employee.employee_code);
  const email = normalizeEmail(employee.email);
  if (!employeeCode) throw badRequest('employee_code is required for login credentials');
  if (employeeCode.length > 30) throw badRequest('employee_code must be at most 30 characters for a login');
  if (!email) throw badRequest('An email address is required for login credentials');
  await assertEmployeeCodeAvailable(conn, employeeCode, employee.id);

  const [emailRows] = await conn.query('SELECT * FROM users WHERE email = ? LIMIT 1 FOR UPDATE', [email]);
  const [idRows] = employee.user_id
    ? await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [employee.user_id])
    : [[]];
  const existingUser = emailRows[0] || idRows[0];
  if (emailRows[0] && idRows[0] && Number(emailRows[0].id) !== Number(idRows[0].id)) {
    throw conflict('The employee email and selected login belong to different users');
  }

  if (existingUser) {
    const [linkedRows] = await conn.query(
      'SELECT id FROM hrms_employees WHERE user_id = ? AND id <> ? LIMIT 1 FOR UPDATE',
      [existingUser.id, employee.id]
    );
    if (linkedRows[0]) throw conflict('That login is already linked to another employee');
    await assertUserIdentityAvailable(conn, { email, employeeCode, userId: existingUser.id });
    const accountStatus = employee.is_active === 0 || ['resigned', 'terminated'].includes(employee.status)
      ? 'inactive' : 'active';
    await conn.query(
      `UPDATE users SET employee_code = ?, name = ?, email = ?, phone = ?,
         status = COALESCE(?, status) WHERE id = ?`,
      [employeeCode, employee.name, email, employee.phone || null, accountStatus, existingUser.id]
    );
    await conn.query('UPDATE hrms_employees SET user_id = ?, employee_code = ?, email = ? WHERE id = ?',
      [existingUser.id, employeeCode, email, employee.id]);
    if (employee.project_id) {
      await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [existingUser.id, employee.project_id, employee.wing_id || 0]);
    }
    for (const roleId of roleIds) {
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [existingUser.id, roleId]);
    }
    return { userId: existingUser.id, created: false };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const accountStatus = employee.is_active === 0 || ['resigned', 'terminated'].includes(employee.status)
    ? 'inactive' : 'active';
  await assertUserIdentityAvailable(conn, { email, employeeCode });
  const [userResult] = await conn.query(
    `INSERT INTO users (employee_code, name, email, phone, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [employeeCode, employee.name, email, employee.phone || null, passwordHash, accountStatus]
  );
  for (const roleId of roleIds) {
    await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userResult.insertId, roleId]);
  }
  if (employee.project_id) {
      await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [userResult.insertId, employee.project_id, employee.wing_id || 0]);
  }
  await conn.query('UPDATE hrms_employees SET user_id = ?, employee_code = ?, email = ? WHERE id = ?',
    [userResult.insertId, employeeCode, email, employee.id]);
  return { userId: userResult.insertId, created: true };
}

async function employeeWithUser(id) {
  return queryOne(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name,
            r.name AS designation_role_name, r.code AS designation_role_code,
            u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM hrms_employees e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w ON w.id = e.wing_id
       LEFT JOIN hrms_designations d ON d.name = e.designation
       LEFT JOIN roles r ON r.id = d.role_id
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = ?`, [id]
  );
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
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT e.*, p.name AS project_name, w.name AS wing_name,
            r.name AS designation_role_name, r.code AS designation_role_code,
            u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM hrms_employees e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w    ON w.id = e.wing_id
       LEFT JOIN hrms_designations d ON d.name = e.designation
       LEFT JOIN roles r ON r.id = d.role_id
       LEFT JOIN users u    ON u.id = e.user_id
     ${whereSql} ORDER BY e.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM hrms_employees e ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const e = await employeeWithUser(req.params.id);
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

function normalizeEmployeeData(body, { partial = false } = {}) {
  const data = {};
  for (const field of EMPLOYEE_FIELDS) if (body[field] !== undefined) data[field] = nullify(body[field]);
  if (!partial && !data.name) throw badRequest('name is required');
  if (data.name !== undefined && !data.name) throw badRequest('name cannot be empty');
  if (data.name !== undefined) data.name = String(data.name).trim();
  if (data.employee_code !== undefined) {
    data.employee_code = normalizeCode(data.employee_code);
    if (data.employee_code && data.employee_code.length > 40) throw badRequest('employee_code must be at most 40 characters');
  }
  if (data.email !== undefined) data.email = normalizeEmail(data.email);
  for (const field of ['date_of_birth', 'date_of_joining']) {
    if (data[field] !== undefined && data[field] !== null && !isValidDate(data[field])) throw badRequest(`${field} must be YYYY-MM-DD`);
  }
  if (data.gender !== undefined && data.gender !== null && !HR_GENDERS.has(data.gender)) throw badRequest('Invalid employee gender');
  if (data.employment_type !== undefined && data.employment_type !== null && !HR_EMPLOYMENT_TYPES.has(data.employment_type)) throw badRequest('Invalid employment type');
  if (data.status !== undefined && data.status !== null && !HR_STATUSES.has(data.status)) throw badRequest('Invalid employee status');
  if (data.is_active !== undefined) data.is_active = truthy(data.is_active) ? 1 : 0;
  for (const field of ['project_id', 'wing_id', 'user_id']) {
    if (data[field] !== undefined && data[field] !== null) {
      const value = Number(data[field]);
      if (!Number.isInteger(value) || value < 1) throw badRequest(`${field} must be a positive integer`);
      data[field] = value;
    }
  }
  return data;
}

async function syncUserFromEmployee(conn, employee, userId) {
  const [userRows] = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
  const user = userRows[0];
  if (!user) throw badRequest('The selected login user does not exist');
  const email = normalizeEmail(employee.email || user.email);
  const employeeCode = normalizeCode(employee.employee_code);
  if (!employeeCode) throw badRequest('employee_code is required for a linked user');
  if (employeeCode.length > 30) throw badRequest('employee_code must be at most 30 characters for a linked user');
  if (!email) throw badRequest('An email address is required for a linked user');
  await assertUserIdentityAvailable(conn, { email, employeeCode, userId });
  await conn.query(
    `UPDATE users SET employee_code = ?, name = ?, email = ?, phone = ?,
       status = CASE WHEN ? = 0 OR ? IN ('resigned', 'terminated') THEN 'inactive' ELSE 'active' END
     WHERE id = ?`,
    [employeeCode, employee.name, email, employee.phone || null, employee.is_active === 0 ? 0 : 1, employee.status || 'active', userId]
  );
  return { ...user, id: userId, email, employee_code: employeeCode };
}

export const createEmployee = asyncHandler(async (req, res) => {
  const data = normalizeEmployeeData(req.body);
  await validateEmployeeMasterValues(data);
  if (!data.employee_code) data.employee_code = `EMP-${Date.now().toString(36).toUpperCase()}`;
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);

  const wantsLogin = truthy(req.body.create_login);
  const designationRoleId = await getDesignationRoleId(data.designation);
  let roleIds = [];
  if (wantsLogin) {
    assertCanCreateLogin(req);
    if (!data.email) throw badRequest('An email address is required for login credentials');
    if (typeof req.body.login_password !== 'string' || req.body.login_password.length < 8) {
      throw badRequest('Login password must be at least 8 characters');
    }
    const requestedRoleIds = Array.isArray(req.body.login_role_ids) ? req.body.login_role_ids : [];
    roleIds = await validateLoginRoles(req, [...requestedRoleIds, ...(designationRoleId ? [designationRoleId] : [])]);
  } else if (data.user_id && designationRoleId) {
    await validateLoginRoles(req, [designationRoleId]);
  }

  let result;
  try {
    result = await withTransaction(async (conn) => {
      await assertEmployeeCodeAvailable(conn, data.employee_code);
      await assertEmployeeEmailAvailable(conn, data.email);
      let selectedUser = null;
      if (data.user_id) {
        const [userRows] = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [data.user_id]);
        selectedUser = userRows[0];
        if (!selectedUser) throw badRequest('The selected login user does not exist');
        const [alreadyLinked] = await conn.query('SELECT id FROM hrms_employees WHERE user_id = ? LIMIT 1 FOR UPDATE', [data.user_id]);
        if (alreadyLinked[0]) throw conflict('That login is already linked to an employee');
        if (!data.email) data.email = normalizeEmail(selectedUser.email);
      }
      await assertEmployeeEmailAvailable(conn, data.email);

      const insertData = { ...data };
      const keys = Object.keys(insertData);
      const [employeeResult] = await conn.query(
        `INSERT INTO hrms_employees (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((key) => insertData[key])
      );
      let userId = data.user_id || null;
      let loginCreated = false;
      if (userId) {
        await syncUserFromEmployee(conn, { ...data, id: employeeResult.insertId }, userId);
        if (data.project_id) {
          await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [userId, data.project_id, data.wing_id || 0]);
        }
        if (designationRoleId) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [userId, designationRoleId]);
        }
      }
      if (wantsLogin) {
        const login = await createOrLinkLogin(conn, req, {
          id: employeeResult.insertId,
          ...data,
        }, req.body.login_password, roleIds);
        userId = login.userId;
        loginCreated = login.created;
      }
      return { employeeId: employeeResult.insertId, userId, loginCreated, selectedUser: Boolean(selectedUser) };
    });
  } catch (error) {
    duplicateConflict(error, 'The employee code, email, or login link is already in use');
  }

  const auditValue = { ...data, user_id: result.userId, login_created: result.loginCreated };
  await audit(req, { action: 'create', module: 'hrms', recordId: result.employeeId, newValue: auditValue });
  res.status(201).json({ success: true, data: await employeeWithUser(result.employeeId), meta: { loginCreated: result.loginCreated } });
});

export const createEmployeeLogin = asyncHandler(async (req, res) => {
  assertCanCreateLogin(req);
  const employee = await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [req.params.id]);
  if (!employee) throw notFound('Employee not found');
  assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null, employee.wing_id ? Number(employee.wing_id) : null);
  if (employee.user_id) throw conflict('This employee already has a linked login');
  if (!employee.email) throw badRequest('Add an email address before creating login credentials');
  if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
    throw badRequest('Login password must be at least 8 characters');
  }
  const designationRoleId = await getDesignationRoleId(employee.designation);
  const requestedRoleIds = req.body.roleIds || req.body.login_role_ids;
  const roleIds = await validateLoginRoles(req, [
    ...(Array.isArray(requestedRoleIds) ? requestedRoleIds : []),
    ...(designationRoleId ? [designationRoleId] : []),
  ]);
  let result;
  try {
    result = await withTransaction((conn) => createOrLinkLogin(
      conn, req, employee, req.body.password, roleIds
    ));
  } catch (error) {
    duplicateConflict(error, 'The email, employee code, or login link is already in use');
  }
  await audit(req, { action: 'link', module: 'hrms', recordId: employee.id, newValue: { user_id: result.userId, login_created: result.created } });
  res.status(201).json({ success: true, data: await employeeWithUser(employee.id), meta: { loginCreated: result.created } });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Employee not found');
  assertProjectAccess(req, existing.project_id ? Number(existing.project_id) : null, existing.wing_id ? Number(existing.wing_id) : null);
  const data = normalizeEmployeeData(req.body, { partial: true });
  await validateEmployeeMasterValues(data, { partial: true });
  if (data.project_id) assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);

  const wantsLogin = truthy(req.body.create_login);
  if (wantsLogin) {
    assertCanCreateLogin(req);
    if (existing.user_id) throw conflict('This employee already has a linked login');
    const loginEmail = data.email !== undefined ? data.email : existing.email;
    if (!loginEmail) throw badRequest('Add an email address before creating login credentials');
    if (typeof req.body.login_password !== 'string' || req.body.login_password.length < 8) {
      throw badRequest('Login password must be at least 8 characters');
    }
  }
  const designationRoleId = await getDesignationRoleId(data.designation !== undefined ? data.designation : existing.designation);
  const willLinkLogin = Boolean(existing.user_id || data.user_id || wantsLogin);
  if (designationRoleId && willLinkLogin) await validateLoginRoles(req, [designationRoleId]);
  let loginRoleIds = [];
  if (wantsLogin) {
    const requestedRoleIds = req.body.login_role_ids || req.body.roleIds;
    loginRoleIds = await validateLoginRoles(req, [
      ...(Array.isArray(requestedRoleIds) ? requestedRoleIds : []),
      ...(designationRoleId ? [designationRoleId] : []),
    ]);
  }

  let loginMeta = null;
  try {
    await withTransaction(async (conn) => {
      const [employeeRows] = await conn.query('SELECT * FROM hrms_employees WHERE id = ? FOR UPDATE', [req.params.id]);
      const lockedExisting = employeeRows[0];
      if (!lockedExisting) throw notFound('Employee not found');
      const updatedEmployee = { ...lockedExisting, ...data, id: Number(req.params.id) };
      if (updatedEmployee.user_id && data.email === null) throw badRequest('A linked employee must have an email address');
      await assertEmployeeCodeAvailable(conn, normalizeCode(updatedEmployee.employee_code), req.params.id);
      await assertEmployeeEmailAvailable(conn, normalizeEmail(updatedEmployee.email), req.params.id);

      if (data.user_id !== undefined && data.user_id !== null && Number(data.user_id) !== Number(lockedExisting.user_id || 0)) {
        const [userRows] = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [data.user_id]);
        if (!userRows[0]) throw badRequest('The selected login user does not exist');
        const [alreadyLinked] = await conn.query('SELECT id FROM hrms_employees WHERE user_id = ? AND id <> ? LIMIT 1 FOR UPDATE', [data.user_id, req.params.id]);
        if (alreadyLinked[0]) throw conflict('That login is already linked to another employee');
        if (!updatedEmployee.email) updatedEmployee.email = normalizeEmail(userRows[0].email);
        data.email = updatedEmployee.email;
        await assertEmployeeEmailAvailable(conn, normalizeEmail(updatedEmployee.email), req.params.id);
      }

      const keys = Object.keys(data);
      if (keys.length) {
        await conn.query(`UPDATE hrms_employees SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => data[key]), req.params.id]);
      }
      const syncUserId = data.user_id === null ? null : (data.user_id || lockedExisting.user_id);
      const syncProjectId = data.project_id !== undefined ? data.project_id : lockedExisting.project_id;
      const syncWingId = data.wing_id !== undefined ? data.wing_id : lockedExisting.wing_id;
      if (syncUserId) {
        await syncUserFromEmployee(conn, { ...updatedEmployee, user_id: syncUserId }, syncUserId);
        if (syncProjectId) {
          await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [syncUserId, syncProjectId, syncWingId || 0]);
        }
        if (designationRoleId) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [syncUserId, designationRoleId]);
        }
      }
      if (wantsLogin) {
        loginMeta = await createOrLinkLogin(conn, req, updatedEmployee, req.body.login_password, loginRoleIds);
      }
    });
  } catch (error) {
    duplicateConflict(error, 'The employee code, email, or login link is already in use');
  }
  const auditValue = { ...data };
  if (loginMeta) auditValue.login_created = loginMeta.created;
  await audit(req, { action: 'update', module: 'hrms', recordId: req.params.id, newValue: auditValue });
  res.json({ success: true, data: await employeeWithUser(req.params.id), meta: loginMeta || undefined });
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
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
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

export const leaveBalances = asyncHandler(async (req, res) => {
  const employeeId = Number(req.query.employeeId);
  const year = String(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(employeeId) || employeeId < 1) throw badRequest('employeeId is required');
  if (!/^\d{4}$/.test(year)) throw badRequest('year must be YYYY');
  const employee = await queryOne('SELECT project_id, wing_id FROM hrms_employees WHERE id = ?', [employeeId]);
  if (!employee) throw notFound('Employee not found');
  assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null, employee.wing_id ? Number(employee.wing_id) : null);
  const rows = await query(
    `SELECT lt.id, lt.name, lt.code, lt.annual_quota, lt.is_paid,
            COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.total_days ELSE 0 END), 0) AS used_days,
            COALESCE(SUM(CASE WHEN lr.status = 'pending' THEN lr.total_days ELSE 0 END), 0) AS pending_days
       FROM hrms_leave_types lt
       LEFT JOIN hrms_leave_requests lr ON lr.leave_type_id = lt.id AND lr.employee_id = ?
         AND lr.from_date >= ? AND lr.from_date < ? AND lr.status IN ('approved', 'pending')
      WHERE lt.is_active = 1
      GROUP BY lt.id, lt.name, lt.code, lt.annual_quota, lt.is_paid
      ORDER BY lt.name`, [employeeId, `${year}-01-01`, `${Number(year) + 1}-01-01`]
  );
  res.json({ success: true, data: rows.map((row) => ({
    ...row,
    remaining_days: Number(row.annual_quota) > 0 ? Math.max(0, Number(row.annual_quota) - Number(row.used_days) - Number(row.pending_days)) : null,
  })) });
});

function diffDays(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.floor((b - a) / 86400000) + 1;
}

export const createLeaveRequest = asyncHandler(async (req, res) => {
  const { employee_id, leave_type_id, from_date, to_date, reason } = req.body;
  if (!employee_id || !leave_type_id || !from_date || !to_date) throw badRequest('employee_id, leave_type_id, from_date, to_date are required');
  if (!isValidDate(from_date) || !isValidDate(to_date)) throw badRequest('from_date and to_date must be valid YYYY-MM-DD dates');
  const total_days = diffDays(from_date, to_date);
  if (total_days < 1) throw badRequest('to_date must be on or after from_date');
  const emp = await queryOne('SELECT id, project_id, wing_id, status, is_active FROM hrms_employees WHERE id = ?', [employee_id]);
  if (!emp) throw notFound('Employee not found');
  if (!emp.is_active || emp.status === 'terminated') throw badRequest('Leave cannot be requested for an inactive or terminated employee');
  if (emp.project_id) assertProjectAccess(req, Number(emp.project_id), emp.wing_id ? Number(emp.wing_id) : null);
  const leaveType = await queryOne('SELECT id, annual_quota, is_active FROM hrms_leave_types WHERE id = ?', [leave_type_id]);
  if (!leaveType || !leaveType.is_active) throw badRequest('The selected leave type is inactive or does not exist');

  const result = await withTransaction(async (conn) => {
    const [overlap] = await conn.query(
      `SELECT id FROM hrms_leave_requests
        WHERE employee_id = ? AND status IN ('pending', 'approved')
          AND from_date <= ? AND to_date >= ? LIMIT 1 FOR UPDATE`,
      [employee_id, to_date, from_date]
    );
    if (overlap[0]) throw conflict('This employee already has a pending or approved leave overlapping those dates');
    if (Number(leaveType.annual_quota) > 0) {
      const year = String(from_date).slice(0, 4);
      const [usedRows] = await conn.query(
        `SELECT COALESCE(SUM(total_days), 0) AS used_days FROM hrms_leave_requests
          WHERE employee_id = ? AND leave_type_id = ? AND status IN ('pending', 'approved')
            AND from_date >= ? AND from_date < ?`,
        [employee_id, leave_type_id, `${year}-01-01`, `${Number(year) + 1}-01-01`]
      );
      if (Number(usedRows[0].used_days) + total_days > Number(leaveType.annual_quota)) {
        throw badRequest(`Leave quota exceeded. Remaining balance: ${Math.max(0, Number(leaveType.annual_quota) - Number(usedRows[0].used_days))} day(s)`);
      }
    }
    const [insertResult] = await conn.query(
      `INSERT INTO hrms_leave_requests (employee_id, leave_type_id, from_date, to_date, total_days, reason, status)
       VALUES (?,?,?,?,?,?,?)`,
      [employee_id, leave_type_id, from_date, to_date, total_days, nullify(reason), 'pending']
    );
    return insertResult.insertId;
  });
  await audit(req, { action: 'create', module: 'hrms_leave', recordId: result, newValue: req.body });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM hrms_leave_requests WHERE id = ?', [result]) });
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
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
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

const SALARY_MONEY_FIELDS = [
  'basic', 'hra', 'da', 'special_allowance', 'other_allowance', 'pf_employee', 'pf_employer',
  'esic_employee', 'esic_employer', 'professional_tax',
];

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function normalizeSalaryData(body) {
  const data = {};
  if (body.employee_id !== undefined) {
    const employeeId = Number(body.employee_id);
    if (!Number.isInteger(employeeId) || employeeId < 1) throw badRequest('employee_id must be a positive integer');
    data.employee_id = employeeId;
  }
  if (body.effective_from !== undefined) {
    if (!isValidDate(body.effective_from)) throw badRequest('effective_from must be a valid YYYY-MM-DD date');
    data.effective_from = body.effective_from;
  }
  for (const field of SALARY_MONEY_FIELDS) {
    if (body[field] === undefined) continue;
    const amount = Number(body[field]);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest(`${field} must be a non-negative number`);
    data[field] = +amount.toFixed(2);
  }
  if (body.remarks !== undefined) data.remarks = nullify(body.remarks);
  return data;
}

export const upsertSalaryStructure = asyncHandler(async (req, res) => {
  const requested = normalizeSalaryData(req.body);
  const isUpdate = Boolean(req.params.id);
  let existing = null;
  if (isUpdate) {
    existing = await queryOne(
      `SELECT ss.*, e.project_id, e.wing_id FROM hrms_salary_structures ss
         JOIN hrms_employees e ON e.id = ss.employee_id WHERE ss.id = ?`, [req.params.id]
    );
    if (!existing) throw notFound('Salary structure not found');
  }
  const employeeId = requested.employee_id || existing?.employee_id;
  const effectiveFrom = requested.effective_from || dateOnly(existing?.effective_from);
  if (!employeeId || !effectiveFrom) throw badRequest('employee_id and effective_from are required');
  if (!isValidDate(effectiveFrom)) throw badRequest('effective_from must be a valid YYYY-MM-DD date');
  const employee = await queryOne('SELECT project_id, wing_id FROM hrms_employees WHERE id = ?', [employeeId]);
  if (!employee) throw notFound('Employee not found');
  assertProjectAccess(req, employee.project_id ? Number(employee.project_id) : null, employee.wing_id ? Number(employee.wing_id) : null);

  const writeData = { ...requested };
  if (!isUpdate) {
    writeData.employee_id = employeeId;
    writeData.effective_from = effectiveFrom;
  }
  let result;
  try {
    result = await withTransaction(async (conn) => {
      const [duplicates] = await conn.query(
        `SELECT id FROM hrms_salary_structures
          WHERE employee_id = ? AND effective_from = ? ${isUpdate ? 'AND id <> ?' : ''}
          LIMIT 1 FOR UPDATE`,
        isUpdate ? [employeeId, effectiveFrom, req.params.id] : [employeeId, effectiveFrom]
      );
      if (duplicates[0]) throw conflict('A salary structure for this employee and effective date already exists');
      const keys = Object.keys(writeData);
      if (!keys.length) throw badRequest('Provide at least one salary field');
      if (isUpdate) {
        await conn.query(`UPDATE hrms_salary_structures SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => writeData[key]), req.params.id]);
        return Number(req.params.id);
      }
      const [insertResult] = await conn.query(
        `INSERT INTO hrms_salary_structures (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((key) => writeData[key])
      );
      return insertResult.insertId;
    });
  } catch (error) {
    duplicateConflict(error, 'A salary structure for this employee and effective date already exists');
  }
  const row = await queryOne('SELECT * FROM hrms_salary_structures WHERE id = ?', [result]);
  await audit(req, { action: isUpdate ? 'update' : 'create', module: 'hrms_salary', recordId: result, newValue: writeData });
  res.status(isUpdate ? 200 : 201).json({ success: true, data: row });
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
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
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
  if (!employee_id || !isValidMonth(payroll_month)) throw badRequest('employee_id and payroll_month (YYYY-MM) required');
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
  if (!isValidMonth(payroll_month)) throw badRequest('payroll_month (YYYY-MM) is required');
  const conditions = ["e.status = 'active'", 'e.is_active = 1'];
  const params = [];
  if (project_id) {
    const projectId = Number(project_id);
    if (!Number.isInteger(projectId) || projectId < 1) throw badRequest('project_id must be a positive integer');
    conditions.push('e.project_id = ?'); params.push(projectId);
    assertProjectAccess(req, projectId);
  }
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
  const emps = await query(`SELECT e.id, e.name, e.employee_code FROM hrms_employees e WHERE ${conditions.join(' AND ')} ${scope.clause}`, [...params, ...scope.params]);
  let generated = 0;
  const skipped = [];
  for (const emp of emps) {
    try {
      await generateFor(req.user, { employee_id: emp.id, payroll_month });
      generated++;
    } catch (error) {
      skipped.push({ employee_id: emp.id, employee_code: emp.employee_code, employee_name: emp.name, reason: error.message });
    }
  }
  await audit(req, { action: 'create', module: 'hrms_payroll', newValue: { payroll_month, count: generated, skipped: skipped.length, project_id } });
  res.json({ success: true, message: `Generated payroll for ${generated} employees`, generated, skipped });
});

/** Internal generator — shared by single + bulk. */
async function generateFor(user, { employee_id, payroll_month }) {
  if (!isValidMonth(payroll_month)) throw badRequest('payroll_month must be YYYY-MM');
  const emp = await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [employee_id]);
  if (!emp) throw badRequest(`Employee #${employee_id} not found`);
  if (!emp.is_active || emp.status !== 'active') throw badRequest(`Employee ${emp.name} is not active`);
  const periodStart = `${payroll_month}-01`;
  const structure = await queryOne(
    `SELECT * FROM hrms_salary_structures
      WHERE employee_id = ? AND is_active = 1 AND effective_from <= LAST_DAY(?)
      ORDER BY effective_from DESC LIMIT 1`, [employee_id, periodStart]
  );
  if (!structure) throw badRequest(`No salary structure defined for employee ${emp.name}`);

  const total = workingDaysInMonth(payroll_month);
  const lopAgg = await queryOne(
    `SELECT COALESCE(SUM(
        GREATEST(0, DATEDIFF(LEAST(lr.to_date, LAST_DAY(?)), GREATEST(lr.from_date, ?)) + 1)
      ), 0) AS lop
       FROM hrms_leave_requests lr
       JOIN hrms_leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? AND lr.status = 'approved' AND lt.is_paid = 0
        AND lr.from_date <= LAST_DAY(?) AND lr.to_date >= ?`,
    [periodStart, periodStart, employee_id, periodStart, periodStart]
  );

  const lopDays = Math.min(total, Math.max(0, Number(lopAgg.lop || 0)));
  const paid = Math.max(0, total - lopDays);
  const ratio = paid / total;
  const round2 = (x) => +Number(x || 0).toFixed(2);
  const basic = round2(structure.basic * ratio);
  const hra   = round2(structure.hra * ratio);
  const da    = round2(structure.da * ratio);
  const spec  = round2(structure.special_allowance * ratio);
  const other = round2(structure.other_allowance * ratio);
  const gross = round2(basic + hra + da + spec + other);
  const pf    = round2(Number(structure.pf_employee) * ratio);
  const esic  = round2(Number(structure.esic_employee) * ratio);
  const pt    = round2(Number(structure.professional_tax) * ratio);
  const totalDeductions = round2(Math.min(gross, pf + esic + pt));
  const net = round2(Math.max(0, gross - totalDeductions));

  const existing = await queryOne('SELECT id, paid_amount FROM hrms_payroll WHERE employee_id = ? AND payroll_month = ?',
    [employee_id, payroll_month]);
  if (existing && Number(existing.paid_amount) > 0) {
    throw badRequest(`Payroll for ${emp.name} has already received a payment and cannot be regenerated`);
  }
  if (existing) {
    await query(
      `UPDATE hrms_payroll SET total_working_days = ?, paid_days = ?, lop_days = ?, basic_pay = ?, hra_pay = ?,
           da_pay = ?, special_pay = ?, other_pay = ?, gross_pay = ?, pf_deduction = ?, esic_deduction = ?,
           professional_tax = ?, total_deductions = ?, net_pay = ?, payment_status = 'pending', paid_amount = 0,
           payment_date = NULL, payment_reference = NULL, generated_by = ?, generated_at = NOW()
         WHERE id = ?`,
      [total, paid, lopDays, basic, hra, da, spec, other, gross, pf, esic, pt, totalDeductions, net, user.id, existing.id]);
  } else {
    await query(
      `INSERT INTO hrms_payroll (employee_id, payroll_month, total_working_days, paid_days, lop_days,
            basic_pay, hra_pay, da_pay, special_pay, other_pay, gross_pay, pf_deduction, esic_deduction,
            professional_tax, total_deductions, net_pay, generated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [employee_id, payroll_month, total, paid, lopDays,
       basic, hra, da, spec, other, gross, pf, esic, pt, totalDeductions, net, user.id]);
  }
}

export const updatePayrollPayment = asyncHandler(async (req, res) => {
  const { paid_amount, payment_date, payment_reference, payment_status } = req.body;
  if (payment_status !== undefined && paid_amount === undefined) {
    throw badRequest('paid_amount is required; payment status is calculated from the amount');
  }
  if (payment_status !== undefined && !['pending', 'partial', 'paid'].includes(payment_status)) {
    throw badRequest('payment_status must be pending, partial or paid');
  }
  if (payment_date !== undefined && payment_date !== null && payment_date !== '' && !isValidDate(payment_date)) {
    throw badRequest('payment_date must be a valid YYYY-MM-DD date');
  }
  let updated;
  let auditValue;
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT p.*, e.project_id AS employee_project_id FROM hrms_payroll p
         JOIN hrms_employees e ON e.id = p.employee_id WHERE p.id = ? FOR UPDATE`, [req.params.id]
    );
    const existing = rows[0];
    if (!existing) throw notFound('Payroll record not found');
    assertProjectAccess(req, existing.employee_project_id ? Number(existing.employee_project_id) : null);
    const data = {};
    const amount = paid_amount === undefined ? Number(existing.paid_amount || 0) : Number(paid_amount);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest('paid_amount must be a non-negative number');
    if (amount > Number(existing.net_pay)) throw badRequest('paid_amount cannot exceed net pay');
    if (paid_amount !== undefined) data.paid_amount = +amount.toFixed(2);
    if (payment_date !== undefined || (paid_amount !== undefined && amount <= 0)) data.payment_date = amount > 0 ? nullify(payment_date) : null;
    if (payment_reference !== undefined) data.payment_reference = nullify(payment_reference);
    if (paid_amount !== undefined) data.payment_status = amount <= 0 ? 'pending' : amount >= Number(existing.net_pay) ? 'paid' : 'partial';
    const keys = Object.keys(data);
    if (keys.length) {
      await conn.query(`UPDATE hrms_payroll SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((key) => data[key]), req.params.id]);
    }
    auditValue = data;
    [updated] = await conn.query('SELECT * FROM hrms_payroll WHERE id = ?', [req.params.id]);
  });
  await audit(req, { action: 'update', module: 'hrms_payroll', recordId: req.params.id, newValue: auditValue });
  res.json({ success: true, data: updated[0] || await queryOne('SELECT * FROM hrms_payroll WHERE id = ?', [req.params.id]) });
});

/** Dashboard summary: active employees, on-leave today, payroll due. */
export const hrmsSummary = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'e.project_id', 'e.wing_id');
  const onLeave = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_employees e
      WHERE e.is_active = 1
        AND (e.status = 'on_leave' OR EXISTS (
          SELECT 1 FROM hrms_leave_requests lr
           WHERE lr.employee_id = e.id AND lr.status = 'approved'
             AND CURDATE() BETWEEN lr.from_date AND lr.to_date
        ))${scope.clause}`, scope.params);
  const active = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_employees e WHERE e.is_active = 1 AND e.status = 'active'${scope.clause}`, scope.params);
  const pendingLeave = await queryOne(
    `SELECT COUNT(*) AS c FROM hrms_leave_requests lr
       JOIN hrms_employees e ON e.id = lr.employee_id
      WHERE lr.status = 'pending'${scope.clause}`, scope.params);
  const identity = await queryOne(
    `SELECT COUNT(*) AS total, COALESCE(SUM(e.user_id IS NOT NULL), 0) AS linked
       FROM hrms_employees e WHERE 1=1${scope.clause}`, scope.params);
  const month = new Date().toISOString().slice(0, 7);
  const payroll = await queryOne(
    `SELECT COALESCE(SUM(p.net_pay), 0) AS net_due, COALESCE(SUM(p.paid_amount), 0) AS paid, COUNT(*) AS records,
            SUM(CASE WHEN p.payment_status = 'pending' THEN p.net_pay ELSE 0 END) AS pending_net
       FROM hrms_payroll p JOIN hrms_employees e ON e.id = p.employee_id
      WHERE p.payroll_month = ?${scope.clause}`, [month, ...scope.params]);
  res.json({ success: true, data: {
    onLeave: Number(onLeave.c), active: Number(active.c), pendingLeave: Number(pendingLeave.c),
    totalEmployees: Number(identity.total), linkedLogins: Number(identity.linked), month, payroll,
  } });
});
