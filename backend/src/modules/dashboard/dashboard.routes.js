import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { attachProjectScope } from '../../middleware/permissions.js';
import * as ctrl from './dashboard.controller.js';

const router = Router();
router.use(authenticate, attachProjectScope);

router.get('/overview', ctrl.overview);
router.get('/wing/:wingId', ctrl.wingDashboard);

export default router;
