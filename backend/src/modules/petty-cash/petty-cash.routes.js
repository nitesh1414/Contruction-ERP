import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './petty-cash.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/summary',   requirePermission('petty_cash', 'view'),   ctrl.projectSummary);
router.get('/export',    requirePermission('petty_cash', 'export'), ctrl.exportEntries);
router.get('/',          requirePermission('petty_cash', 'view'),   ctrl.listEntries);
router.post('/topup',    requirePermission('petty_cash', 'create'), ctrl.topup);
router.post('/',         requirePermission('petty_cash', 'create'), ctrl.createEntry);
router.put('/:id',       requirePermission('petty_cash', 'edit'),   ctrl.updateEntry);
router.delete('/:id',    requirePermission('petty_cash', 'delete'), ctrl.deleteEntry);

export default router;
