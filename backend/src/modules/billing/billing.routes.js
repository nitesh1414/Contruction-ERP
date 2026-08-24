import { Router } from 'express';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './billing.controller.js';

const router = Router();
router.use(attachProjectScope);

router.get('/cost-entries', requirePermission('billing', 'view'), ctrl.listCostEntries);
router.get('/cost-entries/export', requirePermission('billing', 'export'), ctrl.exportCostEntries);
router.post('/cost-entries', requirePermission('billing', 'create'), ctrl.createCostEntry);
router.put('/cost-entries/:id', requirePermission('billing', 'edit'), ctrl.updateCostEntry);
router.delete('/cost-entries/:id', requirePermission('billing', 'delete'), ctrl.deleteCostEntry);
router.get('/summary', requirePermission('billing', 'view'), ctrl.costSummary);
router.get('/summary/by-wing', requirePermission('billing', 'view'), ctrl.costSummaryByWing);

export default router;
