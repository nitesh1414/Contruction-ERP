import { query, queryOne } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { registerFile } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { notify, notifyByPermission, isEventEnabled } from '../../utils/notify.js';
import { CrudController } from '../../utils/crud.js';

export const categories = new CrudController({
  table: 'issue_categories', module: 'issues',
  fields: ['name', 'description', 'is_active'],
  searchColumns: ['name'], defaultSort: 'name ASC',
});

const SELECT = `SELECT i.*, p.name AS project_name, w.name AS wing_name, f.name AS floor_name,
  c.name AS category_name, ru.name AS raised_by_name, au.name AS assigned_to_name
  FROM issues i
  JOIN projects p ON p.id = i.project_id
  LEFT JOIN wings w ON w.id = i.wing_id
  LEFT JOIN floors f ON f.id = i.floor_id
  LEFT JOIN issue_categories c ON c.id = i.category_id
  LEFT JOIN users ru ON ru.id = i.raised_by
  LEFT JOIN users au ON au.id = i.assigned_to`;

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('i.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('i.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.status) { conditions.push('i.status = ?'); params.push(req.query.status); }
  if (req.query.priority) { conditions.push('i.priority = ?'); params.push(req.query.priority); }
  if (req.query.categoryId) { conditions.push('i.category_id = ?'); params.push(req.query.categoryId); }
  if (req.query.assignedToId) { conditions.push('i.assigned_to = ?'); params.push(req.query.assignedToId); }
  if (req.query.overdue === '1') { conditions.push("i.due_date < CURDATE() AND i.status NOT IN ('resolved','closed')"); }
  if (req.query.search) {
    conditions.push('(i.title LIKE ? OR i.description LIKE ? OR i.issue_number LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'i.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(`${SELECT} ${whereSql} ORDER BY FIELD(i.priority,'critical','high','medium','low'), i.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM issues i ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const issue = await queryOne(`${SELECT} WHERE i.id = ?`, [req.params.id]);
  if (!issue) throw notFound('Issue not found');
  const comments = await query(
    `SELECT ic.*, u.name AS user_name FROM issue_comments ic LEFT JOIN users u ON u.id = ic.user_id WHERE ic.issue_id = ? ORDER BY ic.id`, [issue.id]);
  const photos = await query(
    `SELECT id, file_path, original_name, file_type, source FROM file_uploads WHERE related_module = 'issues' AND related_id = ? ORDER BY id`, [issue.id]);
  res.json({ success: true, data: { ...issue, comments, photos } });
});

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.project_id || !b.title) throw badRequest('project_id and title are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);

  if (b.client_ref) {
    const dup = await queryOne('SELECT id FROM issues WHERE client_ref = ?', [b.client_ref]);
    if (dup) return res.json({ success: true, data: await queryOne(`${SELECT} WHERE i.id = ?`, [dup.id]), duplicate: true });
  }

  const status = b.assigned_to ? 'assigned' : (b.status || 'open');
  const r = await query(
    `INSERT INTO issues (issue_number, project_id, wing_id, floor_id, location, category_id, priority, title, description, latitude, longitude, raised_by, assigned_to, due_date, status, remarks, client_ref)
     VALUES ('TMP',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.project_id, nullify(b.wing_id), nullify(b.floor_id), nullify(b.location), nullify(b.category_id),
    b.priority || 'medium', b.title, nullify(b.description), nullify(b.latitude), nullify(b.longitude),
    req.user.id, nullify(b.assigned_to), nullify(b.due_date), status, nullify(b.remarks), nullify(b.client_ref)]
  );
  const id = r.insertId;
  await query('UPDATE issues SET issue_number = ? WHERE id = ?', [businessNumber('issue', id), id]);

  if (req.files?.length) {
    for (const file of req.files) {
      await registerFile({ file, module: 'issues', relatedId: id, source: b.photo_source === 'upload' ? 'upload' : 'camera', userId: req.user.id });
    }
  }
  await audit(req, { action: 'create', module: 'issues', recordId: id, newValue: { title: b.title, priority: b.priority } });

  const issueNumber = businessNumber('issue', id);
  if (await isEventEnabled('issue_created')) {
    await notifyByPermission('issues.view', {
      title: `New issue ${issueNumber}: ${b.title}`,
      message: `Issue "${b.title}" (${b.priority || 'medium'} priority) was raised.`,
      type: 'warning', module: 'issues', recordId: id,
    });
  }
  if (b.assigned_to && (await isEventEnabled('issue_assigned'))) {
    await notify(b.assigned_to, {
      title: `Issue assigned: ${issueNumber}`,
      message: `You have been assigned issue "${b.title}".`,
      type: 'info', module: 'issues', recordId: id,
    });
  }
  res.status(201).json({ success: true, data: await queryOne(`${SELECT} WHERE i.id = ?`, [id]) });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM issues WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Issue not found');
  assertProjectAccess(req, existing.project_id, existing.wing_id);
  const allowed = ['title', 'description', 'wing_id', 'floor_id', 'location', 'category_id', 'priority', 'due_date', 'remarks', 'latitude', 'longitude'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  // assignment/status flows handled separately but allowed here as convenience:
  if (req.body.assigned_to !== undefined) data.assigned_to = nullify(req.body.assigned_to);
  if (req.body.status !== undefined) data.status = req.body.status;
  if (data.status === 'resolved') data.resolved_at = new Date();
  if (data.status === 'closed') data.closed_at = new Date();
  if (req.body.resolution !== undefined) data.resolution = nullify(req.body.resolution);
  if (data.assigned_to && data.status === undefined && existing.status === 'open') data.status = 'assigned';

  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE issues SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'issues', recordId: req.params.id, oldValue: existing, newValue: data });

  const notifyTargets = new Set([existing.raised_by, existing.assigned_to, data.assigned_to].filter(Boolean).map(Number));
  notifyTargets.delete(req.user.id);
  if (notifyTargets.size && (await isEventEnabled('issue_updated'))) {
    await notify([...notifyTargets], {
      title: `Issue updated: ${existing.issue_number}`,
      message: `Issue "${existing.title}" updated (status: ${data.status || existing.status}).`,
      type: 'info', module: 'issues', recordId: existing.id,
    });
  }
  res.json({ success: true, data: await queryOne(`${SELECT} WHERE i.id = ?`, [req.params.id]) });
});

