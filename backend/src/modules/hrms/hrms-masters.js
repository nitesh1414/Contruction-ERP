import { queryOne } from '../../db/pool.js';
import { badRequest, conflict } from '../../utils/helpers.js';

const slug = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

/**
 * Employee identity values are intentionally stored as the master names in the
 * legacy employee columns. These validators keep those values inside the
 * managed HRMS master data while remaining compatible with existing records.
 */
export async function validateEmployeeMasterValues(data, { partial = false } = {}) {
  for (const [field, table, label] of [
    ['department', 'hrms_departments', 'department'],
    ['designation', 'hrms_designations', 'designation'],
  ]) {
    if (data[field] === undefined) {
      if (!partial) throw badRequest(`${label} is required and must be selected from HRMS master data`);
      continue;
    }
    if (data[field] === null || String(data[field]).trim() === '') {
      throw badRequest(`${label} is required and must be selected from HRMS master data`);
    }
    const row = table === 'hrms_departments'
      ? await queryOne('SELECT id FROM hrms_departments WHERE name = ? AND is_active = 1', [String(data[field]).trim()])
      : await queryOne(
        `SELECT d.id FROM hrms_designations d
           JOIN roles r ON r.id = d.role_id AND r.is_active = 1
          WHERE d.name = ? AND d.is_active = 1`,
        [String(data[field]).trim()]
      );
    if (!row) {
      const message = ['Select', 'a valid active', label, 'from', 'HRMS master data'].join(' ');
      throw badRequest(message);
    }
    data[field] = String(data[field]).trim();
  }
  return data;
}

export async function getDesignationRoleId(designation) {
  if (!designation) return null;
  const row = await queryOne(
    `SELECT d.role_id FROM hrms_designations d
       JOIN roles r ON r.id = d.role_id AND r.is_active = 1
      WHERE d.name = ? AND d.is_active = 1`,
    [designation]
  );
  return row?.role_id ? Number(row.role_id) : null;
}

export async function validateDepartmentMaster(data) {
  if (!data.name || !String(data.name).trim()) throw badRequest('Department name is required');
  data.name = String(data.name).trim();
  data.code = String(data.code || slug(data.name)).trim().toUpperCase();
  if (!data.code) throw badRequest('Department code is required');
  return data;
}

export async function validateDesignationMaster(data) {
  if (!data.name || !String(data.name).trim()) throw badRequest('Designation name is required');
  data.name = String(data.name).trim();
  data.code = String(data.code || slug(data.name)).trim().toUpperCase();
  if (!data.code) throw badRequest('Designation code is required');
  if (data.role_id === undefined || data.role_id === null || data.role_id === '') {
    throw badRequest('A designation must be linked to an active role');
  }
  if (data.role_id !== undefined && data.role_id !== null && data.role_id !== '') {
    const roleId = Number(data.role_id);
    if (!Number.isInteger(roleId) || roleId < 1) throw badRequest('role_id must be a valid role');
    const role = await queryOne('SELECT id FROM roles WHERE id = ? AND is_active = 1', [roleId]);
    if (!role) throw badRequest('Select a valid active role for this designation');
    data.role_id = roleId;
  }
  return data;
}

export async function preventUsedMasterDelete(table, name, label, action = 'delete') {
  const row = await queryOne(`SELECT COUNT(*) AS total FROM hrms_employees WHERE ${table === 'hrms_departments' ? 'department' : 'designation'} = ?`, [name]);
  if (Number(row?.total || 0) > 0) throw conflict(`Cannot ${action} ${label} while employees still use it`);
}

export async function preventUsedMasterDisable(table, existing, data, label) {
  if (existing.is_active && data.is_active !== undefined && !Number(data.is_active)) {
    await preventUsedMasterDelete(table, existing.name, label, 'deactivate');
  }
}

export async function preventUsedMasterRename(table, existing, data, label) {
  if (data.name !== undefined && String(data.name).trim() !== existing.name) {
    await preventUsedMasterDelete(table, existing.name, label, 'rename');
  }
}
