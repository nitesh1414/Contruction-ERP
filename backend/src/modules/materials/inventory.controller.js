import { query, queryOne, withTransaction } from '../../db/pool.js';
import {
  asyncHandler, badRequest, notFound, parsePagination, nullify, businessNumber,
} from '../../utils/helpers.js';
import { projectScopeSql, assertProjectAccess } from '../../middleware/permissions.js';
import { audit } from '../../utils/audit.js';
import { notify, notifyByPermission, isEventEnabled } from '../../utils/notify.js';

// ===========================================================================
// Material Requirements
// ===========================================================================

export const listRequirements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('mr.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.status) { conditions.push('mr.status = ?'); params.push(req.query.status); }
  const scope = projectScopeSql(req, 'mr.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT mr.*, m.name AS material_name, m.unit AS material_unit, p.name AS project_name, w.name AS wing_name, u.name AS requested_by_name
       FROM material_requirements mr
       JOIN materials m ON m.id = mr.material_id
       JOIN projects p ON p.id = mr.project_id
       LEFT JOIN wings w ON w.id = mr.wing_id
       LEFT JOIN users u ON u.id = mr.requested_by
     ${whereSql} ORDER BY mr.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM material_requirements mr ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const createRequirement = asyncHandler(async (req, res) => {
  const { project_id, wing_id, material_id, required_qty, unit, required_date, remarks } = req.body;
  if (!project_id || !material_id || !required_qty || !unit) throw badRequest('project_id, material_id, required_qty and unit are required');
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO material_requirements (requirement_no, project_id, wing_id, material_id, required_qty, unit, required_date, requested_by, remarks)
       VALUES ('TMP',?,?,?,?,?,?,?,?)`,
      [project_id, nullify(wing_id), material_id, required_qty, unit, nullify(required_date), req.user.id, nullify(remarks)]
    );
    await conn.query('UPDATE material_requirements SET requirement_no = ? WHERE id = ?', [businessNumber('requirement', r.insertId), r.insertId]);
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'materials', recordId: id, newValue: req.body });
  if (await isEventEnabled('po_approval')) {
    await notifyByPermission('materials.approve', {
      title: 'New material requirement awaiting approval',
      message: `Material requirement for project #${project_id} needs your approval.`,
      type: 'info', module: 'materials', recordId: id,
    });
  }
  const row = await queryOne('SELECT * FROM material_requirements WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

export const setRequirementStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'cancelled', 'po_created', 'fulfilled'].includes(status)) {
    throw badRequest('Invalid status');
  }
  const existing = await queryOne('SELECT * FROM material_requirements WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Requirement not found');
  await query('UPDATE material_requirements SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?', [status, req.user.id, req.params.id]);
  await audit(req, { action: status, module: 'materials', recordId: req.params.id });
  res.json({ success: true, data: await queryOne('SELECT * FROM material_requirements WHERE id = ?', [req.params.id]) });
});

// ===========================================================================
// Purchase Orders
// ===========================================================================

export const listPurchaseOrders = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('po.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.status) { conditions.push('po.status = ?'); params.push(req.query.status); }
  if (req.query.supplierId) { conditions.push('po.supplier_id = ?'); params.push(req.query.supplierId); }
  if (req.query.search) { conditions.push('po.po_number LIKE ?'); params.push(`%${req.query.search}%`); }
  const scope = projectScopeSql(req, 'po.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT po.*, p.name AS project_name, s.name AS supplier_name, u.name AS created_by_name
       FROM purchase_orders po
       JOIN projects p ON p.id = po.project_id
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
     ${whereSql} ORDER BY po.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM purchase_orders po ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await queryOne(
    `SELECT po.*, p.name AS project_name, s.name AS supplier_name, s.code AS supplier_code
       FROM purchase_orders po JOIN projects p ON p.id = po.project_id JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`,
    [req.params.id]);
  if (!po) throw notFound('Purchase order not found');
  const items = await query(
    `SELECT poi.*, m.name AS material_name, m.code AS material_code
       FROM purchase_order_items poi JOIN materials m ON m.id = poi.material_id WHERE poi.po_id = ? ORDER BY poi.id`, [po.id]);
  const receipts = await query(
    `SELECT mr.*, s.name AS supplier_name FROM material_receipts mr LEFT JOIN suppliers s ON s.id = mr.supplier_id WHERE mr.po_id = ? ORDER BY mr.id DESC`, [po.id]);
  res.json({ success: true, data: { ...po, items, receipts } });
});

