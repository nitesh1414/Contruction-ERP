import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, forbidden, notFound, conflict, parsePagination, orderByClause, searchClause, nullify,
} from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';
import { assertProjectAccess } from '../../middleware/permissions.js';
import { validateEmployeeMasterValues, getDesignationRoleId } from '../hrms/hrms-masters.js';

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
const HR_EMPLOYMENT_TYPES = new Set(['permanent', 'contract', 'probation', 'intern']);
const HR_STATUSES = new Set(['active', 'on_leave', 'resigned', 'terminated']);
const HR_GENDERS = new Set(['male', 'female', 'other']);

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

function buildEmployeeFromUser(body, generatedCode) {
  const input = body.employee && typeof body.employee === 'object' ? body.employee : {};
  const employmentType = input.employment_type || 'permanent';
  const status = input.status || 'active';
  const gender = input.gender || null;
  if (!HR_EMPLOYMENT_TYPES.has(employmentType)) throw badRequest('Invalid employee employment type');
  if (!HR_STATUSES.has(status)) throw badRequest('Invalid employee status');
  if (gender && !HR_GENDERS.has(gender)) throw badRequest('Invalid employee gender');
  return {
    employee_code: normalizeCode(input.employee_code || body.employee_code) || generatedCode,
    name: String(input.name || body.name || '').trim(),
    email: normalizeEmail(input.email !== undefined ? input.email : body.email),
    phone: nullify(input.phone !== undefined ? input.phone : body.phone),
    date_of_birth: nullify(input.date_of_birth),
    date_of_joining: nullify(input.date_of_joining),
    department: nullify(input.department),
    designation: nullify(input.designation),
    project_id: nullify(input.project_id),
    wing_id: nullify(input.wing_id),
    employment_type: employmentType,
    status,
    gender,
    bank_account: nullify(input.bank_account),
    pan_number: nullify(input.pan_number),
    aadhaar_number: nullify(input.aadhaar_number),
    address: nullify(input.address),
    remarks: nullify(input.remarks),
    is_active: input.is_active === undefined ? 1 : (truthy(input.is_active) ? 1 : 0),
  };
}

async function findEmployeeConflict(conn, employee) {
  const clauses = [];
  const params = [];
  if (employee.employee_code) { clauses.push('employee_code = ?'); params.push(employee.employee_code); }
  if (employee.email) { clauses.push('email = ?'); params.push(employee.email); }
  if (!clauses.length) return null;
  const [rows] = await conn.query(
    `SELECT id, user_id, employee_code, email, project_id, wing_id FROM hrms_employees WHERE ${clauses.join(' OR ')} FOR UPDATE`, params
  );
  const ids = [...new Set(rows.map((row) => Number(row.id)))];
  if (ids.length > 1) throw conflict('Employee code and email belong to different employee records');
  return rows[0] || null;
}

async function assertUniqueUserFields(conn, { email, employeeCode, ignoreId = null }) {
  if (email) {
    const [rows] = await conn.query('SELECT id FROM users WHERE email = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE', [email, ignoreId]);
    if (rows[0]) throw conflict('A user with this email already exists');
  }
  if (employeeCode) {
    const [rows] = await conn.query('SELECT id FROM users WHERE employee_code = ? AND id <> COALESCE(?, 0) LIMIT 1 FOR UPDATE', [employeeCode, ignoreId]);
    if (rows[0]) throw conflict('A user with this employee code already exists');
  }
}

