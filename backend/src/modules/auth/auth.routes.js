import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimiter.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/login', authLimiter, ctrl.loginValidation, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, ctrl.resetPassword);

router.use(authenticate);
router.get('/me', ctrl.me);
router.put('/profile', ctrl.updateProfile);
router.post('/change-password', ctrl.changePassword);
router.post('/logout', ctrl.logout);
router.get('/user-directory', ctrl.userDirectory);

export default router;