function computePoTotals(items, discount = 0) {
  let subtotal = 0;
  let tax = 0;
  const computed = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    const taxPercent = Number(it.tax_percent) || 0;
    const line = qty * rate;
    const lineTax = line * (taxPercent / 100);
    subtotal += line;
    tax += lineTax;
    return { ...it, amount: +(line + lineTax).toFixed(2) };
  });
  const d = Number(discount) || 0;
  return { computed, subtotal: +subtotal.toFixed(2), tax_amount: +tax.toFixed(2), grand_total: +(subtotal + tax - d).toFixed(2) };
}

export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { project_id, wing_id, supplier_id, po_date, expected_delivery_date, discount = 0, remarks, items = [] } = req.body;
  if (!project_id || !supplier_id || !po_date) throw badRequest('project_id, supplier_id and po_date are required');
  if (!items.length) throw badRequest('At least one PO item is required');
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);
  for (const it of items) {
    if (!it.material_id || !it.quantity || !it.unit) throw badRequest('Each item needs material_id, quantity and unit');
  }
  const { computed, subtotal, tax_amount, grand_total } = computePoTotals(items, discount);

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO purchase_orders (po_number, project_id, wing_id, supplier_id, po_date, expected_delivery_date, status, subtotal, discount, tax_amount, grand_total, remarks, created_by)
       VALUES ('TMP',?,?,?,?,?,'draft',?,?,?,?,?,?)`,
      [project_id, nullify(wing_id), supplier_id, po_date, nullify(expected_delivery_date), subtotal, discount, tax_amount, grand_total, nullify(remarks), req.user.id]
    );
    const poId = r.insertId;
    await conn.query('UPDATE purchase_orders SET po_number = ? WHERE id = ?', [businessNumber('po', poId), poId]);
    for (const it of computed) {
      await conn.query(
        `INSERT INTO purchase_order_items (po_id, material_id, quantity, unit, rate, tax_percent, amount) VALUES (?,?,?,?,?,?,?)`,
        [poId, it.material_id, it.quantity, it.unit, Number(it.rate) || 0, Number(it.tax_percent) || 0, it.amount]
      );
    }
    return poId;
  });
  await audit(req, { action: 'create', module: 'purchase_orders', recordId: id, newValue: { supplier_id, items: items.length, grand_total } });
  const po = await queryOne('SELECT * FROM purchase_orders WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: po });
});

export const setPurchaseOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ['draft', 'pending_approval', 'approved', 'sent', 'cancelled', 'received', 'partially_received'];
  if (!allowed.includes(status)) throw badRequest('Invalid status');
  const po = await queryOne('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
  if (!po) throw notFound('Purchase order not found');

  // approve action requires approve permission (enforced at route level)
  const approving = status === 'approved';
  await query('UPDATE purchase_orders SET status = ?, approved_by = IF(? = 1, ?, approved_by), approved_at = IF(? = 1, NOW(), approved_at) WHERE id = ?',
    [status, approving ? 1 : 0, req.user.id, approving ? 1 : 0, req.params.id]);
  await audit(req, { action: status, module: 'purchase_orders', recordId: req.params.id });
  if (approving && po.created_by && (await isEventEnabled('po_approval'))) {
    await notify(po.created_by, { title: `PO ${po.po_number} approved`, message: `Purchase order ${po.po_number} has been approved.`, type: 'success', module: 'purchase_orders', recordId: po.id });
  }
  res.json({ success: true, data: await queryOne('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]) });
});

// ===========================================================================
// Material Receipts (GRN)
// ===========================================================================

export const listReceipts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('mr.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.poId) { conditions.push('mr.po_id = ?'); params.push(req.query.poId); }
  const scope = projectScopeSql(req, 'mr.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT mr.*, p.name AS project_name, s.name AS supplier_name, po.po_number
       FROM material_receipts mr
       JOIN projects p ON p.id = mr.project_id
       LEFT JOIN suppliers s ON s.id = mr.supplier_id
       LEFT JOIN purchase_orders po ON po.id = mr.po_id
     ${whereSql} ORDER BY mr.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM material_receipts mr ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const getReceipt = asyncHandler(async (req, res) => {
  const receipt = await queryOne(
    `SELECT mr.*, p.name AS project_name, s.name AS supplier_name, po.po_number
       FROM material_receipts mr JOIN projects p ON p.id = mr.project_id
       LEFT JOIN suppliers s ON s.id = mr.supplier_id LEFT JOIN purchase_orders po ON po.id = mr.po_id
      WHERE mr.id = ?`, [req.params.id]);
  if (!receipt) throw notFound('Receipt not found');
  const items = await query(
    `SELECT mri.*, m.name AS material_name, m.code AS material_code
       FROM material_receipt_items mri JOIN materials m ON m.id = mri.material_id WHERE mri.receipt_id = ?`, [receipt.id]);
  res.json({ success: true, data: { ...receipt, items } });
});

export const createReceipt = asyncHandler(async (req, res) => {
  const { po_id, project_id, receipt_date, challan_number, remarks, items = [] } = req.body;
  if (!project_id || !receipt_date) throw badRequest('project_id and receipt_date are required');
  if (!items.length) throw badRequest('At least one receipt item is required');
  assertProjectAccess(req, Number(project_id));
  for (const it of items) {
    if (!it.material_id || it.received_qty === undefined) throw badRequest('Each item needs material_id and received_qty');
  }

  const id = await withTransaction(async (conn) => {
    let supplierId = null;
    if (po_id) {
      const [poRows] = await conn.query('SELECT supplier_id FROM purchase_orders WHERE id = ?', [po_id]);
      if (poRows.length) supplierId = poRows[0].supplier_id;
    }
    const [r] = await conn.query(
      `INSERT INTO material_receipts (grn_number, po_id, project_id, supplier_id, receipt_date, challan_number, remarks, received_by)
       VALUES ('TMP',?,?,?,?,?,?,?)`,
      [nullify(po_id), project_id, nullify(req.body.supplier_id || supplierId), receipt_date, nullify(challan_number), nullify(remarks), req.user.id]
    );
    const receiptId = r.insertId;
    await conn.query('UPDATE material_receipts SET grn_number = ? WHERE id = ?', [businessNumber('grn', receiptId), receiptId]);

    for (const it of items) {
      const received = Number(it.received_qty) || 0;
      const damaged = Number(it.damaged_qty) || 0;
      const accepted = Math.max(0, received - damaged);
      const unit = it.unit || 'nos';
      await conn.query(
        `INSERT INTO material_receipt_items (receipt_id, po_item_id, material_id, unit, received_qty, damaged_qty, accepted_qty)
         VALUES (?,?,?,?,?,?,?)`,
        [receiptId, nullify(it.po_item_id), it.material_id, unit, received, damaged, accepted]
      );
      // stock: accepted in, damaged recorded separately
      if (accepted > 0) {
        await conn.query(
          `INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, remarks, created_by)
           VALUES (?,?, 'receipt', ?, 'material_receipt', ?, ?, ?, ?)`,
          [project_id, it.material_id, accepted, receiptId, receipt_date, `GRN ${receiptId}`, req.user.id]
        );
      }
      if (damaged > 0) {
        await conn.query(
          `INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, remarks, created_by)
           VALUES (?,?, 'damage', ?, 'material_receipt', ?, ?, ?, ?)`,
          [project_id, it.material_id, -damaged, receiptId, receipt_date, 'Damaged on receipt', req.user.id]
        );
      }
      if (it.po_item_id) {
        await conn.query('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?', [accepted, it.po_item_id]);
      }
    }
    // Update PO received status
    if (po_id) {
      await conn.query(
        `UPDATE purchase_orders SET status = (
           SELECT CASE WHEN SUM(poi.received_qty) >= SUM(poi.quantity) THEN 'received' ELSE 'partially_received' END
             FROM purchase_order_items poi WHERE poi.po_id = ?)
         WHERE id = ? AND status NOT IN ('draft','pending_approval','cancelled')`, [po_id, po_id]);
    }
    return receiptId;
  });

  await audit(req, { action: 'create', module: 'inventory', recordId: id, newValue: { po_id, items: items.length } });
  if (await isEventEnabled('material_received')) {
    await notifyByPermission('materials.view', {
      title: 'Material received', message: `A material receipt (GRN) was recorded for project #${project_id}.`, type: 'success', module: 'inventory', recordId: id,
    });
  }
  const receipt = await queryOne('SELECT * FROM material_receipts WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: receipt });
});

