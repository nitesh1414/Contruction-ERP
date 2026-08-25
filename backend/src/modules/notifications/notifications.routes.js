import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import * as ctrl from './notifications.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listMine);
router.put('/:id/read', ctrl.markRead);
router.post('/mark-all-read', ctrl.markAllRead);
router.post('/push-token', ctrl.registerPushToken);
router.post('/broadcast', requirePermission('notifications', 'create'), ctrl.broadcast);
router.get('/settings', requirePermission('notifications', 'view'), ctrl.settings.list);
router.put('/settings/:id', requirePermission('notifications', 'edit'), ctrl.settings.update);

export default router;
