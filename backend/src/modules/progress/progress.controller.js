import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { registerFile } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { sendCsv } from '../../utils/csv.js';
import { recomputeProjectProgress } from '../projects/projects.controller.js';

const PROGRESS_SELECT = `SELECT dp.*, p.name AS project_name, w.name AS wing_name, f.name AS floor_name, u.name AS created_by_name`;

function parsePhotoMeta(body) {
  // photosMeta: JSON string '[{"latitude":..,"longitude":..,"captured_at":..,"source":"camera"}]' aligned with files order
  if (!body.photosMeta) return [];
  try {
    const meta = JSON.parse(body.photosMeta);
    return Array.isArray(meta) ? meta : [];
  } catch {
    return [];
  }
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('dp.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('dp.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.floorId) { conditions.push('dp.floor_id = ?'); params.push(req.query.floorId); }
  if (req.query.from) { conditions.push('dp.report_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('dp.report_date <= ?'); params.push(req.query.to); }
  if (req.query.search) {
    conditions.push('(dp.work_description LIKE ? OR dp.remarks LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const scope = projectScopeSql(req, 'dp.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);

  const rows = await query(
    `${PROGRESS_SELECT} FROM daily_progress dp
       JOIN projects p ON p.id = dp.project_id
       LEFT JOIN wings w ON w.id = dp.wing_id
       LEFT JOIN floors f ON f.id = dp.floor_id
       LEFT JOIN users u ON u.id = dp.created_by
     ${whereSql} ORDER BY dp.report_date DESC, dp.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const count = await queryOne(`SELECT COUNT(*) AS total FROM daily_progress dp ${whereSql}`, params);

  // Attach photos
  const ids = rows.map((r) => r.id);
  let photos = [];
  if (ids.length) {
    photos = await query(
      `SELECT pp.id, pp.progress_id, pp.latitude, pp.longitude, pp.captured_at, pp.source,
              fu.file_path, fu.original_name, fu.file_type, uu.name AS uploaded_by_name
         FROM progress_photos pp
         JOIN file_uploads fu ON fu.id = pp.file_id
         LEFT JOIN users uu ON uu.id = pp.uploaded_by
        WHERE pp.progress_id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  const byProgress = {};
  for (const ph of photos) {
    if (!byProgress[ph.progress_id]) byProgress[ph.progress_id] = [];
    byProgress[ph.progress_id].push(ph);
  }
  const data = rows.map((r) => ({ ...r, photos: byProgress[r.id] || [] }));
  res.json({ success: true, data, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const row = await queryOne(
    `${PROGRESS_SELECT} FROM daily_progress dp
       JOIN projects p ON p.id = dp.project_id
       LEFT JOIN wings w ON w.id = dp.wing_id
       LEFT JOIN floors f ON f.id = dp.floor_id
       LEFT JOIN users u ON u.id = dp.created_by
      WHERE dp.id = ?`, [req.params.id]);
  if (!row) throw notFound('Progress report not found');
  const photos = await query(
    `SELECT pp.*, fu.file_path, fu.original_name FROM progress_photos pp JOIN file_uploads fu ON fu.id = pp.file_id WHERE pp.progress_id = ?`, [row.id]);
  res.json({ success: true, data: { ...row, photos } });
});

async function savePhotos({ progressId, files, meta, userId }) {
  const saved = [];
  for (let i = 0; i < (files || []).length; i += 1) {
    const file = files[i];
    const m = meta[i] || {};
    const fileId = await registerFile({
      file, module: 'progress', relatedId: progressId, source: m.source === 'upload' ? 'upload' : 'camera', userId,
    });
    const result = await query(
      `INSERT INTO progress_photos (progress_id, file_id, latitude, longitude, captured_at, source, uploaded_by)
       VALUES (?,?,?,?,?,?,?)`,
      [progressId, fileId, nullify(m.latitude), nullify(m.longitude), nullify(m.captured_at), m.source === 'upload' ? 'upload' : 'camera', userId]
    );
    saved.push(result.insertId);
  }
  return saved;
}

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.project_id || !b.report_date) throw badRequest('project_id and report_date are required');
  assertProjectAccess(req, Number(b.project_id), b.wing_id ? Number(b.wing_id) : null);

  // Offline duplicate protection
  if (b.client_ref) {
    const dup = await queryOne('SELECT id FROM daily_progress WHERE client_ref = ?', [b.client_ref]);
    if (dup) {
      const existing = await queryOne('SELECT * FROM daily_progress WHERE id = ?', [dup.id]);
      return res.status(200).json({ success: true, data: existing, duplicate: true });
    }
  }

  const fields = {
    project_id: Number(b.project_id), wing_id: nullify(b.wing_id), floor_id: nullify(b.floor_id),
    report_date: b.report_date, work_time: nullify(b.work_time), work_description: nullify(b.work_description),
    work_completed: nullify(b.work_completed), percentage: Number(b.percentage || 0), labour_count: Number(b.labour_count || 0),
    material_used: nullify(b.material_used), weather: nullify(b.weather), remarks: nullify(b.remarks),
    latitude: nullify(b.latitude), longitude: nullify(b.longitude), client_ref: nullify(b.client_ref), created_by: req.user.id,
  };
  const meta = parsePhotoMeta(b);

  const id = await withTransaction(async (conn) => {
    const keys = Object.keys(fields);
    const [r] = await conn.query(
      `INSERT INTO daily_progress (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      keys.map((k) => fields[k])
    );
    await recomputeProjectProgress(fields.project_id, conn);
    return r.insertId;
  });

  if (req.files?.length) await savePhotos({ progressId: id, files: req.files, meta, userId: req.user.id });
  await audit(req, { action: 'create', module: 'progress', recordId: id, newValue: props(fields) });
  const row = await queryOne('SELECT * FROM daily_progress WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });

  function props(o) { const { ...copy } = o; delete copy.client_ref; return copy; }
});

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM daily_progress WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Progress report not found');
  assertProjectAccess(req, existing.project_id, existing.wing_id);
  const allowed = ['wing_id', 'floor_id', 'report_date', 'work_time', 'work_description', 'work_completed', 'percentage', 'labour_count', 'material_used', 'weather', 'remarks', 'latitude', 'longitude'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);
  if (keys.length) {
    await withTransaction(async (conn) => {
      await conn.query(`UPDATE daily_progress SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
      await recomputeProjectProgress(existing.project_id, conn);
    });
  }
  if (req.files?.length) {
    const meta = parsePhotoMeta(req.body);
    await savePhotos({ progressId: existing.id, files: req.files, meta, userId: req.user.id });
  }
  await audit(req, { action: 'update', module: 'progress', recordId: req.params.id, oldValue: existing, newValue: data });
  res.json({ success: true, data: await queryOne('SELECT * FROM daily_progress WHERE id = ?', [req.params.id]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM daily_progress WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Progress report not found');
  await query('DELETE FROM daily_progress WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'progress', recordId: req.params.id, oldValue: { report_date: existing.report_date } });
  res.json({ success: true, message: 'Progress report deleted' });
});

/** Batch endpoint for the mobile offline queue. Items processed independently. */
export const syncBatch = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw badRequest('items[] required');
  const results = [];
  for (const item of items) {
    try {
      if (item.client_ref) {
        const dup = await queryOne('SELECT id FROM daily_progress WHERE client_ref = ?', [item.client_ref]);
        if (dup) { results.push({ client_ref: item.client_ref, status: 'duplicate', id: dup.id }); continue; }
      }
      if (!item.project_id || !item.report_date) { results.push({ client_ref: item.client_ref, status: 'error', message: 'project_id and report_date required' }); continue; }
      const r = await query(
        `INSERT INTO daily_progress (project_id, wing_id, floor_id, report_date, work_time, work_description, work_completed, percentage, labour_count, material_used, weather, remarks, latitude, longitude, client_ref, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [item.project_id, nullify(item.wing_id), nullify(item.floor_id), item.report_date, nullify(item.work_time),
        nullify(item.work_description), nullify(item.work_completed), Number(item.percentage || 0), Number(item.labour_count || 0),
        nullify(item.material_used), nullify(item.weather), nullify(item.remarks), nullify(item.latitude), nullify(item.longitude),
        item.client_ref, req.user.id]
      );
      await recomputeProjectProgress(item.project_id);
      results.push({ client_ref: item.client_ref, status: 'created', id: r.insertId });
    } catch (err) {
      results.push({ client_ref: item.client_ref, status: 'error', message: err.message });
    }
  }
  await audit(req, { action: 'sync', module: 'progress', newValue: { count: items.length } });
  res.json({ success: true, data: results });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'dp.project_id');
  const conditions = ['1=1'];
  const params = [];
  if (req.query.projectId) { conditions.push('dp.project_id = ?'); params.push(req.query.projectId); }
  const rows = await query(
    `${PROGRESS_SELECT} FROM daily_progress dp
       JOIN projects p ON p.id = dp.project_id
       LEFT JOIN wings w ON w.id = dp.wing_id
       LEFT JOIN floors f ON f.id = dp.floor_id
       LEFT JOIN users u ON u.id = dp.created_by
     WHERE ${conditions.join(' AND ')} ${scope.clause} ORDER BY dp.report_date DESC LIMIT 5000`,
    [...params, ...scope.params]
  );
  await audit(req, { action: 'export', module: 'progress' });
  sendCsv(res, 'daily-progress.csv', rows);
});

/** Progress history for a wing/project timeline chart. */
export const timeline = asyncHandler(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('dp.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('dp.wing_id = ?'); params.push(req.query.wingId); }
  const scope = projectScopeSql(req, 'dp.project_id');
  const rows = await query(
    `SELECT dp.report_date AS date, AVG(dp.percentage) AS avg_percentage, SUM(dp.labour_count) AS total_labour, COUNT(*) AS reports
       FROM daily_progress dp
       WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
       GROUP BY dp.report_date ORDER BY dp.report_date ASC LIMIT 365`,
    [...params, ...scope.params]
  );
  res.json({ success: true, data: rows });
});

export { businessNumber as _bn };
