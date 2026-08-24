import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'construction_erp',
    connectionLimit: num(process.env.DB_CONNECTION_LIMIT, 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  resetTokenExpiresMinutes: num(process.env.RESET_TOKEN_EXPIRES_MINUTES, 30),
  frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: num(process.env.MAX_FILE_SIZE_MB, 20),
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@constructionerp.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
};

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const UPLOAD_ROOT = path.resolve(ROOT_DIR, config.upload.dir);
