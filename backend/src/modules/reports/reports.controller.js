import { query } from '../../db/pool.js';
import { asyncHandler } from '../../utils/helpers.js';
import { projectScopeSql } from '../../middleware/permissions.js';
import { sendCsv } from '../../utils/csv.js';
import { audit } from '../../utils/audit.js';

/**
 * Report definitions. Each report returns either JSON data or a CSV download
 * (?format=csv). All queries are project-scope aware.
 */

const REPORTS = {
  'project-progress': {
    label: 'Project Progress',
    run: async (req) => {
      const scope = projectScopeSql(req, 'p.id');
      return query(
        `SELECT p.code, p.name, p.status, p.overall_progress, p.start_date, p.expected_completion_date,
                (SELECT COUNT(*) FROM wings w WHERE w.project_id = p.id) AS wings,
                (SELECT COALESCE(AVG(w.progress),0) FROM wings w WHERE w.project_id = p.id) AS avg_wing_progress
           FROM projects p WHERE 1=1 ${scope.clause} ORDER BY p.name`, scope.params);
    },
  },
  'daily-progress': {
    label: 'Daily Progress',
    run: async (req) => {
      const scope = projectScopeSql(req, 'dp.project_id');
      const conditions = [];
      const params = [];
      if (req.query.projectId) { conditions.push('dp.project_id = ?'); params.push(req.query.projectId); }
      if (req.query.from) { conditions.push('dp.report_date >= ?'); params.push(req.query.from); }
      if (req.query.to) { conditions.push('dp.report_date <= ?'); params.push(req.query.to); }
      return query(
        `SELECT dp.report_date, p.name AS project, w.name AS wing, f.name AS floor,
                dp.percentage, dp.labour_count, dp.work_description, u.name AS reported_by
           FROM daily_progress dp
           JOIN projects p ON p.id = dp.project_id
           LEFT JOIN wings w ON w.id = dp.wing_id LEFT JOIN floors f ON f.id = dp.floor_id
           LEFT JOIN users u ON u.id = dp.created_by
          WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
          ORDER BY dp.report_date DESC LIMIT 10000`, [...params, ...scope.params]);
    },
  },
  milestones: {
    label: 'Milestones',
    run: async (req) => {
      const scope = projectScopeSql(req, 'm.project_id');
      return query(
        `SELECT p.name AS project, w.name AS wing, m.name, m.status, m.percentage, m.start_date, m.target_date, m.completion_date
           FROM milestones m JOIN projects p ON p.id = m.project_id LEFT JOIN wings w ON w.id = m.wing_id
          WHERE 1=1 ${scope.clause} ORDER BY m.target_date LIMIT 10000`, scope.params);
    },
  },
  'material-stock': {
    label: 'Material Stock',
    run: async (req) => {
      const scope = projectScopeSql(req, 'vs.project_id');
      return query(`SELECT vs.project_name, vs.material_name, vs.material_code, vs.unit, vs.total_received, vs.total_consumed, vs.total_damaged, vs.total_returned, vs.current_stock, vs.min_stock_level FROM v_stock_summary vs WHERE 1=1 ${scope.clause} ORDER BY vs.project_name, vs.material_name LIMIT 10000`, scope.params);
    },
  },
  'material-consumption': {
    label: 'Material Consumption',
    run: async (req) => {
      const scope = projectScopeSql(req, 'mc.project_id');
      return query(
        `SELECT mc.consumption_date, p.name AS project, m.name AS material, m.code, mc.quantity, mc.unit, w.name AS wing, f.name AS floor, mc.location
           FROM material_consumption mc JOIN projects p ON p.id = mc.project_id JOIN materials m ON m.id = mc.material_id
           LEFT JOIN wings w ON w.id = mc.wing_id LEFT JOIN floors f ON f.id = mc.floor_id
          WHERE 1=1 ${scope.clause} ORDER BY mc.consumption_date DESC LIMIT 10000`, scope.params);
    },
  },
  'purchase-orders': {
    label: 'Purchase Orders',
    run: async (req) => {
      const scope = projectScopeSql(req, 'po.project_id');
      return query(
        `SELECT po.po_number, p.name AS project, s.name AS supplier, po.po_date, po.status, po.subtotal, po.tax_amount, po.discount, po.grand_total
           FROM purchase_orders po JOIN projects p ON p.id = po.project_id JOIN suppliers s ON s.id = po.supplier_id
          WHERE 1=1 ${scope.clause} ORDER BY po.po_date DESC LIMIT 10000`, scope.params);
    },
  },
  billing: {
    label: 'Billing & Cost',
    run: async (req) => {
      const scope = projectScopeSql(req, 'ce.project_id');
      return query(
        `SELECT ce.entry_date, p.name AS project, w.name AS wing, ce.entry_type, ce.category, ce.description, ce.bill_number,
                ce.quantity, ce.unit, ce.rate, ce.tax_percent, ce.tax_amount, ce.total_amount, ce.paid_amount, ce.pending_amount, ce.payment_status
           FROM cost_entries ce JOIN projects p ON p.id = ce.project_id LEFT JOIN wings w ON w.id = ce.wing_id
          WHERE 1=1 ${scope.clause} ORDER BY ce.entry_date DESC LIMIT 10000`, scope.params);
    },
  },
  boq: {
    label: 'BOQ Summary',
    run: async (req) => {
      const scope = projectScopeSql(req, 'b.project_id');
      return query(
        `SELECT b.boq_number, b.title, p.name AS project, w.name AS wing, b.status,
                t.estimated_total, t.actual_total, (t.actual_total - t.estimated_total) AS variance
           FROM boq b JOIN projects p ON p.id = b.project_id LEFT JOIN wings w ON w.id = b.wing_id
           LEFT JOIN (SELECT boq_id, SUM(estimated_qty*rate) estimated_total, SUM(actual_qty*rate) actual_total FROM boq_items GROUP BY boq_id) t ON t.boq_id = b.id
          WHERE 1=1 ${scope.clause} ORDER BY b.id DESC LIMIT 10000`, scope.params);
    },
  },
  'test-reports': {
    label: 'Test Reports',
    run: async (req) => {
      const scope = projectScopeSql(req, 'tr.project_id');
      return query(
        `SELECT tr.test_number, tt.name AS test_type, p.name AS project, w.name AS wing, tr.sample_date, tr.test_date, tr.laboratory, tr.result_status, tr.status
           FROM test_reports tr JOIN test_types tt ON tt.id = tr.test_type_id JOIN projects p ON p.id = tr.project_id LEFT JOIN wings w ON w.id = tr.wing_id
          WHERE 1=1 ${scope.clause} ORDER BY tr.test_date DESC LIMIT 10000`, scope.params);
    },
  },
  inspections: {
    label: 'Inspection Reports',
    run: async (req) => {
      const scope = projectScopeSql(req, 'i.project_id');
      return query(
        `SELECT i.inspection_number, it.name AS type, p.name AS project, w.name AS wing, i.location, i.inspection_date, i.status, u.name AS inspector
           FROM inspections i JOIN inspection_types it ON it.id = i.inspection_type_id JOIN projects p ON p.id = i.project_id
           LEFT JOIN wings w ON w.id = i.wing_id LEFT JOIN users u ON u.id = i.inspector_id
          WHERE 1=1 ${scope.clause} ORDER BY i.inspection_date DESC LIMIT 10000`, scope.params);
    },
  },
  issues: {
    label: 'Issues',
    run: async (req) => {
      const scope = projectScopeSql(req, 'i.project_id');
      return query(
        `SELECT i.issue_number, p.name AS project, w.name AS wing, i.title, c.name AS category, i.priority, i.status, i.due_date, ru.name AS raised_by, au.name AS assigned_to
           FROM issues i JOIN projects p ON p.id = i.project_id LEFT JOIN wings w ON w.id = i.wing_id
           LEFT JOIN issue_categories c ON c.id = i.category_id
           LEFT JOIN users ru ON ru.id = i.raised_by LEFT JOIN users au ON au.id = i.assigned_to
          WHERE 1=1 ${scope.clause} ORDER BY i.id DESC LIMIT 10000`, scope.params);
    },
  },
  attendance: {
    label: 'Worker Attendance',
    run: async (req) => {
      const scope = projectScopeSql(req, 'a.project_id');
      const conditions = [];
      const params = [];
      if (req.query.from) { conditions.push('a.attendance_date >= ?'); params.push(req.query.from); }
      if (req.query.to) { conditions.push('a.attendance_date <= ?'); params.push(req.query.to); }
      return query(
        `SELECT a.attendance_date, wk.worker_code, wk.name AS worker, wc.name AS category, c.name AS contractor,
                p.name AS project, a.status, a.overtime_hours, a.daily_amount, a.overtime_amount, a.payment_status
           FROM attendance a JOIN workers wk ON wk.id = a.worker_id
           LEFT JOIN worker_categories wc ON wc.id = wk.category_id LEFT JOIN contractors c ON c.id = wk.contractor_id
           JOIN projects p ON p.id = a.project_id
          WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ${scope.clause}
          ORDER BY a.attendance_date DESC LIMIT 20000`, [...params, ...scope.params]);
    },
  },
  sales: {
    label: 'Sales',
    run: async (req) => {
      const scope = projectScopeSql(req, 's.project_id');
      return query(
        `SELECT p.name AS project, w.name AS wing, f.name AS floor, un.unit_number, un.unit_type, s.customer_name, s.customer_phone,
                s.sale_date, s.sale_amount, s.amount_received, s.pending_amount, s.payment_status, s.is_gst, s.gst_amount
           FROM sales s JOIN projects p ON p.id = s.project_id JOIN wings w ON w.id = s.wing_id
           LEFT JOIN floors f ON f.id = s.floor_id JOIN units un ON un.id = s.unit_id
          WHERE s.status != 'cancelled' ${scope.clause} ORDER BY s.sale_date DESC LIMIT 10000`, scope.params);
    },
  },
  'budget-vs-actual': {
    label: 'Budget vs Actual',
    run: async (req) => {
      const scope = projectScopeSql(req, 'p.id');
      return query(
        `SELECT p.code, p.name, p.budget, COALESCE(c.total_cost, 0) AS actual_cost,
                (p.budget - COALESCE(c.total_cost,0)) AS variance,
                ROUND(COALESCE(c.total_cost,0) / NULLIF(p.budget,0) * 100, 2) AS used_percent
           FROM projects p LEFT JOIN (SELECT project_id, SUM(total_amount) AS total_cost FROM cost_entries GROUP BY project_id) c ON c.project_id = p.id
          WHERE 1=1 ${scope.clause} ORDER BY p.budget DESC LIMIT 10000`, scope.params);
    },
  },
  'pending-collections': {
    label: 'Pending Collections',
    run: async (req) => {
      const scope = projectScopeSql(req, 's.project_id');
      return query(
        `SELECT p.name AS project, w.name AS wing, un.unit_number, s.customer_name, s.customer_phone,
                s.sale_amount, s.amount_received, s.pending_amount, s.payment_status
           FROM sales s JOIN projects p ON p.id = s.project_id JOIN wings w ON w.id = s.wing_id JOIN units un ON un.id = s.unit_id
          WHERE s.pending_amount > 0 AND s.status != 'cancelled' ${scope.clause} ORDER BY s.pending_amount DESC LIMIT 10000`, scope.params);
    },
  },
  'labour-payments': {
    label: 'Labour Payments',
    run: async (req) => {
      const scope = projectScopeSql(req, 'lp.project_id');
      return query(
        `SELECT wk.worker_code, wk.name AS worker, p.name AS project, lp.period_start, lp.period_end, lp.total_days, lp.total_overtime_hours,
                lp.gross_amount, lp.deductions, lp.net_amount, lp.paid_amount, lp.status, lp.payment_date, lp.payment_mode
           FROM labour_payments lp JOIN workers wk ON wk.id = lp.worker_id JOIN projects p ON p.id = lp.project_id
          WHERE 1=1 ${scope.clause} ORDER BY lp.id DESC LIMIT 10000`, scope.params);
    },
  },
};

export const listReports = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: Object.entries(REPORTS).map(([key, def]) => ({ key, label: def.label })),
  });
});

export const runReport = asyncHandler(async (req, res) => {
  const def = REPORTS[req.params.key];
  if (!def) return res.status(404).json({ success: false, message: `Unknown report: ${req.params.key}` });
  const rows = await def.run(req);
  if (req.query.format === 'csv') {
    await audit(req, { action: 'export', module: 'reports', recordId: req.params.key });
    return sendCsv(res, `${req.params.key}.csv`, rows);
  }
  res.json({ success: true, label: def.label, data: rows });
});