// ===========================================================================
// Consumption & Returns
// ===========================================================================

export const listConsumption = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('mc.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.materialId) { conditions.push('mc.material_id = ?'); params.push(req.query.materialId); }
  const scope = projectScopeSql(req, 'mc.project_id');
  const whereSql = (conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1') + scope.clause;
  params.push(...scope.params);
  const rows = await query(
    `SELECT mc.*, m.name AS material_name, m.code AS material_code, p.name AS project_name, w.name AS wing_name, f.name AS floor_name, u.name AS used_by_name
       FROM material_consumption mc
       JOIN materials m ON m.id = mc.material_id
       JOIN projects p ON p.id = mc.project_id
       LEFT JOIN wings w ON w.id = mc.wing_id LEFT JOIN floors f ON f.id = mc.floor_id
       LEFT JOIN users u ON u.id = mc.used_by
     ${whereSql} ORDER BY mc.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const count = await queryOne(`SELECT COUNT(*) AS total FROM material_consumption mc ${whereSql}`, params);
  res.json({ success: true, data: rows, pagination: { page, limit, total: Number(count.total), totalPages: Math.ceil(count.total / limit) } });
});

export const createConsumption = asyncHandler(async (req, res) => {
  const { project_id, wing_id, floor_id, material_id, quantity, unit, consumption_date, location, remarks } = req.body;
  if (!project_id || !material_id || !quantity || !unit || !consumption_date) {
    throw badRequest('project_id, material_id, quantity, unit and consumption_date are required');
  }
  assertProjectAccess(req, Number(project_id), wing_id ? Number(wing_id) : null);

  // prevent overdrawing stock
  const stock = await queryOne(
    `SELECT COALESCE(SUM(quantity),0) AS qty FROM stock_transactions WHERE project_id = ? AND material_id = ?`, [project_id, material_id]);
  if (Number(stock.qty) < Number(quantity)) {
    throw badRequest(`Insufficient stock. Available: ${stock.qty}`);
  }

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO material_consumption (project_id, wing_id, floor_id, material_id, quantity, unit, consumption_date, location, used_by, remarks)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [project_id, nullify(wing_id), nullify(floor_id), material_id, quantity, unit, consumption_date, nullify(location), req.user.id, nullify(remarks)]
    );
    await conn.query(
      `INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, remarks, created_by)
       VALUES (?,?, 'consumption', ?, 'material_consumption', ?, ?, ?, ?)`,
      [project_id, material_id, -Number(quantity), r.insertId, consumption_date, nullify(remarks), req.user.id]
    );
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'inventory', recordId: id, newValue: req.body });
  await maybeNotifyLowStock(project_id, material_id);
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM material_consumption WHERE id = ?', [id]) });
});

export const listReturns = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'mr.project_id');
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('mr.project_id = ?'); params.push(req.query.projectId); }
  const rows = await query(
    `SELECT mr.*, m.name AS material_name, p.name AS project_name, u.name AS returned_by_name
       FROM material_returns mr
       JOIN materials m ON m.id = mr.material_id JOIN projects p ON p.id = mr.project_id
       LEFT JOIN users u ON u.id = mr.returned_by
     WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
     ORDER BY mr.id DESC LIMIT 500`, [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

export const createReturn = asyncHandler(async (req, res) => {
  const { project_id, material_id, quantity, unit, return_date, reason, remarks } = req.body;
  if (!project_id || !material_id || !quantity || !unit || !return_date) throw badRequest('project_id, material_id, quantity, unit, return_date required');
  assertProjectAccess(req, Number(project_id));
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO material_returns (project_id, material_id, quantity, unit, return_date, reason, returned_by, status, remarks)
       VALUES (?,?,?,?,?,?,?, 'pending', ?)`,
      [project_id, material_id, quantity, unit, return_date, nullify(reason), req.user.id, nullify(remarks)]
    );
    return r.insertId;
  });
  await audit(req, { action: 'create', module: 'inventory', recordId: id, newValue: req.body });
  res.status(201).json({ success: true, data: await queryOne('SELECT * FROM material_returns WHERE id = ?', [id]) });
});

