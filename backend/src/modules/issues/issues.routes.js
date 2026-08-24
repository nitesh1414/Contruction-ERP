import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import { uploadMultiple } from '../../middleware/upload.js';
import * as ctrl from './issues.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/categories', requirePermission('issues', 'view'), ctrl.categories.list);
router.post('/categories', requirePermission('issues', 'create'), ctrl.categories.create);
router.put('/categories/:id', requirePermission('issues', 'edit'), ctrl.categories.update);
router.delete('/categories/:id', requirePermission('issues', 'delete'), ctrl.categories.remove);

router.get('/', requirePermission('issues', 'view'), ctrl.list);
router.get('/:id', requirePermission('issues', 'view'), ctrl.getOne);
router.post('/', requirePermission('issues', 'create'), uploadMultiple('photos', 10), ctrl.create);
router.post('/:id/comments', requirePermission('issues', 'view'), ctrl.addComment);
router.put('/:id', requirePermission('issues', 'edit'), uploadMultiple('photos', 10), ctrl.update);
router.delete('/:id', requirePermission('issues', 'delete'), ctrl.remove);

export default router;
