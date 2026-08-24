import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './workforce.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

// Master data
router.get('/worker-categories', requirePermission('workers', 'view'), ctrl.workerCategories.list);
router.post('/worker-categories', requirePermission('workers', 'create'), ctrl.workerCategories.create);
router.put('/worker-categories/:id', requirePermission('workers', 'edit'), ctrl.workerCategories.update);
router.delete('/worker-categories/:id', requirePermission('workers', 'delete'), ctrl.workerCategories.remove);

router.get('/contractors', requirePermission('workers', 'view'), ctrl.contractors.list);
router.post('/contractors', requirePermission('workers', 'create'), ctrl.contractors.create);
router.put('/contractors/:id', requirePermission('workers', 'edit'), ctrl.contractors.update);
router.delete('/contractors/:id', requirePermission('workers', 'delete'), ctrl.contractors.remove);

router.get('/labour-rates', requirePermission('workers', 'view'), ctrl.labourRates.list);
router.post('/labour-rates', requirePermission('workers', 'create'), ctrl.labourRates.create);
router.put('/labour-rates/:id', requirePermission('workers', 'edit'), ctrl.labourRates.update);
router.delete('/labour-rates/:id', requirePermission('workers', 'delete'), ctrl.labourRates.remove);

// Workers
router.get('/workers', requirePermission('workers', 'view'), ctrl.listWorkers);
router.post('/workers', requirePermission('workers', 'create'), ctrl.createWorker);
router.put('/workers/:id', requirePermission('workers', 'edit'), ctrl.updateWorker);
router.delete('/workers/:id', requirePermission('workers', 'delete'), ctrl.deleteWorker);

// Attendance
router.get('/attendance', requirePermission('attendance', 'view'), ctrl.listAttendance);
router.get('/attendance/export', requirePermission('attendance', 'export'), ctrl.exportAttendance);
router.get('/attendance/summary', requirePermission('attendance', 'view'), ctrl.attendanceSummary);
router.get('/attendance/monthly-report', requirePermission('attendance', 'view'), ctrl.monthlyReport);
router.post('/attendance', requirePermission('attendance', 'create'), ctrl.markAttendance);
router.put('/attendance/:id', requirePermission('attendance', 'edit'), ctrl.updateAttendance);

// Labour payments
router.get('/labour-payments', requirePermission('attendance', 'view'), ctrl.listLabourPayments);
router.post('/labour-payments', requirePermission('attendance', 'create'), ctrl.createLabourPayment);
router.put('/labour-payments/:id', requirePermission('attendance', 'edit'), ctrl.updateLabourPayment);

export default router;
