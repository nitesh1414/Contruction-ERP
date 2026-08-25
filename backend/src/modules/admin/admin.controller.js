import { query } from '../../db/pool.js';
import { asyncHandler, parsePagination } from '../../utils/helpers.js';
import { sendCsv } from '../../utils/csv.js';

export const auditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { defaultLimit: 50 });
  const conditions = [];
  const params = [];
  if (req.query.module) { conditions.push('al.module = ?'); params.push(req.query.module); }
  if (req.query.userId) { conditions.push('al.user_id = ?'); params.push(req.query.userId); }
  if (req.query.action) { conditions.push('al.action = ?'); params.push(req.query.action); }
  if (req.query.from) { conditions.push('al.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('al.created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }
  if (req.query.search) {
    conditions.push('(al.user_name LIKE ? OR al.record_id LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    `SELECT al.* FROM audit_logs al ${whereSql} ORDER BY al.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  const [countRow] = await query(`SELECT COUNT(*) AS total FROM audit_logs al ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(countRow[0]?.total ?? (Array.isArray(countRow) ? countRow[0].total : 0)), totalPages: Math.ceil((Array.isArray(countRow) ? countRow[0].total : countRow.total) / limit) } });
});

export const auditLogsExport = asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, user_name, action, module, record_id, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT 50000');
  sendCsv(res, 'audit-logs.csv', rows);
});
