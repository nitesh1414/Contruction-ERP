import { query, queryOne } from '../db/pool.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { unauthorized, asyncHandler } from '../utils/helpers.js';

/**
 * Authentication middleware — verifies the Bearer JWT, loads the user,
 * their roles and permission codes onto req.user.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token');
  }

  const user = await queryOne(
    'SELECT id, employee_code, name, email, phone, profile_photo, status FROM users WHERE id = ?',
    [payload.sub]
  );
  if (!user) throw unauthorized('User no longer exists');
  if (user.status !== 'active') throw unauthorized('User account is inactive');

  const roles = await query(
    `SELECT r.id, r.name, r.code, r.is_system FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? AND r.is_active = 1`,
    [user.id]
  );

  const permissions = await query(
    `SELECT DISTINCT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = 1`,
    [user.id]
  );

  const isSuperAdmin = roles.some((r) => r.code === 'super_admin');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    employeeCode: user.employee_code,
    profilePhoto: user.profile_photo,
    roles,
    isSuperAdmin,
    permissions: new Set(permissions.map((p) => p.code)),
  };
  next();
});
