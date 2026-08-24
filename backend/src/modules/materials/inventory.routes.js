import { Router } from 'express';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './inventory.controller.js';

const router = Router();
router.use(attachProjectScope);

// Requirements
router.get('/requirements', requirePermission('materials', 'view'), ctrl.listRequirements);
router.post('/requirements', requirePermission('materials', 'create'), ctrl.createRequirement);
router.put('/requirements/:id/status', requirePermission('materials', 'approve'), ctrl.setRequirementStatus);

// Purchase orders
router.get('/purchase-orders', requirePermission('materials', 'view'), ctrl.listPurchaseOrders);
router.get('/purchase-orders/:id', requirePermission('materials', 'view'), ctrl.getPurchaseOrder);
router.post('/purchase-orders', requirePermission('materials', 'create'), ctrl.createPurchaseOrder);
const statusPerm = (req, res, next) => {
  const target = req.body?.status;
  const action = target === 'approved' ? 'approve' : 'edit';
  return requirePermission('materials', action)(req, res, next);
};
router.put('/purchase-orders/:id/status', statusPerm, ctrl.setPurchaseOrderStatus);

// Receipts (GRN)
router.get('/receipts', requirePermission('materials', 'view'), ctrl.listReceipts);
router.get('/receipts/:id', requirePermission('materials', 'view'), ctrl.getReceipt);
router.post('/receipts', requirePermission('materials', 'create'), ctrl.createReceipt);

// Consumption
router.get('/consumption', requirePermission('materials', 'view'), ctrl.listConsumption);
router.post('/consumption', requirePermission('materials', 'create'), ctrl.createConsumption);

// Returns / damaged
router.get('/returns', requirePermission('materials', 'view'), ctrl.listReturns);
router.post('/returns', requirePermission('materials', 'create'), ctrl.createReturn);
router.put('/returns/:id/approve', requirePermission('materials', 'approve'), ctrl.approveReturn);

// Stock
router.get('/stock', requirePermission('materials', 'view'), ctrl.stockSummary);
router.get('/stock/transactions', requirePermission('materials', 'view'), ctrl.stockTransactions);
router.get('/stock/low-stock-alerts', requirePermission('materials', 'view'), ctrl.lowStockAlerts);

export default router;
