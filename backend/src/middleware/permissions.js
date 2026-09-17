import { query } from '../db/pool.js';
import { forbidden } from '../utils/helpers.js';

/**
 * RBAC permission middleware.
 *   requirePermission('projects', 'view')
 * Super admins bypass all checks.
 */
export function requirePermission(module, action) {
  const code = `${module}.${action}`;
  return (req, _res, next) => {
    if (!req.user) return next(forbidden());
    if (req.user.isSuperAdmin) return next();
    if (req.user.permissions.has(code)) return next();
    return next(forbidden(`Missing permission: ${code}`));
  };
}

/** Require any of the given permission codes. */
export function requireAnyPermission(...codes) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden());
    if (req.user.isSuperAdmin) return next();
    if (codes.some((c) => req.user.permissions.has(c))) return next();
    return next(forbidden(`Missing permission, need one of: ${codes.join(', ')}`));
  };
}

/**
 * Project-level access control.
 * Loads the set of project ids a user is assigned to (null = all projects).
 * Attaches req.projectScope = null | Set<number>
 *   req.wingScope = Map<projectId, Set<wingId>> (empty set = all wings)
 */
export async function loadProjectScope(userId, isGlobalAdmin) {
  if (isGlobalAdmin) return { projectScope: null, wingScope: new Map() };
  const rows = await query('SELECT project_id, wing_id FROM user_projects WHERE user_id = ?', [userId]);
  if (rows.length === 0) return { projectScope: new Set(), wingScope: new Map() };
  const projectScope = new Set(rows.map((r) => r.project_id));
  const wingScope = new Map();
  for (const r of rows) {
    if (!wingScope.has(r.project_id)) wingScope.set(r.project_id, new Set());
    if (r.wing_id !== 0) wingScope.get(r.project_id).add(r.wing_id);
  }
  return { projectScope, wingScope };
}

/** Helper: check if user may access (projectId, wingId). */
export function assertProjectAccess(req, projectId, wingId = null) {
  if (req.user.isSuperAdmin) return;
  if (!projectId) return; // nothing to check
  if (!req.projectScope || req.projectScope === null) return;
  if (!req.projectScope.has(Number(projectId))) {
    throw forbidden(`No access to project ${projectId}`);
  }
  if (wingId) {
    const wings = req.wingScope.get(Number(projectId));
    if (wings && wings.size > 0 && !wings.has(Number(wingId))) {
      throw forbidden(`No access to wing ${wingId}`);
    }
  }
}

/** Middleware that attaches project scope to the request (after authenticate). */
export const attachProjectScope = async (req, _res, next) => {
  try {
    const isGlobalAdmin = req.user.isSuperAdmin || req.user.roles?.some((role) => role.code === 'admin');
    const { projectScope, wingScope } = await loadProjectScope(req.user.id, isGlobalAdmin);
    req.projectScope = projectScope;
    req.wingScope = wingScope;
    next();
  } catch (err) {
    next(err);
  }
};

/** SQL fragment limiting a WHERE clause to the user's assigned projects. */
export function projectScopeSql(req, column = 'project_id') {
  if (req.user.isSuperAdmin || req.projectScope === null) return { clause: '', params: [] };
  if (req.projectScope.size === 0) return { clause: ' AND 1=0 ', params: [] };
  const ids = [...req.projectScope];
  return { clause: ` AND ${column} IN (${ids.map(() => '?').join(',')}) `, params: ids };
}
