import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import * as ctrl from './roles.controller.js';

const router = Router();
router.use(authenticate);

router.get('/permissions', requirePermission('roles', 'view'), ctrl.listPermissions);
router.get('/', requirePermission('roles', 'view'), ctrl.listRoles);
router.get('/:id', requirePermission('roles', 'view'), ctrl.getRole);
router.post('/', requirePermission('roles', 'create'), ctrl.createRole);
router.put('/:id', requirePermission('roles', 'edit'), ctrl.updateRole);
router.put('/:id/permissions', requirePermission('roles', 'edit'), ctrl.setRolePermissions);
router.delete('/:id', requirePermission('roles', 'delete'), ctrl.deleteRole);

export default router;
