import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, orderByClause, searchClause, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';

const PROJECT_SELECT = `SELECT p.*, u.name AS manager_name,
  (SELECT COUNT(*) FROM wings w WHERE w.project_id = p.id) AS wing_count`;

// ------------------------------- Projects --------------------------------

export const listProjects = asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order } = parsePagination(req);
  const { where, params } = searchClause(req.query.search, ['p.name', 'p.code', 'p.client_name', 'p.city']);
  const conditions = where ? [where] : [];
  if (req.query.status) { conditions.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.project_type) { conditions.push('p.project_type = ?'); params.push(req.query.project_type); }
  if (req.query.managerId) { conditions.push('p.manager_id = ?'); params.push(req.query.managerId); }
  const scope = projectScopeSql(req, 'p.id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const orderSql = orderByClause(sort, order, ['p.id', 'p.name', 'p.start_date', 'p.budget', 'p.overall_progress'], 'p.id DESC');

  const rows = await query(`${PROJECT_SELECT} FROM projects p LEFT JOIN users u ON u.id = p.manager_id ${whereSql} ${orderSql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const countRow = await queryOne(`SELECT COUNT(*) AS total FROM projects p ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(countRow.total), totalPages: Math.ceil(countRow.total / limit) } });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await queryOne(
    `${PROJECT_SELECT} FROM projects p LEFT JOIN users u ON u.id = p.manager_id WHERE p.id = ?`, [req.params.id]);
  if (!project) throw notFound('Project not found');
  assertProjectAccess(req, project.id);
  const wings = await query('SELECT * FROM wings WHERE project_id = ? ORDER BY id', [project.id]);
  const documents = await query(
    `SELECT d.id, d.title, d.category, d.version, d.expiry_date, f.file_path, f.original_name, f.file_type
       FROM project_documents d LEFT JOIN file_uploads f ON f.id = d.file_id
      WHERE d.project_id = ? AND d.category IN ('project_image','demo_image') ORDER BY d.id DESC LIMIT 12`, [project.id]);
  res.json({ success: true, data: { ...project, wings, images: documents } });
});

const PROJECT_FIELDS = ['name', 'code', 'project_type', 'client_name', 'developer_name', 'address', 'city', 'state', 'pincode', 'description', 'start_date', 'expected_completion_date', 'actual_completion_date', 'status', 'budget', 'manager_id'];

export const createProject = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of PROJECT_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.name) throw badRequest('Project name is required');
  if (!data.code) data.code = null;
  data.budget = data.budget ?? 0;
  data.created_by = req.user.id;

  const id = await withTransaction(async (conn) => {
    let code = data.code;
    if (!code) {
      const [r0] = await conn.query('INSERT INTO projects (name, code) VALUES (?, ?)', [data.name, 'TEMP']);
      code = businessNumber('project', r0.insertId);
      data.code = code;
      await conn.query('DELETE FROM projects WHERE id = ?', [r0.insertId]);
    }
    const keys = Object.keys(data);
    const [r] = await conn.query(`INSERT INTO projects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'projects', recordId: id, newValue: data });
  const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: project });
});

export const updateProject = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Project not found');
  assertProjectAccess(req, existing.id);
  const data = {};
  for (const f of PROJECT_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) {
    await query(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  }
  await audit(req, { action: 'update', module: 'projects', recordId: req.params.id, oldValue: existing, newValue: data });
  const project = await queryOne('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: project });
});

export const deleteProject = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, name FROM projects WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Project not found');
  await query('DELETE FROM projects WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'projects', recordId: req.params.id, oldValue: { name: existing.name } });
  res.json({ success: true, message: 'Project deleted' });
});

export const exportProjects = asyncHandler(async (_req, res) => {
  const rows = await query(`${PROJECT_SELECT} FROM projects p LEFT JOIN users u ON u.id = p.manager_id ORDER BY p.id`);
  sendCsv(res, 'projects.csv', rows);
});

// ------------------------------- Wings -----------------------------------

export const listWings = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('w.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.status) { conditions.push('w.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(w.name LIKE ? OR w.code LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'w.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT w.*, p.name AS project_name FROM wings w JOIN projects p ON p.id = w.project_id ${whereSql} ORDER BY w.project_id, w.id`, params);
  res.json({ success: true, data: rows });
});

const WING_FIELDS = ['project_id', 'name', 'code', 'floors_count', 'units_count', 'start_date', 'expected_completion_date', 'actual_completion_date', 'status', 'progress', 'description'];

export const createWing = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of WING_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.project_id || !data.name || !data.code) throw badRequest('project_id, name and code are required');
  assertProjectAccess(req, data.project_id);
  const keys = Object.keys(data);
  const result = await query(`INSERT INTO wings (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'wings', recordId: result.insertId, newValue: data });
  const wing = await queryOne('SELECT * FROM wings WHERE id = ?', [result.insertId]);
  res.status(201).json({ success: true, data: wing });
});

export const updateWing = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM wings WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Wing not found');
  assertProjectAccess(req, existing.project_id, existing.id);
  const data = {};
  for (const f of WING_FIELDS) if (f !== 'project_id' && req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) {
    await query(`UPDATE wings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  }
  await audit(req, { action: 'update', module: 'wings', recordId: req.params.id, oldValue: existing, newValue: data });
  const wing = await queryOne('SELECT * FROM wings WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: wing });
});

export const deleteWing = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, name FROM wings WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Wing not found');
  await query('DELETE FROM wings WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'wings', recordId: req.params.id, oldValue: { name: existing.name } });
  res.json({ success: true, message: 'Wing deleted' });
});

