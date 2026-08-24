import { query, queryOne } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { registerFile } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { notifyByPermission, isEventEnabled } from '../../utils/notify.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('d.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('d.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.category) { conditions.push('d.category = ?'); params.push(req.query.category); }
  if (req.query.expiringBefore) { conditions.push('d.expiry_date IS NOT NULL AND d.expiry_date <= ?'); params.push(req.query.expiringBefore); }
  if (req.query.search) {
    conditions.push('(d.title LIKE ? OR d.document_number LIKE ? OR d.description LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'd.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT d.*, p.name AS project_name, w.name AS wing_name, u.name AS uploaded_by_name,
            fu.file_path, fu.original_name, fu.file_type, fu.size_bytes, fu.extension
       FROM project_documents d
       JOIN projects p ON p.id = d.project_id
       LEFT JOIN wings w ON w.id = d.wing_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN file_uploads fu ON fu.id = d.file_id
     ${whereSql} ORDER BY d.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM project_documents d ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.project_id || !b.title) throw badRequest('project_id and title are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);
  let fileId = null;
  if (req.file) {
    fileId = await registerFile({ file: req.file, module: 'documents', userId: req.user.id });
  }
  const r = await query(
    `INSERT INTO project_documents (project_id, wing_id, category, title, document_number, description, file_id, version, expiry_date, uploaded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.project_id, nullify(b.wing_id), b.category || 'other', b.title, nullify(b.document_number),
    nullify(b.description), fileId, nullify(b.version), nullify(b.expiry_date), req.user.id]
  );
  if (fileId) await query('UPDATE file_uploads SET related_module = ?, related_id = ? WHERE id = ?', ['documents', r.insertId, fileId]);
  await audit(req, { action: 'create', module: 'documents', recordId: r.insertId, newValue: { title: b.title, category: b.category } });
  const row = await queryOne(
    `SELECT d.*, fu.file_path, fu.original_name FROM project_documents d LEFT JOIN file_uploads fu ON fu.id = d.file_id WHERE d.id = ?`, [r.insertId]);
  res.status(201).json({ success: true, data: row });
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM project_documents WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Document not found');
  const allowed = ['title', 'document_number', 'description', 'category', 'version', 'expiry_date', 'wing_id'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (req.file) {
    const fileId = await registerFile({ file: req.file, module: 'documents', relatedId: existing.id, userId: req.user.id });
    data.file_id = fileId;
  }
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE project_documents SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'documents', recordId: req.params.id, newValue: req.body });
  res.json({ success: true, data: await queryOne('SELECT * FROM project_documents WHERE id = ?', [req.params.id]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, title FROM project_documents WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Document not found');
  await query('DELETE FROM project_documents WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'documents', recordId: req.params.id, oldValue: existing });
  res.json({ success: true, message: 'Document deleted' });
});

/** Documents expiring soon — notification job helper. */
export async function notifyExpiringDocuments() {
  if (!(await isEventEnabled('document_expiry'))) return;
  const rows = await query(
    `SELECT d.id, d.title, d.expiry_date, d.uploaded_by FROM project_documents d
      WHERE d.expiry_date IS NOT NULL AND d.expiry_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 15 DAY LIMIT 200`);
  for (const r of rows) {
    await notifyByPermission('documents.view', {
      title: 'Document expiring soon',
      message: `Document "${r.title}" expires on ${r.expiry_date?.toISOString?.().slice(0, 10) || r.expiry_date}.`,
      type: 'warning', module: 'documents', recordId: r.id,
    });
  }
}
