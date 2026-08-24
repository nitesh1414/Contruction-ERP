import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import { uploadSingle } from '../../middleware/upload.js';
import * as ctrl from './drawings.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('drawings', 'view'), ctrl.list);
router.get('/:id', requirePermission('drawings', 'view'), ctrl.getOne);
router.post('/', requirePermission('drawings', 'upload'), uploadSingle('file'), ctrl.create);
router.post('/:id/revisions', requirePermission('drawings', 'upload'), uploadSingle('file'), ctrl.addRevision);
router.put('/revisions/:revisionId/status', requirePermission('drawings', 'approve'), ctrl.setRevisionStatus);
router.put('/:id', requirePermission('drawings', 'edit'), ctrl.update);
router.delete('/:id', requirePermission('drawings', 'delete'), ctrl.remove);

export default router;
