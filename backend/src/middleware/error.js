import { ApiError } from '../utils/helpers.js';
import { config } from '../config/index.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (err?.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File too large';
  } else if (err?.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'Duplicate value: a record with this unique value already exists';
  } else if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'Invalid reference: related record does not exist';
  } else if (err?.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409;
    message = 'Cannot delete: record is referenced by other data';
  } else if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_PARSE_ERROR') {
    status = 500;
    message = 'Database error';
  }

  if (status === 500 && config.env !== 'test') {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  const payload = { success: false, message };
  if (details) payload.details = details;
  if (config.env === 'development' && err?.stack && status === 500) payload.stack = err.stack;
  res.status(status).json(payload);
}
