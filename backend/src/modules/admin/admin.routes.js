import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import * as ctrl from './admin.controller.js';

const router = Router();
router.use(authenticate);

router.get('/audit-logs', requirePermission('admin', 'view'), ctrl.auditLogs);
router.get('/audit-logs/export', requirePermission('admin', 'export'), ctrl.auditLogsExport);

export default router;
