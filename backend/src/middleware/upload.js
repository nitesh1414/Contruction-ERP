import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, UPLOAD_ROOT } from '../config/index.js';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xls', '.xlsx', '.doc', '.docx', '.csv', '.txt',
]);

const ALLOWED_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain'];
const ALLOWED_MIME_EXACT = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const moduleName = (req.body?.module || req.params?.module || 'general')
      .toString()
      .replace(/[^a-z0-9_-]/gi, '')
      .toLowerCase()
      .slice(0, 40);
    const dir = path.join(UPLOAD_ROOT, moduleName);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `File type not allowed: ${ext}`));
  }
  const mime = (file.mimetype || '').toLowerCase();
  const ok = ALLOWED_MIME_EXACT.has(mime) || ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (!ok && mime !== 'application/octet-stream') {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `MIME type not allowed: ${mime}`));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024, files: 10 },
});

export const uploadSingle = (field = 'file') => upload.single(field);
export const uploadMultiple = (field = 'files', maxCount = 10) => upload.array(field, maxCount);

/** Register an uploaded file in file_uploads; returns the id. */
export async function registerFile({ file, module, relatedId = null, source = 'upload', userId }) {
  const { query } = await import('../db/pool.js');
  const relPath = path.relative(UPLOAD_ROOT, file.path).split(path.sep).join('/');
  const ext = path.extname(file.originalname).toLowerCase();
  const result = await query(
    `INSERT INTO file_uploads (file_name, original_name, file_path, file_type, extension, size_bytes, related_module, related_id, source, uploaded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [path.basename(file.path), file.originalname, relPath, file.mimetype || 'application/octet-stream', ext.replace('.', ''), file.size, module, relatedId, source, userId]
  );
  return result.insertId;
}