// ------------------------------- Floors ----------------------------------

export const listFloors = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.wingId) { conditions.push('f.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.projectId) { conditions.push('f.project_id = ?'); params.push(req.query.projectId); }
  const scope = projectScopeSql(req, 'f.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT f.*, w.name AS wing_name, p.name AS project_name FROM floors f
       JOIN wings w ON w.id = f.wing_id JOIN projects p ON p.id = f.project_id ${whereSql} ORDER BY f.wing_id, f.sequence`, params);
  res.json({ success: true, data: rows });
});

export const createFloor = asyncHandler(async (req, res) => {
  const { project_id, wing_id, name, sequence, status } = req.body;
  if (!project_id || !wing_id || !name) throw badRequest('project_id, wing_id and name are required');
  assertProjectAccess(req, project_id, wing_id);
  const result = await query('INSERT INTO floors (project_id, wing_id, name, sequence, status) VALUES (?,?,?,?,?)',
    [project_id, wing_id, name, sequence ?? 0, ['pending', 'in_progress', 'completed'].includes(status) ? status : 'pending']);
  await audit(req, { action: 'create', module: 'floors', recordId: result.insertId, newValue: req.body });
  const row = await queryOne('SELECT * FROM floors WHERE id = ?', [result.insertId]);
  res.status(201).json({ success: true, data: row });
});

export const updateFloor = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM floors WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Floor not found');
  const { name, sequence, status, progress } = req.body;
  await query('UPDATE floors SET name = COALESCE(?, name), sequence = COALESCE(?, sequence), status = COALESCE(?, status), progress = COALESCE(?, progress) WHERE id = ?',
    [nullify(name), sequence ?? null, ['pending', 'in_progress', 'completed'].includes(status) ? status : null, progress ?? null, req.params.id]);
  await audit(req, { action: 'update', module: 'floors', recordId: req.params.id, oldValue: existing, newValue: req.body });
  const row = await queryOne('SELECT * FROM floors WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

export const deleteFloor = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM floors WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Floor not found');
  await query('DELETE FROM floors WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'floors', recordId: req.params.id });
  res.json({ success: true, message: 'Floor deleted' });
});

// ------------------------------- Units -----------------------------------

export const listUnits = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.wingId) { conditions.push('u.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.floorId) { conditions.push('u.floor_id = ?'); params.push(req.query.floorId); }
  if (req.query.projectId) { conditions.push('u.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.status) { conditions.push('u.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(u.unit_number LIKE ? OR u.unit_type LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'u.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT u.*, w.name AS wing_name, f.name AS floor_name, p.name AS project_name
       FROM units u JOIN wings w ON w.id = u.wing_id LEFT JOIN floors f ON f.id = u.floor_id
       JOIN projects p ON p.id = u.project_id ${whereSql} ORDER BY u.wing_id, u.floor_id, u.unit_number LIMIT 1000`, params);
  res.json({ success: true, data: rows });
});

const UNIT_FIELDS = ['project_id', 'wing_id', 'floor_id', 'unit_number', 'unit_type', 'carpet_area', 'saleable_area', 'facing', 'status', 'price'];

export const createUnit = asyncHandler(async (req, res) => {
  const data = {};
  for (const f of UNIT_FIELDS) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  if (!data.project_id || !data.wing_id || !data.unit_number) throw badRequest('project_id, wing_id, unit_number are required');
  assertProjectAccess(req, data.project_id, data.wing_id);
  const keys = Object.keys(data);
  const result = await query(`INSERT INTO units (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
  await audit(req, { action: 'create', module: 'units', recordId: result.insertId, newValue: data });
  const row = await queryOne('SELECT * FROM units WHERE id = ?', [result.insertId]);
  res.status(201).json({ success: true, data: row });
});

export const updateUnit = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Unit not found');
  const data = {};
  for (const f of UNIT_FIELDS) if (!['project_id', 'wing_id'].includes(f) && req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE units SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
  await audit(req, { action: 'update', module: 'units', recordId: req.params.id, oldValue: existing, newValue: data });
  const row = await queryOne('SELECT * FROM units WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

export const deleteUnit = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id FROM units WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Unit not found');
  await query('DELETE FROM units WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'units', recordId: req.params.id });
  res.json({ success: true, message: 'Unit deleted' });
});

// --------------------------- Progress recalc -----------------------------

/** Recompute wing progress from daily progress (avg of latest per floor fallback to overall avg). */
export async function recomputeProjectProgress(projectId, conn = null) {
  const db = conn || { query: (sql, p) => query(sql, p).then((rows) => [rows]) };
  const [wingRows] = await db.query(
    `SELECT w.id, COALESCE(av.avg_pct, 0) AS pct FROM wings w
       LEFT JOIN (SELECT wing_id, AVG(percentage) AS avg_pct FROM daily_progress GROUP BY wing_id) av
         ON av.wing_id = w.id
      WHERE w.project_id = ?`, [projectId]);
  for (const w of wingRows) {
    const pct = Math.min(100, Math.max(0, Number(w.pct) || 0));
    await db.query('UPDATE wings SET progress = ? WHERE id = ?', [pct.toFixed(2), w.id]);
  }
  const values = wingRows.map((w) => Number(w.pct) || 0);
  const overall = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  await db.query('UPDATE projects SET overall_progress = ? WHERE id = ?', [Math.min(100, overall).toFixed(2), projectId]);
}
