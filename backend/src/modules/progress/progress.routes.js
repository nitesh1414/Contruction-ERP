import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import { uploadMultiple } from '../../middleware/upload.js';
import * as ctrl from './progress.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/', requirePermission('progress', 'view'), ctrl.list);
router.get('/export', requirePermission('progress', 'export'), ctrl.exportCsv);
router.get('/timeline', requirePermission('progress', 'view'), ctrl.timeline);
router.post('/sync', requirePermission('progress', 'create'), ctrl.syncBatch);
router.get('/:id', requirePermission('progress', 'view'), ctrl.getOne);
router.post('/', requirePermission('progress', 'create'), uploadMultiple('photos', 10), ctrl.create);
router.put('/:id', requirePermission('progress', 'edit'), uploadMultiple('photos', 10), ctrl.update);
router.delete('/:id', requirePermission('progress', 'delete'), ctrl.remove);

export default router;
