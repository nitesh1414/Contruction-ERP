import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { sendCsv, toCsv } from '../../utils/csv.js';

const SELECT = `SELECT b.*, p.name AS project_name, w.name AS wing_name, u.name AS created_by_name
  FROM boq b JOIN projects p ON p.id = b.project_id LEFT JOIN wings w ON w.id = b.wing_id
  LEFT JOIN users u ON u.id = b.created_by`;

function itemVariance(item) {
  const est = Number(item.estimated_qty) * Number(item.rate);
  const act = Number(item.actual_qty) * Number(item.rate);
  const qtyVar = Number(item.actual_qty) - Number(item.estimated_qty);
  const amtVar = act - est;
  const pct = est > 0 ? +((amtVar / est) * 100).toFixed(2) : null;
  return {
    estimated_amount: +est.toFixed(2),
    actual_amount: +act.toFixed(2),
    quantity_variance: +qtyVar.toFixed(3),
    amount_variance: +amtVar.toFixed(2),
    variance_percent: pct,
  };
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('b.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.wingId) { conditions.push('b.wing_id = ?'); params.push(req.query.wingId); }
  if (req.query.status) { conditions.push('b.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(b.boq_number LIKE ? OR b.title LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'b.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);

  const rows = await query(
    `SELECT b.*, p.name AS project_name, w.name AS wing_name,
            t.estimated_total, t.actual_total, (t.actual_total - t.estimated_total) AS variance_total
       FROM boq b
       JOIN projects p ON p.id = b.project_id
       LEFT JOIN wings w ON w.id = b.wing_id
       LEFT JOIN (
         SELECT boq_id,
                SUM(estimated_qty * rate) AS estimated_total,
                SUM(actual_qty * rate) AS actual_total
           FROM boq_items GROUP BY boq_id
       ) t ON t.boq_id = b.id
     ${whereSql} ORDER BY b.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM boq b ${whereSql}`, params);
  const data = rows.map((r) => {
    const tax = Number(r.tax_percent) || 0;
    const disc = Number(r.discount) || 0;
    const subtotal = Number(r.estimated_total) || 0;
    const taxAmount = subtotal * (tax / 100);
    return { ...r, tax_amount: +taxAmount.toFixed(2), grand_total: +(subtotal + taxAmount - disc).toFixed(2) };
  });
  res.json({ success: true, data, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const boq = await queryOne(`${SELECT} WHERE b.id = ?`, [req.params.id]);
  if (!boq) throw notFound('BOQ not found');
  const items = await query(
    `SELECT bi.*, bc.name AS category_name FROM boq_items bi LEFT JOIN boq_categories bc ON bc.id = bi.category_id
      WHERE bi.boq_id = ? ORDER BY bi.sort_order, bi.id`, [boq.id]);
  const enriched = items.map((it) => ({ ...it, ...itemVariance(it) }));
  const estimatedTotal = enriched.reduce((s, i) => s + Number(i.estimated_amount), 0);
  const actualTotal = enriched.reduce((s, i) => s + Number(i.actual_amount), 0);
  const taxAmount = +(estimatedTotal * (Number(boq.tax_percent) / 100)).toFixed(2);
  const discount = Number(boq.discount) || 0;
  res.json({
    success: true,
    data: {
      ...boq,
      items: enriched,
      totals: {
        estimated_total: +estimatedTotal.toFixed(2),
        actual_total: +actualTotal.toFixed(2),
        variance_total: +(actualTotal - estimatedTotal).toFixed(2),
        variance_percent: estimatedTotal > 0 ? +(((actualTotal - estimatedTotal) / estimatedTotal) * 100).toFixed(2) : null,
        tax_amount: taxAmount,
        discount,
        grand_total: +(estimatedTotal + taxAmount - discount).toFixed(2),
      },
    },
  });
});

export const create = asyncHandler(async (req, res) => {
  const { project_id, wing_id, title, description, tax_percent = 0, discount = 0, items = [] } = req.body;
  if (!project_id || !title) throw badRequest('project_id and title are required');
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO boq (boq_number, project_id, wing_id, title, description, status, tax_percent, discount, created_by)
       VALUES ('TMP',?,?,?,?, 'draft', ?, ?, ?)`,
      [project_id, nullify(wing_id), title, nullify(description), Number(tax_percent) || 0, Number(discount) || 0, req.user.id]
    );
    const boqId = r.insertId;
    await conn.query('UPDATE boq SET boq_number = ? WHERE id = ?', [businessNumber('boq', boqId), boqId]);
    await insertItems(conn, boqId, items);
    return boqId;
  });
  await audit(req, { action: 'create', module: 'boq', recordId: id, newValue: { title, items: items.length } });
  res.status(201).json({ success: true, data: await queryOne(`${SELECT} WHERE b.id = ?`, [id]) });
});

async function insertItems(conn, boqId, items) {
  let sort = 0;
  for (const it of items) {
    if (!it.description) continue;
    await conn.query(
      `INSERT INTO boq_items (boq_id, item_code, description, category_id, unit, estimated_qty, rate, actual_qty, actual_amount, remarks, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [boqId, nullify(it.item_code), it.description, nullify(it.category_id), it.unit || 'nos',
      Number(it.estimated_qty) || 0, Number(it.rate) || 0, Number(it.actual_qty) || 0, Number(it.actual_amount) || 0,
      nullify(it.remarks), sort]
    );
    sort += 1;
  }
}

export const update = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT * FROM boq WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('BOQ not found');
  assertProjectAccess(req, existing.project_id, existing.wing_id);
  const allowed = ['title', 'description', 'status', 'tax_percent', 'discount', 'wing_id'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = nullify(req.body[f]);
  const keys = Object.keys(data);

  await withTransaction(async (conn) => {
    if (keys.length) await conn.query(`UPDATE boq SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
    if (Array.isArray(req.body.items)) {
      await conn.query('DELETE FROM boq_items WHERE boq_id = ?', [req.params.id]);
      await insertItems(conn, req.params.id, req.body.items);
    }
  });
  await audit(req, { action: 'update', module: 'boq', recordId: req.params.id, oldValue: { title: existing.title }, newValue: data });
  res.json({ success: true, data: await queryOne(`${SELECT} WHERE b.id = ?`, [req.params.id]) });
});

export const updateItem = asyncHandler(async (req, res) => {
  const item = await queryOne('SELECT * FROM boq_items WHERE id = ?', [req.params.itemId]);
  if (!item) throw notFound('BOQ item not found');
  const allowed = ['item_code', 'description', 'category_id', 'unit', 'estimated_qty', 'rate', 'actual_qty', 'actual_amount', 'remarks', 'sort_order'];
  const data = {};
  for (const f of allowed) if (req.body[f] !== undefined) data[f] = req.body[f] === '' ? null : req.body[f];
  const keys = Object.keys(data);
  if (keys.length) await query(`UPDATE boq_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), item.id]);
  await audit(req, { action: 'update', module: 'boq', recordId: item.boq_id, newValue: { itemId: item.id, ...data } });
  res.json({ success: true, data: await queryOne('SELECT * FROM boq_items WHERE id = ?', [item.id]) });
});

export const remove = asyncHandler(async (req, res) => {
  const existing = await queryOne('SELECT id, title FROM boq WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('BOQ not found');
  await query('DELETE FROM boq WHERE id = ?', [req.params.id]);
  await audit(req, { action: 'delete', module: 'boq', recordId: req.params.id, oldValue: existing });
  res.json({ success: true, message: 'BOQ deleted' });
});

export const exportBoq = asyncHandler(async (req, res) => {
  const boq = await queryOne('SELECT * FROM boq WHERE id = ?', [req.params.id]);
  if (!boq) throw notFound('BOQ not found');
  const items = await query(
    `SELECT bi.item_code, bi.description, bc.name AS category, bi.unit, bi.estimated_qty, bi.rate, bi.actual_qty
       FROM boq_items bi LEFT JOIN boq_categories bc ON bc.id = bi.category_id WHERE bi.boq_id = ? ORDER BY bi.sort_order, bi.id`, [boq.id]);
  const enriched = items.map((it) => ({ ...it, ...itemVariance(it) }));
  await audit(req, { action: 'export', module: 'boq', recordId: boq.id });
  sendCsv(res, `${boq.boq_number}.csv`, enriched);
});

export const exportAll = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'b.project_id');
  const rows = await query(
    `SELECT b.boq_number, b.title, p.name AS project, w.name AS wing, b.status, b.tax_percent, b.discount,
            t.estimated_total, t.actual_total
       FROM boq b
       JOIN projects p ON p.id = b.project_id LEFT JOIN wings w ON w.id = b.wing_id
       LEFT JOIN (SELECT boq_id, SUM(estimated_qty*rate) estimated_total, SUM(actual_qty*rate) actual_total FROM boq_items GROUP BY boq_id) t
         ON t.boq_id = b.id
      WHERE 1=1 ${scope.clause} ORDER BY b.id DESC LIMIT 5000`, scope.params);
  await audit(req, { action: 'export', module: 'boq' });
  sendCsv(res, 'boq-summary.csv', rows);
});

