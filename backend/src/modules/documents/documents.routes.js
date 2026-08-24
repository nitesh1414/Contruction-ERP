import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import { uploadSingle } from '../../middleware/upload.js';
import * as ctrl from './documents.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('documents', 'view'), ctrl.list);
router.post('/', requirePermission('documents', 'upload'), uploadSingle('file'), ctrl.create);
router.put('/:id', requirePermission('documents', 'edit'), uploadSingle('file'), ctrl.update);
router.delete('/:id', requirePermission('documents', 'delete'), ctrl.remove);

export default router;
