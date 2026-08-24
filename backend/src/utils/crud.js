import { query, queryOne } from '../db/pool.js';
import {
  asyncHandler, ApiError, notFound, parsePagination, orderByClause, searchClause, nullify,
} from './helpers.js';
import { audit } from './audit.js';
import { sendCsv } from './csv.js';

/**
 * Generic CRUD controller factory used by simple/master-data modules.
 *
 * new CrudController({
 *   table: 'suppliers',
 *   module: 'suppliers',                    // permission module code
 *   fields: ['name', 'phone', ...],         // writable fields
 *   searchColumns: ['name', 'email'],       // ?search= targets
 *   defaultSort: 'id DESC',
 *   listSql: 'SELECT ... FROM suppliers s'// optional custom list query (with joins)
 *   countSql: 'SELECT COUNT(*) FROM ...'    // pair with listSql
 *   filters: [ { key: 'is_active', column: 's.is_active' } ],
 *   beforeCreate(data, req) {}, beforeUpdate(data, req) {},
 *   afterWrite(action, id, req) {},
 * })
 */
export class CrudController {
  constructor(options) {
    this.options = {
      searchColumns: [],
      filters: [],
      sortableColumns: ['id'],
      exportColumns: null,
      ...options,
    };
    if (!this.options.table) throw new Error('CrudController requires a table');
    this.options.module = this.options.module || this.options.table;
  }

  list = asyncHandler(async (req, res) => {
    const o = this.options;
    const { page, limit, offset, sort, order } = parsePagination(req);
    const { where, params } = searchClause(req.query.search, o.searchColumns);
    const conditions = where ? [where] : [];
    const condParams = [...params];

    for (const f of o.filters) {
      if (req.query[f.key] !== undefined && req.query[f.key] !== '') {
        conditions.push(`${f.column} = ?`);
        condParams.push(req.query[f.key]);
      }
    }
    if (o.scopeProjects && req.projectScope !== null && req.projectScope !== undefined) {
      if (req.projectScope.size === 0) {
        return res.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }
      const ids = [...req.projectScope];
      conditions.push(`${o.scopeProjects} IN (${ids.map(() => '?').join(',')})`);
      condParams.push(...ids);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderSql = orderByClause(sort, order, o.sortableColumns, o.defaultSort || `${o.table}.id DESC`);

    let listSql = o.listSql || `SELECT * FROM ${o.table}`;
    let countSql = o.countSql || `SELECT COUNT(*) AS total FROM ${o.table}`;

    const rows = await query(`${listSql} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`, [...condParams, limit, offset]);
    const countRow = await queryOne(`${countSql} ${whereSql}`, condParams);
    const total = countRow ? Number(countRow.total) : 0;

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  getOne = asyncHandler(async (req, res) => {
    const o = this.options;
    const row = await (o.getOneSql
      ? queryOne(o.getOneSql, [req.params.id])
      : queryOne(`SELECT * FROM ${o.table} WHERE id = ?`, [req.params.id]));
    if (!row) throw notFound();
    res.json({ success: true, data: row });
  });

  create = asyncHandler(async (req, res) => {
    const o = this.options;
    const data = {};
    for (const f of o.fields) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
    if (o.beforeCreate) await o.beforeCreate(data, req);
    const keys = Object.keys(data);
    if (!keys.length) throw new ApiError(400, 'No valid fields provided');
    const result = await query(
      `INSERT INTO ${o.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      keys.map((k) => data[k])
    );
    const id = result.insertId;
    if (o.afterWrite) await o.afterWrite('create', id, req);
    await audit(req, { action: 'create', module: o.module, recordId: id, newValue: data });
    const row = await queryOne(`SELECT * FROM ${o.table} WHERE id = ?`, [id]);
    res.status(201).json({ success: true, data: row });
  });

  update = asyncHandler(async (req, res) => {
    const o = this.options;
    const existing = await queryOne(`SELECT * FROM ${o.table} WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound();
    const data = {};
    for (const f of o.fields) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
    if (o.beforeUpdate) await o.beforeUpdate(data, req, existing);
    const keys = Object.keys(data);
    if (keys.length) {
      await query(
        `UPDATE ${o.table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => data[k]), req.params.id]
      );
    }
    if (o.afterWrite) await o.afterWrite('update', req.params.id, req);
    await audit(req, { action: 'update', module: o.module, recordId: req.params.id, oldValue: existing, newValue: data });
    const row = await queryOne(`SELECT * FROM ${o.table} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, data: row });
  });

  remove = asyncHandler(async (req, res) => {
    const o = this.options;
    const existing = await queryOne(`SELECT * FROM ${o.table} WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound();
    await query(`DELETE FROM ${o.table} WHERE id = ?`, [req.params.id]);
    if (o.afterWrite) await o.afterWrite('delete', req.params.id, req);
    await audit(req, { action: 'delete', module: o.module, recordId: req.params.id, oldValue: existing });
    res.json({ success: true, message: 'Deleted successfully' });
  });

  exportCsv = asyncHandler(async (req, res) => {
    const o = this.options;
    const rows = await query(o.exportSql || `SELECT * FROM ${o.table} ${o.exportOrderBy ? `ORDER BY ${o.exportOrderBy}` : 'ORDER BY id DESC'}`);
    await audit(req, { action: 'export', module: o.module });
    sendCsv(res, `${o.module}-export.csv`, rows, o.exportColumns || undefined);
  });
}

/** Builds standard CRUD routes for a controller with permission checks. */
export function crudRoutes(router, controller, perms, { disable = [] } = {}) {
  const base = controller.options.basePath || '';
  if (!disable.includes('list')) router.get(`${base}/`, perms('view'), controller.list);
  if (!disable.includes('export')) router.get(`${base}/export`, perms('export'), controller.exportCsv);
  if (!disable.includes('get')) router.get(`${base}/:id`, perms('view'), controller.getOne);
  if (!disable.includes('create')) router.post(`${base}/`, perms('create'), controller.create);
  if (!disable.includes('update')) router.put(`${base}/:id`, perms('edit'), controller.update);
  if (!disable.includes('delete')) router.delete(`${base}/:id`, perms('delete'), controller.remove);
}
