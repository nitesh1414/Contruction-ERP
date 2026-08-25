import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { registerFile } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { notifyByPermission, isEventEnabled } from '../../utils/notify.js';

const SELECT = `SELECT d.*, p.name AS project_name, w.name AS wing_name, u.name AS uploaded_by_name,
  (SELECT dr.revision_no FROM drawing_revisions dr WHERE dr.drawing_id = d.id ORDER BY dr.id DESC LIMIT 1) AS current_revision
FROM drawings d JOIN projects p ON p.id = d.project_id
LEFT JOIN wings w ON w.id = d.wing_id LEFT JOIN users u ON u.id = d.uploaded_by`;

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('d.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('d.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.category) { conditions.push('d.category = ?'); params.push(req.query.category); }
  if (req.query.approval_status) { conditions.push('d.approval_status = ?'); params.push(req.query.approval_status); }
  if (req.query.search) {
    conditions.push('(d.title LIKE ? OR d.drawing_number LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'd.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(`${SELECT} ${whereSql} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM drawings d ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const drawing = await queryOne(`${SELECT} WHERE d.id = ?`, [req.params.id]);
  if (!drawing) throw notFound('Drawing not found');
  const revisions = await query(
    `SELECT dr.*, fu.file_path, fu.original_name, fu.file_type, fu.size_bytes, u.name AS uploaded_by_name
       FROM drawing_revisions dr
       LEFT JOIN file_uploads fu ON fu.id = dr.file_id
       LEFT JOIN users u ON u.id = dr.uploaded_by
      WHERE dr.drawing_id = ? ORDER BY dr.id DESC`, [drawing.id]);
  res.json({ success: true, data: { ...drawing, revisions } });
});

/** Create drawing (optionally with the first revision file). */
export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.project_id || !b.drawing_number || !b.title) throw badRequest('project_id, drawing_number and title are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO drawings (project_id, wing_id, category, drawing_number, title, approval_status, remarks, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.project_id, nullify(b.wing_id), b.category || 'other', b.drawing_number, b.title,
      'draft', nullify(b.remarks), req.user.id]
    );
    return r.insertId;
  });

  if (req.file || b.revision_no) {
    await addRevisionInternal(req, id, { revision_no: b.revision_no || 'R0', revision_date: b.revision_date, remarks: b.revision_remarks });
  }
  await audit(req, { action: 'create', module: 'drawings', recordId: id, newValue: { title: b.title, number: b.drawing_number } });
  const drawing = await queryOne(`${SELECT} WHERE d.id = ?`, [id]);
  res.status(201).json({ success: true, data: drawing });
});

async function addRevisionInternal(req, drawingId, input) {
  let fileId = null;
  if (req.file) {
    fileId = await registerFile({ file: req.file, module: 'drawings', relatedId: drawingId, userId: req.user.id });
  }
  const status = 'pending_approval';
  const r = await query(
    `INSERT INTO drawing_revisions (drawing_id, revision_no, revision_date, file_id, remarks, status, uploaded_by)
     VALUES (?,?,?,?,?,?,?)`,
    [drawingId, input.revision_no, nullify(input.revision_date), fileId, nullify(input.remarks), status, req.user.id]
  );
  await query(
    `UPDATE drawings SET latest_revision = ?, approval_status = 'pending_approval' WHERE id = ?`,
    [input.revision_no, drawingId]
  );
  if (await isEventEnabled('drawing_revision')) {
    await notifyByPermission('drawings.approve', {
      title: 'New drawing revision awaiting approval',
      message: `Drawing revision ${input.revision_no} requires approval.`,
      type: 'info', module: 'drawings', recordId: drawingId,
    });
  }
  return r.insertId;
}

export const addRevision = asyncHandler(async (req, res) => {
  const drawing = await queryOne('SELECT * FROM drawings WHERE id = ?', [req.params.id]);
  if (!drawing) throw notFound('Drawing not found');
  assertProjectAccess(req, drawing.project_id, drawing.wing_id);
  const revisionNo = req.body.revision_no;
  if (!revisionNo) throw badRequest('revision_no is required');
  const revId = await addRevisionInternal(req, drawing.id, {
    revision_no: revisionNo, revision_date: req.body.revision_date, remarks: req.body.remarks,
  });
  await audit(req, { action: 'create', module: 'drawings', recordId: drawing.id, newValue: { revision: revisionNo } });
  const revision = await queryOne('SELECT * FROM drawing_revisions WHERE id = ?', [revId]);
  res.status(201).json({ success: true, data: revision });
});

export const setRevisionStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(status)) throw badRequest('status must be approved or rejected');
  const revision = await queryOne('SELECT * FROM drawing_revisions WHERE id = ?', [req.params.revisionId]);
  if (!revision) throw notFound('Revision not found');
  const drawing = await queryOne('SELECT * FROM drawings WHERE id = ?', [revision.drawing_id]);
  assertProjectAccess(req, drawing.project_id, drawing.wing_id);

  await withTransaction(async (conn) => {
    await conn.query('UPDATE drawing_revisions SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
      [status, req.user.id, revision.id]);
    if (status === 'approved') {
      await conn.query(`UPDATE drawings SET approval_status = 'approved' WHERE id = ?`, [drawing.id]);
      // Supersede other approved revisions from other numbers? keep history - drawing-level status is latest approved.
    } else {
      await conn.query(`UPDATE drawings SET approval_status = 'rejected' WHERE id = ? AND approval_status = 'pending_approval'`, [drawing.id]);
    }
  });
  await audit(req, { action: status, module: 'drawings', recordId: drawing.id, newValue: { revision: revision.revision_no } });
  res.json({ success: true, message: `Revision ${status}` });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM drawings WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Drawing not found');
  const allowed = ['title', 'category', 'wing_id', 'remarks', 'approval_status', 'drawing_number'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE drawings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'drawings', recordId: req.params.id, newValue: data });
  res.json({ success: true, data: await queryOne(`${SELECT} WHERE d.id = ?`, [req.params.id]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, title FROM drawings WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Drawing not found');
  await query('DELETE FROM drawings WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'drawings', recordId: req.params.id, oldValue: { title: existing.title } });
  res.json({ success: true, message: 'Drawing deleted' });
});
