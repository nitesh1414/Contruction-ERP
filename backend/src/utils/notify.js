import { query } from '../db/pool.js';

/**
 * Create an in-app notification for one or many users.
 * Mobile clients poll /api/notifications and also register Expo push tokens;
 * the token is stored on the user record so a push worker can relay it.
 */
export async function notify(userIds, { title, message, type = 'info', module = null, recordId = null }) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ids.length) return;
  const values = ids.map(() => '(?,?,?,?,?,?,0)').join(',');
  const params = ids.flatMap((id) => [id, title, message, type, module, recordId != null ? String(recordId) : null]);
  await query(`INSERT INTO notifications (user_id, title, message, type, module, record_id, is_read) VALUES ${values}`, params);
}

/** Notify users that hold any of the given permission codes (kept simple). */
export async function notifyByPermission(permissionCode, payload) {
  const users = await query(
    `SELECT DISTINCT ur.user_id FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.code = ?`,
    [permissionCode]
  );
  const ids = users.map((u) => u.user_id);
  if (ids.length) await notify(ids, payload);
}

/** Check whether a notification event is enabled in settings. */
export async function isEventEnabled(eventKey) {
  const rows = await query('SELECT enabled FROM notification_settings WHERE event_key = ?', [eventKey]);
  if (!rows.length) return true; // default enabled when no setting row
  return rows[0].enabled === 1;
}
