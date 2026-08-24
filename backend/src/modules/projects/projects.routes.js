import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './projects.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

// Projects
router.get('/projects', requirePermission('projects', 'view'), ctrl.listProjects);
router.get('/projects/export', requirePermission('projects', 'export'), ctrl.exportProjects);
router.get('/projects/:id', requirePermission('projects', 'view'), ctrl.getProject);
router.post('/projects', requirePermission('projects', 'create'), ctrl.createProject);
router.put('/projects/:id', requirePermission('projects', 'edit'), ctrl.updateProject);
router.delete('/projects/:id', requirePermission('projects', 'delete'), ctrl.deleteProject);

// Wings
router.get('/wings', requirePermission('wings', 'view'), ctrl.listWings);
router.post('/wings', requirePermission('wings', 'create'), ctrl.createWing);
router.put('/wings/:id', requirePermission('wings', 'edit'), ctrl.updateWing);
router.delete('/wings/:id', requirePermission('wings', 'delete'), ctrl.deleteWing);

// Floors
router.get('/floors', requirePermission('floors', 'view'), ctrl.listFloors);
router.post('/floors', requirePermission('floors', 'create'), ctrl.createFloor);
router.put('/floors/:id', requirePermission('floors', 'edit'), ctrl.updateFloor);
router.delete('/floors/:id', requirePermission('floors', 'delete'), ctrl.deleteFloor);

// Units
router.get('/units', requirePermission('units', 'view'), ctrl.listUnits);
router.post('/units', requirePermission('units', 'create'), ctrl.createUnit);
router.put('/units/:id', requirePermission('units', 'edit'), ctrl.updateUnit);
router.delete('/units/:id', requirePermission('units', 'delete'), ctrl.deleteUnit);

export default router;