/** Approve a return: moves stock out. */
export const approveReturn = asyncHandler(async (req, res) => {
  const ret = await queryOne('SELECT * FROM material_returns WHERE id = ?', [req.params.id]);
  if (!ret) throw notFound('Return not found');
  if (ret.status !== 'pending') throw badRequest('Return already processed');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE material_returns SET status = ? WHERE id = ?', ['completed', ret.id]);
    await conn.query(
      `INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, remarks, created_by)
       VALUES (?,?, 'return', ?, 'material_return', ?, ?, ?, ?)`,
      [ret.project_id, ret.material_id, -Number(ret.quantity), ret.id, ret.return_date, ret.reason, req.user.id]
    );
  });
  await audit(req, { action: 'approve', module: 'inventory', recordId: ret.id });
  res.json({ success: true, data: await queryOne('SELECT * FROM material_returns WHERE id = ?', [ret.id]) });
});

// ===========================================================================
// Stock
// ===========================================================================

export const stockSummary = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'vs.project_id');
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('vs.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.search) { conditions.push('(vs.material_name LIKE ? OR vs.material_code LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const rows = await query(
    `SELECT vs.*, (vs.current_stock <= vs.min_stock_level AND vs.min_stock_level > 0) AS low_stock
       FROM v_stock_summary vs
     WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
     ORDER BY vs.project_id, vs.material_name LIMIT 2000`,
    [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

export const stockTransactions = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'st.project_id');
  const conditions = [];
  const params = [];
  if (req.query.projectId) { conditions.push('st.project_id = ?'); params.push(req.query.projectId); }
  if (req.query.materialId) { conditions.push('st.material_id = ?'); params.push(req.query.materialId); }
  const rows = await query(
    `SELECT st.*, m.name AS material_name, m.code AS material_code, p.name AS project_name, u.name AS created_by_name
       FROM stock_transactions st
       JOIN materials m ON m.id = st.material_id JOIN projects p ON p.id = st.project_id
       LEFT JOIN users u ON u.id = st.created_by
     WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
     ORDER BY st.id DESC LIMIT 1000`,
    [...params, ...scope.params]);
  res.json({ success: true, data: rows });
});

export const lowStockAlerts = asyncHandler(async (req, res) => {
  const scope = projectScopeSql(req, 'vs.project_id');
  const rows = await query(
    `SELECT vs.* FROM v_stock_summary vs
      WHERE vs.min_stock_level > 0 AND vs.current_stock <= vs.min_stock_level ${scope.clause}
      ORDER BY (vs.current_stock / NULLIF(vs.min_stock_level,0)) ASC LIMIT 100`, scope.params);
  res.json({ success: true, data: rows });
});

async function maybeNotifyLowStock(projectId, materialId) {
  const row = await queryOne(
    `SELECT vs.current_stock, vs.min_stock_level, vs.material_name FROM v_stock_summary vs WHERE vs.project_id = ? AND vs.material_id = ?`,
    [projectId, materialId]
  );
  if (row && row.min_stock_level > 0 && Number(row.current_stock) <= Number(row.min_stock_level)) {
    if (await isEventEnabled('material_shortage')) {
      await notifyByPermission('materials.view', {
        title: `Low stock: ${row.material_name}`,
        message: `Stock for ${row.material_name} is at ${row.current_stock} (min level ${row.min_stock_level}).`,
        type: 'warning', module: 'inventory', recordId: String(materialId),
      });
    }
  }
}
