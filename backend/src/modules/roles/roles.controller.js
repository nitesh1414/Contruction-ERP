import { query, queryOne, withTransaction } from '../../db/pool.js';
import { asyncHandler, badRequest, notFound, conflict, nullify } from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';

export const listRoles = asyncHandler(async (_req, res) => {
  const roles = await query(
    `SELECT r.*, (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
            (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.name`
  );
  res.json({ success: true, data: roles });
});

export const getRole = asyncHandler(async (req, res) => {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [req.params.id]);
  if (!role) throw notFound('Role not found');
  const permissions = await query('SELECT permission_id FROM role_permissions WHERE role_id = ?', [req.params.id]);
  const users = await query(
    `SELECT u.id, u.name, u.email FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role_id = ? ORDER BY u.name LIMIT 100`, [req.params.id]);
  res.json({ success: true, data: { ...role, permissionIds: permissions.map((p) => p.permission_id), users } });
});

export const listPermissions = asyncHandler(async (_req, res) => {
  const permissions = await query('SELECT * FROM permissions ORDER BY module, action');
  const grouped = {};
  for (const p of permissions) {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  }
  res.json({ success: true, data: { permissions, grouped } });
});

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const createRole = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name || !String(name).trim()) throw badRequest('Role name is required');
  const code = slug(name);
  const exists = await queryOne('SELECT id FROM roles WHERE name = ? OR code = ?', [name.trim(), code]);
  if (exists) throw conflict('A role with this name already exists');
  const result = await query('INSERT INTO roles (name, code, description) VALUES (?,?,?)', [name.trim(), code, nullify(description)]);
  await audit(req, { action: 'create', module: 'roles', recordId: result.insertId, newValue: { name } });
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [result.insertId]);
  res.status(201).json({ success: true, data: role });
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [req.params.id]);
  if (!role) throw notFound('Role not found');
  const { name, description, is_active } = req.body;
  if (role.is_system && is_active === false) throw badRequest('System roles cannot be deactivated');
  await query('UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?',
    [name ? String(name).trim() : null, description !== undefined ? String(description) : null, is_active === undefined ? null : (is_active ? 1 : 0), req.params.id]);
  await audit(req, { action: 'update', module: 'roles', recordId: req.params.id, newValue: req.body });
  const updated = await queryOne('SELECT * FROM roles WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

export const setRolePermissions = asyncHandler(async (req, res) => {
  const { permissionIds } = req.body;
  if (!Array.isArray(permissionIds)) throw badRequest('permissionIds must be an array');
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [req.params.id]);
  if (!role) throw notFound('Role not found');
  if (role.code === 'super_admin') throw badRequest('Super Admin always holds every permission');

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    for (const pid of permissionIds) {
      await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)', [req.params.id, pid]);
    }
  });
  await audit(req, { action: 'update_permissions', module: 'roles', recordId: req.params.id, newValue: { count: permissionIds.length } });
  res.json({ success: true, message: 'Permissions updated' });
});

export const deleteRole = asyncHandler(async (req, res) => {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [req.params.id]);
  if (!role) throw notFound('Role not found');
  if (role.is_system) throw badRequest('System roles cannot be deleted');
  const usage = await queryOne('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?', [req.params.id]);
  if (usage.c > 0) throw conflict('Role is assigned to users — reassign them first');
  await query('DELETE FROM roles WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'roles', recordId: req.params.id, oldValue: { name: role.name } });
  res.json({ success: true, message: 'Role deleted' });
});
