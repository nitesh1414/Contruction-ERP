import { Router } from 'express';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './boq.controller.js';

const router = Router();
router.use(attachProjectScope);

router.get('/', requirePermission('boq', 'view'), ctrl.list);
router.get('/export', requirePermission('boq', 'export'), ctrl.exportAll);
router.get('/template-csv', requirePermission('boq', 'view'), ctrl.templateCsv);
router.get('/categories', requirePermission('boq', 'view'), ctrl.categories.list);
router.post('/categories', requirePermission('boq', 'create'), ctrl.categories.create);
router.put('/categories/:id', requirePermission('boq', 'edit'), ctrl.categories.update);
router.delete('/categories/:id', requirePermission('boq', 'delete'), ctrl.categories.remove);
router.get('/:id', requirePermission('boq', 'view'), ctrl.getOne);
router.post('/', requirePermission('boq', 'create'), ctrl.create);
router.put('/:id', requirePermission('boq', 'edit'), ctrl.update);
router.put('/items/:itemId', requirePermission('boq', 'edit'), ctrl.updateItem);
router.post('/:id/import-json', requirePermission('boq', 'create'), ctrl.importItemsJson);
router.get('/:id/export', requirePermission('boq', 'export'), ctrl.exportBoq);
router.delete('/:id', requirePermission('boq', 'delete'), ctrl.remove);

export default router;
