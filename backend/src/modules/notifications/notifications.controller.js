import { query, queryOne } from '../../db/pool.js';
import { asyncHandler, notFound, nullify } from '../../utils/helpers.js';
import { notify } from '../../utils/notify.js';
import { CrudController } from '../../utils/crud.js';

export const listMine = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const onlyUnread = req.query.unread === '1';
  const rows = await query(
    `SELECT * FROM notifications WHERE user_id = ? ${onlyUnread ? 'AND is_read = 0' : ''} ORDER BY id DESC LIMIT ?`,
    [req.user.id, limit]);
  const unread = await queryOne('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ success: true, data: rows, unreadCount: Number(unread.c) });
});

export const markRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
});

/** Admin broadcast to selected users or all users. */
export const broadcast = asyncHandler(async (req, res) => {
  const { userIds, title, message, type = 'info' } = req.body;
  if (!title || !message) throw notFound('title and message required');
  let ids = userIds;
  if (!Array.isArray(ids) || !ids.length) {
    const all = await query("SELECT id FROM users WHERE status = 'active'");
    ids = all.map((u) => u.id);
  }
  await notify(ids, { title, message, type });
  res.json({ success: true, message: `Notification sent to ${ids.length} user(s)` });
});

export const settings = new CrudController({
  table: 'notification_settings', module: 'notifications',
  fields: ['event_key', 'label', 'enabled'],
  searchColumns: ['event_key', 'label'], defaultSort: 'event_key ASC',
});

export const registerPushToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') throw notFound('token required');
  await query(
    'INSERT INTO user_push_tokens (user_id, expo_push_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE expo_push_token = VALUES(expo_push_token)',
    [req.user.id, token.slice(0, 120)]);
  res.json({ success: true });
});
