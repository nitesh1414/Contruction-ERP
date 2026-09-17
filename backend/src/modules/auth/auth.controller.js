import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query, queryOne, withTransaction } from '../../db/pool.js';
import { config } from '../../config/index.js';
import {
  asyncHandler, badRequest, unauthorized, notFound, nowToken, sha256,
} from '../../utils/helpers.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, durationToMs,
} from '../../utils/jwt.js';
import { audit } from '../../utils/audit.js';

const REFRESH_DAYS = Math.max(1, Math.floor(durationToMs(config.jwt.refreshExpiresIn) / 86400000));

async function issueTokens(user, deviceInfo) {
  const jti = nowToken(16);
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, jti);
  await query('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < NOW()', [user.id]);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [user.id, sha256(refreshToken), (deviceInfo || '').slice(0, 250), REFRESH_DAYS]
  );
  return { accessToken, refreshToken };
}

async function loadUserWithRoles(userId) {
  const user = await queryOne(
    `SELECT id, employee_code, name, email, phone, profile_photo, status, last_login_at FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) return null;
  const roles = await query(
    `SELECT r.id, r.name, r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? AND r.is_active = 1`,
    [userId]
  );
  const permissions = await query(
    `SELECT DISTINCT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = 1`,
    [userId]
  );
  const projects = await query(
    `SELECT up.project_id, up.wing_id, p.name AS project_name, w.name AS wing_name
       FROM user_projects up
       JOIN projects p ON p.id = up.project_id
       LEFT JOIN wings w ON w.id = up.wing_id
      WHERE up.user_id = ?`,
    [userId]
  );
  const employee = await queryOne(
    `SELECT e.id, e.employee_code, e.department, e.designation, e.date_of_joining,
            e.employment_type, e.status, e.is_active, e.project_id, e.wing_id,
            p.name AS project_name, w.name AS wing_name
       FROM hrms_employees e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN wings w ON w.id = e.wing_id
      WHERE e.user_id = ?`, [userId]
  );
  return {
    ...user,
    roles,
    permissions: permissions.map((p) => p.code),
    isSuperAdmin: roles.some((r) => r.code === 'super_admin'),
    projectAccess: projects,
    employee,
  };
}

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isString().isLength({ min: 1 }).withMessage('Password required'),
];

export const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw badRequest('Validation failed', errors.array());

  const { email, password } = req.body;
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Invalid email or password');
  }
  if (user.status !== 'active') throw unauthorized('Account is inactive. Contact your administrator.');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const tokens = await issueTokens(user, req.headers['user-agent']);
  req.user = { id: user.id, name: user.name };
  await audit(req, { action: 'login', module: 'auth', recordId: user.id });

  const profile = await loadUserWithRoles(user.id);
  res.json({ success: true, data: { user: profile, ...tokens } });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw badRequest('refreshToken required');
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
  const stored = await queryOne(
    'SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
    [payload.sub, sha256(refreshToken)]
  );
  if (!stored) throw unauthorized('Refresh token revoked or expired');
  const user = await queryOne('SELECT * FROM users WHERE id = ? AND status = "active"', [payload.sub]);
  if (!user) throw unauthorized('User inactive');

  // Rotate refresh token
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [stored.id]);
  const tokens = await issueTokens(user, req.headers['user-agent']);
  const profile = await loadUserWithRoles(user.id);
  res.json({ success: true, data: { user: profile, ...tokens } });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = ?', [req.user.id, sha256(refreshToken)]);
  }
  await audit(req, { action: 'logout', module: 'auth', recordId: req.user.id });
  res.json({ success: true, message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  const profile = await loadUserWithRoles(req.user.id);
  res.json({ success: true, data: profile });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const name = req.body.name === undefined ? undefined : String(req.body.name || '').trim();
  const phone = req.body.phone === undefined ? undefined : req.body.phone;
  const profilePhoto = req.body.profile_photo === undefined ? undefined : req.body.profile_photo;
  if (name !== undefined && !name) throw badRequest('name cannot be empty');
  await withTransaction(async (conn) => {
    const [users] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    if (!users[0]) throw notFound('User not found');
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone === '' ? null : phone); }
    if (profilePhoto !== undefined) { fields.push('profile_photo = ?'); values.push(profilePhoto === '' ? null : profilePhoto); }
    if (fields.length) {
      await conn.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, req.user.id]);
    }
    if (name !== undefined || phone !== undefined) {
      const shared = [];
      const sharedValues = [];
      if (name !== undefined) { shared.push('name = ?'); sharedValues.push(name); }
      if (phone !== undefined) { shared.push('phone = ?'); sharedValues.push(phone === '' ? null : phone); }
      if (shared.length) await conn.query(`UPDATE hrms_employees SET ${shared.join(', ')} WHERE user_id = ?`, [...sharedValues, req.user.id]);
    }
  });
  await audit(req, { action: 'update', module: 'users', recordId: req.user.id, newValue: { name, phone } });
  const profile = await loadUserWithRoles(req.user.id);
  res.json({ success: true, data: profile });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) throw badRequest('New password must be at least 8 characters');
  const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(currentPassword || '', user.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    await conn.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [req.user.id]);
  });
  await audit(req, { action: 'change_password', module: 'auth', recordId: req.user.id });
  res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw badRequest('Email required');
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  // Always respond success to avoid user enumeration
  if (!user) return res.json({ success: true, message: 'If the email exists, a reset link has been generated.' });

  const token = nowToken(32);
  const minutes = config.resetTokenExpiresMinutes;
  await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
    [user.id, sha256(token), minutes]
  );
  const resetUrl = `${config.frontendBaseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

  // No SMTP dependency: surface the link via notification + config (admin can deliver it).
  await query(
    'INSERT INTO notifications (user_id, title, message, type, module) VALUES (?,?,?,?,?)',
    [user.id, 'Password reset requested', `A password reset was requested for your account. Use this link within ${minutes} minutes: ${resetUrl}`, 'warning', 'auth']
  );
  const response = { success: true, message: 'If the email exists, a reset link has been generated.' };
  if (config.env !== 'production') response.resetUrl = resetUrl; // dev convenience
  res.json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) throw badRequest('email, token and newPassword are required');
  if (String(newPassword).length < 8) throw badRequest('New password must be at least 8 characters');
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw notFound('Invalid reset request');
  const row = await queryOne(
    'SELECT * FROM password_reset_tokens WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [user.id, sha256(token)]
  );
  if (!row) throw badRequest('Reset token is invalid or expired');
  const hash = await bcrypt.hash(newPassword, 10);
  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    await conn.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
    await conn.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [user.id]);
  });
  res.json({ success: true, message: 'Password has been reset. You can now log in.' });
});

/** Simple user directory for pickers (active users). */
export const userDirectory = asyncHandler(async (_req, res) => {
  const users = await query(
    `SELECT u.id, u.name, u.email, u.employee_code FROM users u WHERE u.status = 'active' ORDER BY u.name ASC LIMIT 500`
  );
  res.json({ success: true, data: users });
});
