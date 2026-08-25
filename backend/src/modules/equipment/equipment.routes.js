import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './equipment.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/summary', requirePermission('projects', 'view'), ctrl.equipmentSummary);

router.get('/',                   requirePermission('projects', 'view'),    ctrl.listEquipment);
router.get('/:id',                requirePermission('projects', 'view'),    ctrl.getEquipment);
router.post('/',                  requirePermission('projects', 'create'),  ctrl.createEquipment);
router.put('/:id',                requirePermission('projects', 'edit'),    ctrl.updateEquipment);
router.delete('/:id',             requirePermission('projects', 'delete'),  ctrl.deleteEquipment);

router.post('/logs',              requirePermission('progress', 'create'),  ctrl.createLog);
router.put('/logs/:id',           requirePermission('progress', 'edit'),    ctrl.updateLog);
router.delete('/logs/:id',        requirePermission('progress', 'delete'),  ctrl.deleteLog);

router.post('/billing/generate',  requirePermission('billing', 'create'),  ctrl.generateBilling);
router.put('/billing/:id',        requirePermission('billing', 'edit'),    ctrl.updateBilling);
router.get('/billing/list',       requirePermission('billing', 'view'),    ctrl.listBilling);

export default router;