export const addComment = asyncHandler(async (req, res) => {
  const { comment } = req.body;
  if (!comment || !String(comment).trim()) throw badRequest('comment is required');
  const existing = await queryOne('SELECT id, raised_by, assigned_to, issue_number, title FROM issues WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Issue not found');
  const r = await query('INSERT INTO issue_comments (issue_id, user_id, comment) VALUES (?,?,?)', [req.params.id, req.user.id, comment.trim()]);
  const targets = new Set([existing.raised_by, existing.assigned_to].filter(Boolean).map(Number));
  targets.delete(req.user.id);
  if (targets.size) {
    await notify([...targets], {
      title: `New comment on ${existing.issue_number}`,
      message: `${req.user.name}: ${comment.trim().slice(0, 140)}`,
      type: 'info', module: 'issues', recordId: existing.id,
    });
  }
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM issue_comments WHERE id = ?', [r.insertId]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, issue_number FROM issues WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Issue not found');
  await query('DELETE FROM issues WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'issues', recordId: req.params.id, oldValue: existing });
  res.json({ success: true, message: 'Issue deleted' });
});

/** Scan overdue issues and notify assignees (called by dashboard/job). */
export async function notifyOverdueIssues() {
  if (!(await isEventEnabled('issue_overdue'))) return;
  const overdue = await query(
    `SELECT id, issue_number, title, assigned_to FROM issues
      WHERE due_date = CURDATE() - INTERVAL 1 DAY AND status NOT IN ('resolved','closed') AND assigned_to IS NOT NULL`);
  for (const issue of overdue) {
    await notify(issue.assigned_to, {
      title: `Issue overdue: ${issue.issue_number}`,
      message: `Issue "${issue.title}" is overdue.`,
      type: 'error', module: 'issues', recordId: issue.id,
    });
  }
}
