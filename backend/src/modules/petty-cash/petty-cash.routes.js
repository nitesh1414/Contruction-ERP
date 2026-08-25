import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './petty-cash.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/summary',   requirePermission('billing', 'view'),   ctrl.projectSummary);
router.get('/',          requirePermission('billing', 'view'),   ctrl.listEntries);
router.post('/topup',    requirePermission('billing', 'create'), ctrl.topup);
router.post('/',         requirePermission('billing', 'create'), ctrl.createEntry);
router.put('/:id',       requirePermission('billing', 'edit'),   ctrl.updateEntry);
router.delete('/:id',    requirePermission('billing', 'delete'), ctrl.deleteEntry);

export default router;