export const create = asyncHandler(async (req, res) => {
  const {
    employee_code, name, email: rawEmail, phone, password, status, roleIds = [], projectAccess = [],
    createEmployee = false,
  } = req.body;
  const email = normalizeEmail(rawEmail);
  const userName = String(name || '').trim();
  if (!userName || !email) throw badRequest('name and email are required');
  if (!password || String(password).length < 8) throw badRequest('password must be at least 8 characters');
  const wantsEmployee = truthy(createEmployee);
  if (wantsEmployee && !req.user.isSuperAdmin && !req.user.permissions.has('hrms.create')) {
    throw forbidden('HRMS → Create permission is required to create the linked employee record');
  }
  const generatedCode = normalizeCode(employee_code) || `EMP-${Date.now().toString(36).toUpperCase()}`;
  const employee = wantsEmployee ? buildEmployeeFromUser({ ...req.body, email }, generatedCode) : null;
  if (employee && !employee.name) throw badRequest('employee name is required');
  if (employee && status === 'inactive' && (!req.body.employee || req.body.employee.is_active === undefined)) employee.is_active = 0;
  if ((employee?.employee_code || normalizeCode(employee_code))?.length > 30) throw badRequest('employee_code must be at most 30 characters for a user login');
  if (employee?.email === null) employee.email = email;
  if (employee) await validateEmployeeMasterValues(employee);
  const designationRoleId = employee ? await getDesignationRoleId(employee.designation) : null;
  const normalizedRoleIds = await validateRoleIds(req, [
    ...(Array.isArray(roleIds) ? roleIds : []),
    ...(designationRoleId ? [designationRoleId] : []),
  ]);
  if (employee?.project_id) assertProjectAccess(req, Number(employee.project_id), employee.wing_id ? Number(employee.wing_id) : null);
  const accessEntries = Array.isArray(projectAccess) ? projectAccess : [];
  const effectiveProjectAccess = accessEntries.filter((entry) => entry && entry.project_id);
  if (employee?.project_id && !effectiveProjectAccess.some((entry) => Number(entry.project_id) === Number(employee.project_id))) {
    effectiveProjectAccess.push({ project_id: employee.project_id, wing_id: employee.wing_id || 0 });
  }
  for (const pa of effectiveProjectAccess) {
    assertProjectAccess(req, Number(pa.project_id), pa.wing_id ? Number(pa.wing_id) : null);
  }
  if (!req.user.isSuperAdmin && req.projectScope !== null && req.projectScope !== undefined
    && !effectiveProjectAccess.some((entry) => entry.project_id)) {
    throw forbidden('Assign the new user to at least one project within your scope');
  }

  const hash = await bcrypt.hash(String(password), 10);
  let result;
  try {
    result = await withTransaction(async (conn) => {
      await assertUniqueUserFields(conn, { email, employeeCode: employee?.employee_code || normalizeCode(employee_code) });
      const employeeMatch = employee ? await findEmployeeConflict(conn, employee) : null;
      if (employeeMatch?.project_id) assertProjectAccess(req, Number(employeeMatch.project_id), employeeMatch.wing_id ? Number(employeeMatch.wing_id) : null);
      if (employeeMatch?.user_id) {
        throw conflict('An employee with this code or email is already linked to another user');
      }
      const userEmployeeCode = employee?.employee_code || normalizeCode(employee_code);
      const [r] = await conn.query(
        'INSERT INTO users (employee_code, name, email, phone, password_hash, status) VALUES (?,?,?,?,?,?)',
        [userEmployeeCode, userName, email, nullify(phone), hash, status === 'inactive' ? 'inactive' : 'active']
      );
      const userId = r.insertId;
      for (const roleId of normalizedRoleIds) {
        await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [userId, roleId]);
      }
      for (const pa of effectiveProjectAccess) {
        await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [userId, pa.project_id, pa.wing_id || 0]);
      }

      let employeeId = null;
      let employeeCreated = false;
      if (employee) {
        employeeId = employeeMatch?.id || null;
        if (employeeMatch) {
          await conn.query(
            `UPDATE hrms_employees SET user_id = ?, employee_code = ?, name = ?, email = ?, phone = ?, is_active = ?,
               department = COALESCE(?, department), designation = COALESCE(?, designation),
               project_id = COALESCE(?, project_id), wing_id = COALESCE(?, wing_id)
             WHERE id = ?`,
            [userId, employee.employee_code, employee.name, employee.email, employee.phone, employee.is_active,
              employee.department, employee.designation, employee.project_id, employee.wing_id, employeeId]
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
        const linkedProjectId = employee.project_id || employeeMatch?.project_id;
        const linkedWingId = employee.wing_id || employeeMatch?.wing_id;
        if (linkedProjectId) {
          await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)',
            [userId, linkedProjectId, linkedWingId || 0]);
        }
      }
      return { userId, employeeId, employeeCreated };
    });
  } catch (error) {
    duplicateConflict(error, 'The email, employee code, or employee link is already in use');
  }
  await audit(req, {
    action: 'create', module: 'users', recordId: result.userId,
    newValue: { name: userName, email, roleIds: normalizedRoleIds, employee_id: result.employeeId, employee_created: result.employeeCreated },
  });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [result.userId]);
  const linkedEmployee = result.employeeId
    ? await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [result.employeeId])
    : null;
  res.status(201).json({
    success: true,
    data: { ...user, employee: linkedEmployee },
    meta: { employeeId: result.employeeId, employeeCreated: result.employeeCreated },
  });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, employee_code, email, name, phone, status, profile_photo FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await assertUserScope(req, req.params.id);
  const linkedEmployee = await queryOne(
    'SELECT id, employee_code, project_id, wing_id, status, is_active FROM hrms_employees WHERE user_id = ?',
    [req.params.id]
  );
  if (linkedEmployee) assertProjectAccess(req, linkedEmployee.project_id ? Number(linkedEmployee.project_id) : null, linkedEmployee.wing_id ? Number(linkedEmployee.wing_id) : null);

  const data = {};
  if (req.body.employee_code !== undefined) data.employee_code = normalizeCode(req.body.employee_code);
  if (req.body.name !== undefined) {
    data.name = String(req.body.name || '').trim();
    if (!data.name) throw badRequest('name cannot be empty');
  }
  if (req.body.email !== undefined) {
    data.email = normalizeEmail(req.body.email);
    if (!data.email) throw badRequest('email cannot be empty');
  }
  if (req.body.phone !== undefined) data.phone = nullify(req.body.phone);
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) throw badRequest('status must be active or inactive');
    data.status = req.body.status;
  }
  if (req.body.profile_photo !== undefined) data.profile_photo = nullify(req.body.profile_photo);

  const wantsEmployee = truthy(req.body.createEmployee) && !linkedEmployee;
  const desiredUserStatus = data.status !== undefined ? data.status : existing.status;
  let employeeData = null;
  let employeeInput = {};
  if (wantsEmployee) {
    if (!req.user.isSuperAdmin && !req.user.permissions.has('hrms.create')) {
      throw forbidden('HRMS → Create permission is required to create the linked employee record');
    }
    employeeInput = req.body.employee && typeof req.body.employee === 'object' ? req.body.employee : {};
    const generatedCode = normalizeCode(existing.employee_code || data.employee_code) || `EMP-${Date.now().toString(36).toUpperCase()}`;
    employeeData = buildEmployeeFromUser({
      ...req.body,
      employee: {
        ...employeeInput,
        employee_code: employeeInput.employee_code || data.employee_code || existing.employee_code,
        name: employeeInput.name || data.name || existing.name,
        email: employeeInput.email !== undefined ? employeeInput.email : (data.email !== undefined ? data.email : existing.email),
        phone: employeeInput.phone !== undefined ? employeeInput.phone : (data.phone !== undefined ? data.phone : existing.phone),
      },
    }, generatedCode);
    // The user account is the identity source for the shared login fields. Do not
    // let a nested employee payload create a second name, email, phone or code.
    employeeData.employee_code = normalizeCode(data.employee_code || existing.employee_code || employeeData.employee_code);
    employeeData.name = data.name !== undefined ? data.name : existing.name;
    employeeData.email = data.email !== undefined ? data.email : existing.email;
    employeeData.phone = data.phone !== undefined ? data.phone : existing.phone;
    data.employee_code = employeeData.employee_code;
    await validateEmployeeMasterValues(employeeData);
    const designationRoleId = await getDesignationRoleId(employeeData.designation);
    const designationRoleIds = await validateRoleIds(req, designationRoleId ? [designationRoleId] : [], { required: false });
    if (employeeData.employee_code.length > 30) throw badRequest('employee_code must be at most 30 characters for a user login');
    if (desiredUserStatus === 'inactive' && employeeInput.is_active === undefined) employeeData.is_active = 0;
    if (employeeData.project_id) assertProjectAccess(req, Number(employeeData.project_id), employeeData.wing_id ? Number(employeeData.wing_id) : null);
  }
  if (!Object.keys(data).length && !employeeData) {
    return res.json({ success: true, data: await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [req.params.id]) });
  }

  const effectiveCode = data.employee_code !== undefined ? data.employee_code : existing.employee_code;
  if (effectiveCode && effectiveCode.length > 30) throw badRequest('employee_code must be at most 30 characters for a user login');
  if (linkedEmployee && !effectiveCode) throw badRequest('A linked employee must have an employee code');
  let employeeLinkMeta = null;
  try {
    await withTransaction(async (conn) => {
      await assertUniqueUserFields(conn, { email: data.email !== undefined ? data.email : existing.email, employeeCode: effectiveCode, ignoreId: req.params.id });
      if (linkedEmployee && effectiveCode) {
        const [employeeRows] = await conn.query('SELECT id FROM hrms_employees WHERE employee_code = ? AND id <> ? LIMIT 1 FOR UPDATE', [effectiveCode, linkedEmployee.id]);
        if (employeeRows[0]) throw conflict('An employee with this code already exists');
      }
      if (linkedEmployee && data.email !== undefined) {
        const [employeeEmailRows] = await conn.query('SELECT id FROM hrms_employees WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE', [data.email, linkedEmployee.id]);
        if (employeeEmailRows[0]) throw conflict('An employee with this email already exists');
      }
      if (employeeData) {
        const employeeMatch = await findEmployeeConflict(conn, employeeData);
        if (employeeMatch?.project_id) assertProjectAccess(req, Number(employeeMatch.project_id), employeeMatch.wing_id ? Number(employeeMatch.wing_id) : null);
        if (employeeMatch?.user_id) throw conflict('An employee with this code or email is already linked to another user');
        let employeeId = employeeMatch?.id || null;
        if (employeeMatch) {
          const employeeUpdates = {
            user_id: Number(req.params.id),
            employee_code: employeeData.employee_code,
            name: employeeData.name,
            email: employeeData.email,
            phone: employeeData.phone,
            is_active: employeeInput.is_active === undefined ? (desiredUserStatus === 'active' ? 1 : 0) : employeeData.is_active,
          };
          for (const field of ['date_of_birth', 'date_of_joining', 'department', 'designation', 'project_id', 'wing_id',
            'bank_account', 'pan_number', 'aadhaar_number', 'address', 'gender', 'employment_type', 'status', 'remarks']) {
            if (employeeInput[field] !== undefined && employeeInput[field] !== '') employeeUpdates[field] = employeeData[field];
          }
          const employeeKeys = Object.keys(employeeUpdates);
          await conn.query(`UPDATE hrms_employees SET ${employeeKeys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
            [...employeeKeys.map((key) => employeeUpdates[key]), employeeMatch.id]);
        } else {
          const keys = Object.keys(employeeData);
          const [employeeResult] = await conn.query(
            `INSERT INTO hrms_employees (${keys.join(',')}, user_id)
             VALUES (${keys.map(() => '?').join(',')}, ?)`, [...keys.map((key) => employeeData[key]), req.params.id]
          );
          employeeId = employeeResult.insertId;
        }
        const linkedProjectId = employeeData.project_id || employeeMatch?.project_id;
        const linkedWingId = employeeData.wing_id || employeeMatch?.wing_id;
        if (linkedProjectId) {
          await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)',
            [req.params.id, linkedProjectId, linkedWingId || 0]);
        }
        for (const roleId of designationRoleIds) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [req.params.id, roleId]);
        }
        employeeLinkMeta = { employeeId, created: !employeeMatch, designationRoleId: designationRoleId || null };
      }

      const userKeys = Object.keys(data);
      if (userKeys.length) {
        await conn.query(`UPDATE users SET ${userKeys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...userKeys.map((key) => data[key]), req.params.id]);
      }
      if (linkedEmployee) {
        const employeeData = {};
        for (const key of ['employee_code', 'name', 'email', 'phone']) {
          if (data[key] !== undefined) employeeData[key] = data[key];
        }
        if (data.status !== undefined) employeeData.is_active = data.status === 'active' ? 1 : 0;
        const employeeKeys = Object.keys(employeeData);
        if (employeeKeys.length) {
          await conn.query(`UPDATE hrms_employees SET ${employeeKeys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
            [...employeeKeys.map((key) => employeeData[key]), linkedEmployee.id]);
        }
      }
    });
  } catch (error) {
    duplicateConflict(error, 'The email or employee code is already in use');
  }
  await audit(req, {
    action: 'update', module: 'users', recordId: req.params.id,
    oldValue: existing, newValue: { ...data, employee_link: employeeLinkMeta },
  });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [req.params.id]);
  const employee = employeeLinkMeta
    ? await queryOne('SELECT * FROM hrms_employees WHERE id = ?', [employeeLinkMeta.employeeId])
    : null;
  res.json({ success: true, data: { ...user, employee }, meta: employeeLinkMeta || undefined });
});

export const setRoles = asyncHandler(async (req, res) => {
  const { roleIds } = req.body;
  if (!Array.isArray(roleIds)) throw badRequest('roleIds must be an array');
  const linkedEmployee = await queryOne('SELECT designation FROM hrms_employees WHERE user_id = ?', [req.params.id]);
  const designationRoleId = linkedEmployee ? await getDesignationRoleId(linkedEmployee.designation) : null;
  const normalizedRoleIds = await validateRoleIds(req, [
    ...roleIds,
    ...(designationRoleId ? [designationRoleId] : []),
  ], { required: false });
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
