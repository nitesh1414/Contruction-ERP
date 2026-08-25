import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOAD_ROOT } from '../../config/index.js';
import { authenticate } from '../../middleware/auth.js';
import { queryOne } from '../../db/pool.js';
import { asyncHandler, notFound, forbidden } from '../../utils/helpers.js';

const router = Router();

/**
 * Secure-ish file download/preview. Files are served by file_uploads id —
 * never by caller-provided filesystem paths.
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const file = await queryOne('SELECT * FROM file_uploads WHERE id = ?', [req.params.id]);
  if (!file) throw notFound('File not found');
  const abs = path.resolve(UPLOAD_ROOT, file.file_path);
  if (!abs.startsWith(UPLOAD_ROOT)) throw forbidden('Invalid file path');
  if (!fs.existsSync(abs)) throw notFound('File content missing on disk');
  const inline = req.query.download !== '1' && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(file.extension.toLowerCase());
  res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(abs).pipe(res);
}));

export default router;
