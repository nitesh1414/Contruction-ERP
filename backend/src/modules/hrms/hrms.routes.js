import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './hrms.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/summary',         requirePermission('hrms', 'view'),    ctrl.hrmsSummary);

// employees
router.get('/employees',       requirePermission('hrms', 'view'),    ctrl.listEmployees);
router.get('/employees/:id',   requirePermission('hrms', 'view'),    ctrl.getEmployee);
router.post('/employees',      requirePermission('hrms', 'create'),  ctrl.createEmployee);
router.put('/employees/:id',   requirePermission('hrms', 'edit'),    ctrl.updateEmployee);
router.delete('/employees/:id',requirePermission('hrms', 'delete'),  ctrl.deleteEmployee);

// leave types
router.get('/leave-types',     requirePermission('hrms', 'view'),    ctrl.leaveTypes.list);
router.post('/leave-types',    requirePermission('hrms', 'create'),  ctrl.leaveTypes.create);
router.put('/leave-types/:id', requirePermission('hrms', 'edit'),    ctrl.leaveTypes.update);
router.delete('/leave-types/:id', requirePermission('hrms', 'delete'), ctrl.leaveTypes.remove);

// leave requests
router.get('/leave-requests',  requirePermission('hrms', 'view'),    ctrl.listLeaveRequests);
router.post('/leave-requests', requirePermission('hrms', 'create'),  ctrl.createLeaveRequest);
router.put('/leave-requests/:id/decide', requirePermission('hrms', 'approve'), ctrl.decideLeave);

// salary structures
router.get('/salary-structures',        requirePermission('hrms', 'view'),   ctrl.listSalaryStructures);
router.post('/salary-structures',       requirePermission('hrms', 'create'), ctrl.upsertSalaryStructure);
router.put('/salary-structures/:id',    requirePermission('hrms', 'edit'),   ctrl.upsertSalaryStructure);
router.delete('/salary-structures/:id', requirePermission('hrms', 'delete'), ctrl.deleteSalaryStructure);

// payroll
router.get('/payroll',          requirePermission('hrms', 'view'),    ctrl.listPayroll);
router.get('/payroll/:id',      requirePermission('hrms', 'view'),    ctrl.getPayroll);
router.post('/payroll/generate',requirePermission('hrms', 'create'),  ctrl.generateSingle);
router.post('/payroll/generate-bulk', requirePermission('hrms', 'create'), ctrl.generateBulk);
router.put('/payroll/:id/payment',    requirePermission('hrms', 'edit'), ctrl.updatePayrollPayment);

export default router;
