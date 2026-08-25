import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import { uploadSingle, uploadMultiple } from '../../middleware/upload.js';
import * as ctrl from './quality.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

// Test types (master)
router.get('/test-types', requirePermission('test_reports', 'view'), ctrl.testTypes.list);
router.post('/test-types', requirePermission('test_reports', 'create'), ctrl.testTypes.create);
router.put('/test-types/:id', requirePermission('test_reports', 'edit'), ctrl.testTypes.update);
router.delete('/test-types/:id', requirePermission('test_reports', 'delete'), ctrl.testTypes.remove);

// Inspection types (master)
router.get('/inspection-types', requirePermission('inspections', 'view'), ctrl.inspectionTypes.list);
router.post('/inspection-types', requirePermission('inspections', 'create'), ctrl.inspectionTypes.create);
router.put('/inspection-types/:id', requirePermission('inspections', 'edit'), ctrl.inspectionTypes.update);
router.delete('/inspection-types/:id', requirePermission('inspections', 'delete'), ctrl.inspectionTypes.remove);

// Test reports
router.get('/test-reports', requirePermission('test_reports', 'view'), ctrl.listTestReports);
router.post('/test-reports', requirePermission('test_reports', 'create'), uploadSingle('file'), ctrl.createTestReport);
router.put('/test-reports/:id', requirePermission('test_reports', 'edit'), uploadSingle('file'), ctrl.updateTestReport);
router.put('/test-reports/:id/status', requirePermission('test_reports', 'approve'), ctrl.approveTestReport);
router.delete('/test-reports/:id', requirePermission('test_reports', 'delete'), ctrl.deleteTestReport);

// Inspections
router.get('/inspections', requirePermission('inspections', 'view'), ctrl.listInspections);
router.get('/inspections/:id', requirePermission('inspections', 'view'), ctrl.getInspection);
router.post('/inspections', requirePermission('inspections', 'create'), uploadMultiple('photos', 10), ctrl.createInspection);
router.put('/inspections/:id', requirePermission('inspections', 'edit'), ctrl.updateInspection);
router.delete('/inspections/:id', requirePermission('inspections', 'delete'), ctrl.deleteInspection);

export default router;
