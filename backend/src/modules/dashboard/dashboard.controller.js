import { query, queryOne } from '../../db/pool.js';
import { asyncHandler } from '../../utils/helpers.js';
import { projectScopeSql } from '../../middleware/permissions.js';
import { notifyOverdueIssues } from '../issues/issues.controller.js';
import { notifyExpiringDocuments } from '../documents/documents.controller.js';
import { notifyPendingCollections } from '../sales/sales.controller.js';

const single = async (sql, params) => {
  const row = await queryOne(sql, params);
  return row || {};
};

/** GET /api/dashboard/overview — permission/project-scope aware. */
export const overview = asyncHandler(async (req, res) => {
  // opportunistic housekeeping notifications (rate-limited naturally by volume of endpoints)
  try {
    await notifyOverdueIssues();
  } catch { /* non-fatal */ }

  const ps = projectScopeSql(req, 'p.id');
  const scopeOf = (col) => projectScopeSql(req, col);
  const wingScope = scopeOf('w.project_id');
  const dpScope = scopeOf('dp.project_id');
  const vsScope = scopeOf('vs.project_id');
  const iScope = scopeOf('i.project_id');
  const psp = scopeOf('project_id');

  const [projectsByStatus, projectAgg, wingAgg, progress30d, lowStock, openIssues, pendingInspections, pendingTestReports, attendanceToday, pendingLabourPayments, pendingCostPayments, salesAgg, totalCost, milestonesAgg, recentProgress, recentIssues, docsExpiring] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM projects p WHERE 1=1 ${ps.clause} GROUP BY status`, ps.params),
    single(`SELECT COUNT(*) AS total, AVG(overall_progress) AS avg_progress, SUM(budget) AS total_budget FROM projects p WHERE 1=1 ${ps.clause}`, ps.params),
    single(`SELECT COUNT(*) AS total FROM wings w WHERE 1=1 ${wingScope.clause}`, wingScope.params),
    query(
      `SELECT report_date AS d, COUNT(*) AS reports, AVG(percentage) AS avg_pct
         FROM daily_progress dp WHERE dp.report_date >= CURDATE() - INTERVAL 30 DAY ${dpScope.clause}
         GROUP BY dp.report_date ORDER BY dp.report_date`, dpScope.params),
    single(`SELECT COUNT(*) AS count FROM v_stock_summary vs WHERE vs.min_stock_level > 0 AND vs.current_stock <= vs.min_stock_level ${vsScope.clause}`, vsScope.params),
    single(`SELECT COUNT(*) AS count, SUM(i.priority IN ('high','critical')) AS critical FROM issues i WHERE i.status IN ('open','assigned','in_progress','reopened') ${iScope.clause}`, iScope.params),
    single(`SELECT COUNT(*) AS count FROM inspections i WHERE i.status IN ('pending','reinspection_required') ${iScope.clause}`, iScope.params),
    single(`SELECT COUNT(*) AS count FROM test_reports WHERE result_status = 'pending' ${psp.clause}`, psp.params),
    query(`SELECT status, COUNT(*) AS count FROM attendance WHERE attendance_date = CURDATE() ${psp.clause} GROUP BY status`, psp.params),
    single(`SELECT COALESCE(SUM(net_amount - paid_amount),0) AS amount, COUNT(*) AS count FROM labour_payments WHERE status != 'paid' ${psp.clause}`, psp.params),
    single(`SELECT COALESCE(SUM(pending_amount),0) AS amount FROM cost_entries WHERE payment_status != 'paid' ${psp.clause}`, psp.params),
    single(`SELECT COUNT(*) AS units_sold, COALESCE(SUM(sale_amount),0) AS sales_value, COALESCE(SUM(amount_received),0) AS received, COALESCE(SUM(pending_amount),0) AS pending FROM sales WHERE status != 'cancelled' ${psp.clause}`, psp.params),
    single(`SELECT COALESCE(SUM(total_amount),0) AS total_cost FROM cost_entries WHERE 1=1 ${psp.clause}`, psp.params),
    query(`SELECT status, COUNT(*) AS count FROM milestones WHERE 1=1 ${psp.clause} GROUP BY status`, psp.params),
    query(
      `SELECT dp.id, dp.report_date, dp.percentage, dp.work_description, p.name AS project_name, w.name AS wing_name, u.name AS created_by_name
         FROM daily_progress dp
         JOIN projects p ON p.id = dp.project_id LEFT JOIN wings w ON w.id = dp.wing_id LEFT JOIN users u ON u.id = dp.created_by
        WHERE 1=1 ${dpScope.clause}
        ORDER BY dp.id DESC LIMIT 8`, dpScope.params),
    query(
      `SELECT i.id, i.issue_number, i.title, i.priority, i.status, p.name AS project_name
         FROM issues i JOIN projects p ON p.id = i.project_id
        WHERE i.status IN ('open','assigned','in_progress','reopened') ${iScope.clause}
        ORDER BY FIELD(i.priority,'critical','high','medium','low'), i.id DESC LIMIT 8`, iScope.params),
    query(
      `SELECT id, title, expiry_date FROM project_documents
        WHERE expiry_date IS NOT NULL AND expiry_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 30 DAY ${psp.clause}
        ORDER BY expiry_date LIMIT 8`, psp.params),
  ]);

  // budget vs actual
  const budgetVsActual = await query(
    `SELECT p.id, p.name, p.code, p.budget, COALESCE(c.total_cost,0) AS actual_cost
       FROM projects p LEFT JOIN (
         SELECT project_id, SUM(total_amount) AS total_cost FROM cost_entries GROUP BY project_id
       ) c ON c.project_id = p.id
      WHERE p.status != 'cancelled' ${ps.clause} ORDER BY p.budget DESC LIMIT 10`, ps.params);

  res.json({
    success: true,
    data: {
      projects: {
        total: Number(projectAgg.total) || 0,
        avgProgress: +(Number(projectAgg.avg_progress) || 0).toFixed(1),
        totalBudget: Number(projectAgg.total_budget) || 0,
        byStatus: projectsByStatus,
      },
      wings: { total: Number(wingAgg.total) || 0 },
      progressTrend: progress30d,
      materials: { lowStockCount: Number(lowStock.count) || 0 },
      issues: { open: Number(openIssues.count) || 0, critical: Number(openIssues.critical) || 0 },
      inspections: { pending: Number(pendingInspections.count) || 0 },
      testReports: { pending: Number(pendingTestReports.count) || 0 },
      attendanceToday,
      payments: {
        labour: { count: Number(pendingLabourPayments.count) || 0, amount: Number(pendingLabourPayments.amount) || 0 },
        vendors: { amount: Number(pendingCostPayments.amount) || 0 },
      },
      sales: {
        unitsSold: Number(salesAgg.units_sold) || 0,
        value: Number(salesAgg.sales_value) || 0,
        received: Number(salesAgg.received) || 0,
        pending: Number(salesAgg.pending) || 0,
      },
      costs: { total: Number(totalCost.total_cost) || 0 },
      milestones: milestonesAgg,
      recentProgress,
      recentIssues,
      documentsExpiring: docsExpiring,
      budgetVsActual,
    },
  });
});

/** GET /api/dashboard/wing/:wingId */
export const wingDashboard = asyncHandler(async (req, res) => {
  const wingId = req.params.wingId;
  const wing = await queryOne('SELECT w.*, p.name AS project_name FROM wings w JOIN projects p ON p.id = w.project_id WHERE w.id = ?', [wingId]);
  if (!wing) return res.status(404).json({ success: false, message: 'Wing not found' });

  const [floors, recentProgress, activeIssues, inspections, materialStatus, attendanceToday, salesStatus, recentDocs, milestones] = await Promise.all([
    query('SELECT id, name, sequence, status, progress FROM floors WHERE wing_id = ? ORDER BY sequence', [wingId]),
    query(
      `SELECT dp.id, dp.report_date, dp.percentage, dp.work_description, dp.labour_count, u.name AS created_by_name
         FROM daily_progress dp LEFT JOIN users u ON u.id = dp.created_by
        WHERE dp.wing_id = ? ORDER BY dp.id DESC LIMIT 10`, [wingId]),
    query(`SELECT id, issue_number, title, priority, status FROM issues WHERE wing_id = ? AND status IN ('open','assigned','in_progress','reopened') ORDER BY id DESC LIMIT 10`, [wingId]),
    query(`SELECT status, COUNT(*) AS count FROM inspections WHERE wing_id = ? GROUP BY status`, [wingId]),
    query(
      `SELECT vs.material_name, vs.material_code, vs.unit, vs.current_stock, vs.min_stock_level,
              (vs.current_stock <= vs.min_stock_level AND vs.min_stock_level > 0) AS low_stock
         FROM v_stock_summary vs WHERE vs.project_id = ? ORDER BY low_stock DESC, vs.material_name LIMIT 15`, [wing.project_id]),
    query(`SELECT status, COUNT(*) AS count FROM attendance WHERE wing_id = ? AND attendance_date = CURDATE() GROUP BY status`, [wingId]),
    single(
      `SELECT COUNT(*) AS units_sold, COALESCE(SUM(sale_amount),0) AS value, COALESCE(SUM(amount_received),0) AS received, COALESCE(SUM(pending_amount),0) AS pending
         FROM sales WHERE wing_id = ? AND status != 'cancelled'`, [wingId]),
    query(
      `SELECT d.id, d.title, d.category, fu.file_path FROM project_documents d
         LEFT JOIN file_uploads fu ON fu.id = d.file_id
        WHERE d.wing_id = ? ORDER BY d.id DESC LIMIT 8`, [wingId]),
    query('SELECT id, name, status, percentage, target_date FROM milestones WHERE wing_id = ? ORDER BY target_date LIMIT 10', [wingId]),
  ]);

  res.json({
    success: true,
    data: { wing, floors, recentProgress, activeIssues, inspections, materialStatus, attendanceToday, salesStatus, recentDocs, milestones },
  });
});
