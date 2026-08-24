import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './reports.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('reports', 'view'), ctrl.listReports);
router.get('/:key', requirePermission('reports', 'view'), ctrl.runReport);

export default router;
