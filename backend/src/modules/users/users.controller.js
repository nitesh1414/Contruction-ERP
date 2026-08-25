import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, conflict, parsePagination, orderByClause, searchClause, nullify,
} from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';

const USER_COLUMNS = `u.id, u.employee_code, u.name, u.email, u.phone, u.profile_photo, u.status, u.last_login_at, u.created_at`;

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order } = parsePagination(req);
  const { where, params } = searchClause(req.query.search, ['u.name', 'u.email', 'u.employee_code', 'u.phone']);
  const conditions = where ? [where] : [];
  if (req.query.status) { conditions.push('u.status = ?'); params.push(req.query.status); }
  if (req.query.roleId) { conditions.push('EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ?)'); params.push(req.query.roleId); }
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
  const roles = await query('SELECT r.id, r.name, r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?', [req.params.id]);
  const projects = await query(
    `SELECT up.id, up.project_id, up.wing_id, p.name AS project_name, w.name AS wing_name
       FROM user_projects up JOIN projects p ON p.id = up.project_id
       LEFT JOIN wings w ON w.id = up.wing_id WHERE up.user_id = ?`, [req.params.id]);
  res.json({ success: true, data: { ...user, roles, projectAccess: projects } });
});

export const create = asyncHandler(async (req, res) => {
  const { employee_code, name, email, phone, password, status, roleIds = [], projectAccess = [] } = req.body;
  if (!name || !email) throw badRequest('name and email are required');
  if (!password || String(password).length < 8) throw badRequest('password must be at least 8 characters');
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw conflict('A user with this email already exists');

  const hash = await bcrypt.hash(String(password), 10);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO users (employee_code, name, email, phone, password_hash, status) VALUES (?,?,?,?,?,?)',
      [nullify(employee_code), name, email, nullify(phone), hash, status === 'inactive' ? 'inactive' : 'active']
    );
    const userId = r.insertId;
    for (const roleId of roleIds) {
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [userId, roleId]);
    }
    for (const pa of projectAccess) {
      await conn.query('INSERT IGNORE INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)', [userId, pa.project_id, pa.wing_id || 0]);
    }
    return userId;
  });
  await audit(req, { action: 'create', module: 'users', recordId: id, newValue: { name, email, roleIds } });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
  res.status(201).json({ success: true, data: user });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, email, name, status FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  const { employee_code, name, phone, status, profile_photo } = req.body;
  await query(
    `UPDATE users SET employee_code = COALESCE(?, employee_code), name = COALESCE(?, name),
       phone = COALESCE(?, phone), status = COALESCE(?, status), profile_photo = COALESCE(?, profile_photo)
     WHERE id = ?`,
    [nullify(employee_code), nullify(name), nullify(phone), ['active', 'inactive'].includes(status) ? status : null, nullify(profile_photo), req.params.id]
  );
  await audit(req, { action: 'update', module: 'users', recordId: req.params.id, oldValue: existing, newValue: req.body });
  const user = await queryOne(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [req.params.id]);
  res.json({ success: true, data: user });
});

export const setRoles = asyncHandler(async (req, res) => {
  const { roleIds } = req.body;
  if (!Array.isArray(roleIds)) throw badRequest('roleIds must be an array');
  const existing = await queryOne('SELECT id, name FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [req.params.id]);
    for (const roleId of roleIds) {
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)', [req.params.id, roleId]);
    }
  });
  await audit(req, { action: 'update', module: 'users', recordId: req.params.id, newValue: { roleIds } });
  res.json({ success: true, message: 'Roles updated' });
});

export const setProjectAccess = asyncHandler(async (req, res) => {
  const { entries } = req.body; // [{project_id, wing_id}]
  if (!Array.isArray(entries)) throw badRequest('entries must be an array');
  const existing = await queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('User not found');
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
  await query('DELETE FROM users WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'users', recordId: req.params.id, oldValue: { email: existing.email } });
  res.json({ success: true, message: 'User deleted' });
});

export const exportCsv = asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT u.employee_code, u.name, u.email, u.phone, u.status,
       (SELECT GROUP_CONCAT(r.name SEPARATOR ', ') FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = u.id) AS roles
     FROM users u ORDER BY u.name`
  );
  sendCsv(res, 'users.csv', rows);
});
