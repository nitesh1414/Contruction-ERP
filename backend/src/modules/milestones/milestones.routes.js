import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './milestones.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('milestones', 'view'), ctrl.list);
router.get('/summary', requirePermission('milestones', 'view'), ctrl.summary);
router.post('/', requirePermission('milestones', 'create'), ctrl.create);
router.put('/:id', requirePermission('milestones', 'edit'), ctrl.update);
router.delete('/:id', requirePermission('milestones', 'delete'), ctrl.remove);

export default router;
