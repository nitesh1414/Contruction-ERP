import { query, queryOne } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { notify, isEventEnabled } from '../../utils/notify.js';

const SELECT = `SELECT m.*, p.name AS project_name, w.name AS wing_name, u.name AS responsible_name
  FROM milestones m JOIN projects p ON p.id = m.project_id
  LEFT JOIN wings w ON w.id = m.wing_id LEFT JOIN users u ON u.id = m.responsible_user_id`;

/** Marks milestones delayed when target date passed and not completed. */
export async function markDelayedMilestones() {
  await query(
    `UPDATE milestones SET status = 'delayed'
      WHERE status IN ('pending','in_progress') AND target_date IS NOT NULL AND target_date < CURDATE()`
  );
}

export const list = asyncHandler(async (req, res) => {
  await markDelayedMilestones();
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('m.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('m.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.status) { conditions.push('m.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(m.name LIKE ? OR m.description LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'm.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(`${SELECT} ${whereSql} ORDER BY m.target_date IS NULL, m.target_date ASC, m.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM milestones m ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

const FIELDS = ['project_id', 'wing_id', 'name', 'description', 'start_date', 'target_date', 'completion_date', 'percentage', 'status', 'responsible_user_id', 'remarks'];

export const create = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.project_id || !data.name) throw badRequest('project_id and name are required');
  assertProjectAccess(req, Number(data.project_id), data.wing_id ? Number(data.wing_id) : null);
  data.created_by = req.user.id;
  const keys = Object.keys(data);
  const r = await query(`INSERT INTO milestones (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'milestones', recordId: r.insertId, newValue: data });
  const row = await queryOne(`${SELECT} WHERE m.id = ?`, [r.insertId]);
  res.status(201).json({ success: true, data: row });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Milestone not found');
  assertProjectAccess(req, existing.project_id, existing.wing_id);
  const data = {};
  for (const f of FIELDS) if (f !== 'project_id' && req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  // sensible auto-transitions
  if (data.percentage !== undefined && Number(data.percentage) >= 100 && data.status === undefined) {
    data.status = 'completed';
    data.completion_date = data.completion_date || new Date().toISOString().slice(0, 10);
  }
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE milestones SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'milestones', recordId: req.params.id, oldValue: existing, newValue: data });

  if (data.status === 'delayed' && existing.status !== 'delayed' && existing.responsible_user_id) {
    if (await isEventEnabled('milestone_delayed')) {
      await notify(existing.responsible_user_id, {
        title: `Milestone delayed: ${existing.name}`,
        message: `Milestone "${existing.name}" has been marked delayed.`,
        type: 'warning', module: 'milestones', recordId: req.params.id,
      });
    }
  }
  res.json({ success: true, data: await queryOne(`${SELECT} WHERE m.id = ?`, [req.params.id]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Milestone not found');
  await query('DELETE FROM milestones WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'milestones', recordId: req.params.id, oldValue: { name: existing.name } });
  res.json({ success: true, message: 'Milestone deleted' });
});

export const summary = asyncHandler(async (req, res) => {
  await markDelayedMilestones();
  const scope = projectScopeSql(req, 'project_id');
  const rows = await query(
    `SELECT project_id, status, COUNT(*) AS count FROM milestones WHERE 1=1 ${scope.clause} GROUP BY project_id, status`, scope.params);
  res.json({ success: true, data: rows });
});
