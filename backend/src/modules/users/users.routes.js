import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './users.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('users', 'view'), ctrl.list);
router.get('/export', requirePermission('users', 'export'), ctrl.exportCsv);
router.get('/:id', requirePermission('users', 'view'), ctrl.getOne);
router.post('/', requirePermission('users', 'create'), ctrl.create);
router.put('/:id', requirePermission('users', 'edit'), ctrl.update);
router.put('/:id/roles', requirePermission('users', 'edit'), ctrl.setRoles);
router.put('/:id/project-access', requirePermission('users', 'edit'), ctrl.setProjectAccess);
router.put('/:id/reset-password', requirePermission('users', 'edit'), ctrl.adminResetPassword);
router.delete('/:id', requirePermission('users', 'delete'), ctrl.remove);

export default router;
