import { query, queryOne } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { registerFile } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { notifyByPermission, isEventEnabled } from '../../utils/notify.js';
import { CrudController } from '../../utils/crud.js';

// ------------------------------- Test types --------------------------------

export const testTypes = new CrudController({
  table: 'test_types', module: 'test_reports',
  fields: ['name', 'description', 'is_active'],
  searchColumns: ['name'], defaultSort: 'name ASC',
});

export const inspectionTypes = new CrudController({
  table: 'inspection_types', module: 'inspections',
  fields: ['name', 'checklist_template', 'is_active'],
  searchColumns: ['name'], defaultSort: 'name ASC',
});

// ------------------------------- Test reports ------------------------------

export const listTestReports = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('tr.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('tr.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.testTypeId) { conditions.push('tr.test_type_id = ?'); params.push(req.query.testTypeId); }
  if (req.query.result_status) { conditions.push('tr.result_status = ?'); params.push(req.query.result_status); }
  if (req.query.status) { conditions.push('tr.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(tr.test_number LIKE ? OR tr.laboratory LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'tr.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT tr.*, tt.name AS test_type_name, p.name AS project_name, w.name AS wing_name, m.name AS material_name,
            fu.file_path AS report_file_path, fu.original_name AS report_file_name
       FROM test_reports tr
       JOIN test_types tt ON tt.id = tr.test_type_id
       JOIN projects p ON p.id = tr.project_id
       LEFT JOIN wings w ON w.id = tr.wing_id
       LEFT JOIN materials m ON m.id = tr.material_id
       LEFT JOIN file_uploads fu ON fu.id = tr.file_id
     ${whereSql} ORDER BY tr.test_date DESC, tr.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM test_reports tr ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const createTestReport = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.test_type_id || !b.project_id) throw badRequest('test_type_id and project_id are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);

  let fileId = null;
  if (req.file) fileId = await registerFile({ file: req.file, module: 'test_reports', userId: req.user.id });

  const id = await query(
    `INSERT INTO test_reports (test_number, test_type_id, project_id, wing_id, material_id, sample_date, test_date, laboratory, test_result, standard_spec, result_status, remarks, file_id, created_by)
     VALUES ('TMP',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.test_type_id, b.project_id, nullify(b.wing_id), nullify(b.material_id), nullify(b.sample_date), nullify(b.test_date),
    nullify(b.laboratory), nullify(b.test_result), nullify(b.standard_spec), b.result_status || 'pending', nullify(b.remarks), fileId, req.user.id]
  );
  await query('UPDATE test_reports SET test_number = ? WHERE id = ?', [businessNumber('test', id.insertId), id.insertId]);
  await audit(req, { action: 'create', module: 'test_reports', recordId: id.insertId, newValue: req.body });

  if (b.result_status === 'fail' && (await isEventEnabled('test_failed'))) {
    await notifyByPermission('test_reports.approve', {
      title: 'Test report FAILED',
      message: `A test report for project #${b.project_id} has failed.`,
      type: 'error', module: 'test_reports', recordId: id.insertId,
    });
  }
  const row = await queryOne('SELECT * FROM test_reports WHERE id = ?', [id.insertId]);
  res.status(201).json({ success: true, data: row });
});