export const importItemsJson = asyncHandler(async (req, res) => {
  const boq = await queryOne('SELECT * FROM boq WHERE id = ?', [req.params.id]);
  if (!boq) throw notFound('BOQ not found');
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest('rows[] required');
  await withTransaction(async (conn) => {
    await insertItems(conn, boq.id, rows);
  });
  await audit(req, { action: 'import', module: 'boq', recordId: boq.id, newValue: { rows: rows.length } });
  res.json({ success: true, message: `${rows.length} item(s) imported` });
});

export const categories = {
  list: asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await query('SELECT * FROM boq_categories ORDER BY name') });
  }),
  create: asyncHandler(async (req, res) => {
    if (!req.body.name) throw badRequest('name required');
    const r = await query('INSERT INTO boq_categories (name, description) VALUES (?,?)', [req.body.name, nullify(req.body.description)]);
    res.status(201).json({ success: true, data: await queryOne('SELECT * FROM boq_categories WHERE id = ?', [r.insertId]) });
  }),
  update: asyncHandler(async (req, res) => {
    await query('UPDATE boq_categories SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?',
      [nullify(req.body.name), nullify(req.body.description), req.body.is_active === undefined ? null : (req.body.is_active ? 1 : 0), req.params.id]);
    res.json({ success: true, data: await queryOne('SELECT * FROM boq_categories WHERE id = ?', [req.params.id]) });
  }),
  remove: asyncHandler(async (req, res) => {
    await query('DELETE FROM boq_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  }),
};

export const templateCsv = asyncHandler(async (_req, res) => {
  const csv = toCsv([{ item_code: 'CC-001', description: 'M25 RCC in columns', category: 'Concrete Work', unit: 'cum', estimated_qty: 100, rate: 7500, actual_qty: 0 }]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="boq-import-template.csv"');
  res.send(csv);
});
