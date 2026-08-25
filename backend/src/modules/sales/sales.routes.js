import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './sales.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('sales', 'view'), ctrl.list);
router.get('/export', requirePermission('sales', 'export'), ctrl.exportSales);
router.get('/summary', requirePermission('sales', 'view'), ctrl.summary);
router.get('/unit-availability', requirePermission('sales', 'view'), ctrl.unitAvailability);
router.get('/:id', requirePermission('sales', 'view'), ctrl.getOne);
router.post('/', requirePermission('sales', 'create'), ctrl.create);
router.post('/:id/payments', requirePermission('sales', 'create'), ctrl.addPayment);
router.put('/:id', requirePermission('sales', 'edit'), ctrl.update);

export default router;