export const updateTestReport = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM test_reports WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Test report not found');
  let fileId = existing.file_id;
  if (req.file) fileId = await registerFile({ file: req.file, module: 'test_reports', userId: req.user.id });
  const allowed = ['test_type_id', 'wing_id', 'material_id', 'sample_date', 'test_date', 'laboratory', 'test_result', 'standard_spec', 'result_status', 'remarks', 'status'];
  const data = { file_id: fileId };
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  await query(`UPDATE test_reports SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), existing.id]);
  await audit(req, { action: 'update', module: 'test_reports', recordId: existing.id, newValue: req.body });
  res.json({ success: true, data: await queryOne('SELECT * FROM test_reports WHERE id = ?', [existing.id]) });
});

export const approveTestReport = asyncHandler(async (req, res) => {
  const { status } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(status)) throw badRequest('status must be approved or rejected');
  const existing = await queryOne('SELECT * FROM test_reports WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Test report not found');
  await query('UPDATE test_reports SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?', [status, req.user.id, existing.id]);
  await audit(req, { action: status, module: 'test_reports', recordId: existing.id });
  res.json({ success: true, data: await queryOne('SELECT * FROM test_reports WHERE id = ?', [existing.id]) });
});

export const deleteTestReport = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM test_reports WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Test report not found');
  await query('DELETE FROM test_reports WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'test_reports', recordId: req.params.id });
  res.json({ success: true, message: 'Deleted' });
});

// ------------------------------- Inspections -------------------------------

export const listInspections = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('i.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('i.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.status) { conditions.push('i.status = ?'); params.push(req.query.status); }
  if (req.query.inspectionTypeId) { conditions.push('i.inspection_type_id = ?'); params.push(req.query.inspectionTypeId); }
  if (req.query.inspectorId) { conditions.push('i.inspector_id = ?'); params.push(req.query.inspectorId); }
  const scope = projectScopeSql(req, 'i.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT i.*, it.name AS inspection_type_name, p.name AS project_name, w.name AS wing_name, f.name AS floor_name, u.name AS inspector_name
       FROM inspections i
       JOIN inspection_types it ON it.id = i.inspection_type_id
       JOIN projects p ON p.id = i.project_id
       LEFT JOIN wings w ON w.id = i.wing_id
       LEFT JOIN floors f ON f.id = i.floor_id
       LEFT JOIN users u ON u.id = i.inspector_id
     ${whereSql} ORDER BY i.inspection_date DESC, i.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM inspections i ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getInspection = asyncHandler(async (req, res) => {
  const insp = await queryOne(
    `SELECT i.*, it.name AS inspection_type_name, p.name AS project_name, w.name AS wing_name, u.name AS inspector_name
       FROM inspections i JOIN inspection_types it ON it.id = i.inspection_type_id
       JOIN projects p ON p.id = i.project_id LEFT JOIN wings w ON w.id = i.wing_id
       LEFT JOIN users u ON u.id = i.inspector_id WHERE i.id = ?`, [req.params.id]);
  if (!insp) throw notFound('Inspection not found');
  const items = await query('SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY id', [insp.id]);
  const photos = await query(
    `SELECT fu.id, fu.file_path, fu.original_name, fu.file_type FROM file_uploads fu WHERE fu.related_module = 'inspections' AND fu.related_id = ? ORDER BY fu.id`, [insp.id]);
  res.json({ success: true, data: { ...insp, items, photos } });
});

export const createInspection = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.inspection_type_id || !b.project_id || !b.inspection_date) throw badRequest('inspection_type_id, project_id and inspection_date are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);

  if (b.client_ref) {
    const dup = await queryOne('SELECT id FROM inspections WHERE client_ref = ?', [b.client_ref]);
    if (dup) return res.json({ success: true, data: await queryOne('SELECT * FROM inspections WHERE id = ?', [dup.id]), duplicate: true });
  }

  const items = Array.isArray(b.items) ? b.items : [];
  const id = await query(
    `INSERT INTO inspections (inspection_number, inspection_type_id, project_id, wing_id, floor_id, location, inspector_id, inspection_date, observation, status, remarks, latitude, longitude, client_ref, created_by)
     VALUES ('TMP',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.inspection_type_id, b.project_id, nullify(b.wing_id), nullify(b.floor_id), nullify(b.location),
    nullify(b.inspector_id) || req.user.id, b.inspection_date, nullify(b.observation), b.status || 'pending',
    nullify(b.remarks), nullify(b.latitude), nullify(b.longitude), nullify(b.client_ref), req.user.id]
  );
  const inspId = id.insertId;
  await query('UPDATE inspections SET inspection_number = ? WHERE id = ?', [businessNumber('inspection', inspId), inspId]);
  for (const it of items) {
    if (!it.checklist_item) continue;
    await query('INSERT INTO inspection_items (inspection_id, checklist_item, result, remarks) VALUES (?,?,?,?)',
      [inspId, it.checklist_item, ['pass', 'fail', 'na', 'pending'].includes(it.result) ? it.result : 'pending', nullify(it.remarks)]);
  }
  // photos (multipart 'photos')
  if (req.files?.length) {
    for (const file of req.files) {
      await registerFile({ file, module: 'inspections', relatedId: inspId, source: req.body.photo_source === 'upload' ? 'upload' : 'camera', userId: req.user.id });
    }
  }
  await audit(req, { action: 'create', module: 'inspections', recordId: inspId, newValue: { status: b.status || 'pending' } });
  if ((b.status === 'failed') && (await isEventEnabled('inspection_failed'))) {
    await notifyByPermission('inspections.approve', {
      title: 'Inspection failed', message: `Inspection ${businessNumber('inspection', inspId)} has failed.`, type: 'error', module: 'inspections', recordId: inspId,
    });
  }
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM inspections WHERE id = ?', [inspId]) });
});

export const updateInspection = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM inspections WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Inspection not found');
  const allowed = ['inspection_type_id', 'wing_id', 'floor_id', 'location', 'inspector_id', 'inspection_date', 'observation', 'status', 'remarks', 'latitude', 'longitude'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE inspections SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  if (Array.isArray(req.body.items)) {
    await query('DELETE FROM inspection_items WHERE inspection_id = ?', [req.params.id]);
    for (const it of req.body.items) {
      if (!it.checklist_item) continue;
      await query('INSERT INTO inspection_items (inspection_id, checklist_item, result, remarks) VALUES (?,?,?,?)',
        [req.params.id, it.checklist_item, ['pass', 'fail', 'na', 'pending'].includes(it.result) ? it.result : 'pending', nullify(it.remarks)]);
    }
  }
  await audit(req, { action: 'update', module: 'inspections', recordId: existing.id, newValue: req.body });
  res.json({ success: true, data: await queryOne('SELECT * FROM inspections WHERE id = ?', [existing.id]) });
});

export const deleteInspection = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM inspections WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Inspection not found');
  await query('DELETE FROM inspections WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'inspections', recordId: req.params.id });
  res.json({ success: true, message: 'Deleted' });
});
