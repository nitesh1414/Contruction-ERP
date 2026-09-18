import crypto from 'node:crypto';

/** Wrap async express handlers so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Authentication required') => new ApiError(401, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, msg);
export const notFound = (msg = 'Resource not found') => new ApiError(404, msg);
export const conflict = (msg = 'Conflict') => new ApiError(409, msg);

/** Parse pagination params: ?page=1&limit=20&sort=id&order=desc */
export function parsePagination(req, { defaultLimit = 20, maxLimit = 200 } = {}) {
  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  const offset = (page - 1) * limit;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : null;
  const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, limit, offset, sort, order };
}

/**
 * Safely build an ORDER BY clause from a whitelist of sortable columns.
 */
export function orderByClause(sort, order, allowed, fallback) {
  if (sort && allowed.includes(sort)) return `ORDER BY ${sort} ${order}`;
  return `ORDER BY ${fallback}`;
}

/** Build a LIKE filter (?search=) across columns. Returns { where, params }. */
export function searchClause(search, columns) {
  if (!search) return { where: '', params: [] };
  const like = `%${search}%`;
  const where = '(' + columns.map((c) => `${c} LIKE ?`).join(' OR ') + ')';
  return { where, params: columns.map(() => like) };
}

export const nowToken = (len = 32) => crypto.randomBytes(len).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const PREFIXES = {
  po: 'PO', grn: 'GRN', issue: 'ISS', inspection: 'INS', test: 'TST',
  requirement: 'MRQ', boq: 'BOQ', project: 'PRJ', document: 'DOC', progress: 'DPR',
};

/** Generate a business number e.g. PO-000123 (uses the row id once inserted). */
export function businessNumber(prefixKey, id) {
  const p = PREFIXES[prefixKey] || prefixKey.toUpperCase();
  return `${p}-${String(id).padStart(6, '0')}`;
}

/** Pick only the whitelisted keys present in obj. */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Convert undefined → null (mysql2 rejects undefined params). */
export function nullify(v) {
  return v === undefined || v === '' ? null : v;
}

export function toNullable(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === undefined || v === '' ? null : v;
  return out;
}

export function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

export const isValidDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const isValidMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
