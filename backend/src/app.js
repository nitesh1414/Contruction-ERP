import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { authenticate } from './middleware/auth.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import rolesRoutes from './modules/roles/roles.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import progressRoutes from './modules/progress/progress.routes.js';
import milestonesRoutes from './modules/milestones/milestones.routes.js';
import drawingsRoutes from './modules/drawings/drawings.routes.js';
import materialsRoutes from './modules/materials/materials.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import boqRoutes from './modules/boq/boq.routes.js';
import qualityRoutes from './modules/quality/quality.routes.js';
import issuesRoutes from './modules/issues/issues.routes.js';
import workforceRoutes from './modules/workforce/workforce.routes.js';
import salesRoutes from './modules/sales/sales.routes.js';
import documentsRoutes from './modules/documents/documents.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import filesRoutes from './modules/files/files.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // file previews from web apps
  }));
  app.use(cors({
    origin: (origin, cb) => {
      // Allow no-origin (curl, mobile apps, Expo) and configured web origins
      if (!origin || config.corsOrigins.includes(origin) || config.env !== 'production') return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));
  app.use(apiLimiter);

  // Health check (no auth)
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', service: 'construction-erp-api', time: new Date().toISOString() });
  });
  app.get('/', (_req, res) => res.json({ name: 'Construction ERP API', docs: '/api/health' }));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/roles', rolesRoutes);
  app.use('/api', projectsRoutes); // /api/projects /api/wings /api/floors /api/units
  app.use('/api/progress', progressRoutes);
  app.use('/api/milestones', milestonesRoutes);
  app.use('/api/drawings', drawingsRoutes);
  app.use('/api/materials', materialsRoutes); // materials + suppliers + categories + inventory lifecycle + stock
  app.use('/api/billing', billingRoutes);
  app.use('/api/boq', boqRoutes);
  app.use('/api', qualityRoutes); // /api/test-reports /api/inspections /api/test-types /api/inspection-types
  app.use('/api/issues', issuesRoutes);
  app.use('/api', workforceRoutes); // /api/workers /api/attendance /api/labour-* etc.
  app.use('/api/sales', salesRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/files', filesRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
