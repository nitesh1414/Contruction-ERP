import { query } from '../db/pool.js';

/**
 * Write an audit log entry.
 * audit(req, { action: 'create', module: 'projects', recordId, oldValue, newValue })
 */
export async function audit(req, { action, module, recordId = null, oldValue = null, newValue = null }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, action, module, record_id, old_value, new_value, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        req.user?.id ?? null,
        req.user?.name ?? null,
        action,
        module,
        recordId != null ? String(recordId) : null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        req.ip || req.headers['x-forwarded-for'] || null,
        (req.headers['user-agent'] || '').slice(0, 250),
      ]
    );
  } catch (err) {
    // auditing must never break the request
    console.error('[audit] failed:', err.message);
  }
}
