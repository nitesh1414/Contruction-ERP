/**
 * Seed script — roles, permissions, users, and demo construction data.
 *   node scripts/seed.js          # seed if not already seeded (idempotent)
 *   node scripts/seed.js --force  # wipe and re-seed (DESTRUCTIVE)
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'construction_erp',
};

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@constructionerp.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const DEMO_PASSWORD = 'Password@123';
const force = process.argv.includes('--force');

// All permission actions per module
const MODULE_ACTIONS = {
  users: ['view', 'create', 'edit', 'delete', 'export'],
  roles: ['view', 'create', 'edit', 'delete'],
  projects: ['view', 'create', 'edit', 'delete', 'export', 'upload'],
  wings: ['view', 'create', 'edit', 'delete'],
  floors: ['view', 'create', 'edit', 'delete'],
  units: ['view', 'create', 'edit', 'delete'],
  progress: ['view', 'create', 'edit', 'delete', 'export', 'upload', 'download'],
  milestones: ['view', 'create', 'edit', 'delete'],
  drawings: ['view', 'create', 'edit', 'delete', 'approve', 'upload', 'download'],
  materials: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
  billing: ['view', 'create', 'edit', 'delete', 'export'],
  boq: ['view', 'create', 'edit', 'delete', 'export'],
  test_reports: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
  inspections: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
  issues: ['view', 'create', 'edit', 'delete', 'export', 'upload'],
  workers: ['view', 'create', 'edit', 'delete', 'export'],
  attendance: ['view', 'create', 'edit', 'delete', 'export'],
  sales: ['view', 'create', 'edit', 'delete', 'export'],
  documents: ['view', 'create', 'edit', 'delete', 'export', 'upload', 'download'],
  notifications: ['view', 'create', 'edit'],
  reports: ['view', 'export'],
  admin: ['view', 'export'],
  hrms: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  petty_cash: ['view', 'create', 'edit', 'delete', 'export'],
};

/** Permission sets per role code — 'all' expands to everything. */
const ROLE_PERMS = {
  super_admin: 'all',
  admin: 'all',
  project_manager: {
    users: ['view'], roles: ['view'],
    projects: ['view', 'create', 'edit', 'export', 'upload'],
    wings: ['view', 'create', 'edit', 'delete'], floors: ['view', 'create', 'edit', 'delete'], units: ['view', 'create', 'edit', 'delete'],
    progress: ['view', 'create', 'edit', 'delete', 'export', 'download'],
    milestones: ['view', 'create', 'edit', 'delete'],
    drawings: ['view', 'edit', 'approve', 'upload', 'download'],
    materials: ['view', 'create', 'approve', 'export'],
    billing: ['view', 'create', 'edit', 'export'],
    boq: ['view', 'create', 'edit', 'delete', 'export'],
    test_reports: ['view', 'approve', 'export'],
    inspections: ['view', 'create', 'approve', 'export'],
    issues: ['view', 'create', 'edit', 'delete', 'export'],
    workers: ['view'], attendance: ['view', 'export'],
    sales: ['view', 'export'],
    documents: ['view', 'upload', 'download', 'export'],
    notifications: ['view', 'create'], reports: ['view', 'export'],
  },
  site_engineer: {
    projects: ['view'], wings: ['view'], floors: ['view'], units: ['view'],
    progress: ['view', 'create', 'edit', 'upload', 'download'],
    milestones: ['view', 'edit'],
    drawings: ['view', 'upload', 'download'],
    materials: ['view', 'create'],
    boq: ['view'],
    test_reports: ['view', 'create', 'upload'],
    inspections: ['view', 'create', 'edit', 'upload'],
    issues: ['view', 'create', 'edit', 'upload'],
    workers: ['view'], attendance: ['view', 'create', 'edit'],
    documents: ['view', 'upload', 'download'],
    notifications: ['view'], reports: ['view'],
  },
  civil_engineer: {
    projects: ['view'], wings: ['view'], floors: ['view', 'edit'], units: ['view'],
    progress: ['view', 'create', 'edit', 'upload', 'download'],
    milestones: ['view', 'edit'], drawings: ['view', 'upload', 'download'],
    materials: ['view', 'create'], boq: ['view', 'edit'],
    inspections: ['view', 'create', 'edit', 'upload'],
    issues: ['view', 'create', 'edit', 'upload'],
    attendance: ['view', 'create'],
    documents: ['view', 'download'], notifications: ['view'], reports: ['view'],
  },
  electrical_engineer: {
    projects: ['view'], wings: ['view'], floors: ['view'], units: ['view'],
    progress: ['view', 'create', 'edit', 'upload'],
    drawings: ['view', 'upload', 'download'],
    materials: ['view', 'create'], boq: ['view'],
    inspections: ['view', 'create', 'edit', 'upload'],
    issues: ['view', 'create', 'edit', 'upload'],
    attendance: ['view', 'create'],
    documents: ['view', 'download'], notifications: ['view'],
  },
  plumbing_engineer: {
    projects: ['view'], wings: ['view'], floors: ['view'], units: ['view'],
    progress: ['view', 'create', 'edit', 'upload'],
    drawings: ['view', 'upload', 'download'],
    materials: ['view', 'create'], boq: ['view'],
    inspections: ['view', 'create', 'edit', 'upload'],
    issues: ['view', 'create', 'edit', 'upload'],
    attendance: ['view', 'create'],
    documents: ['view', 'download'], notifications: ['view'],
  },
  sales_executive: {
    projects: ['view'], wings: ['view'], floors: ['view'], units: ['view'],
    sales: ['view', 'create', 'edit', 'export'],
    documents: ['view', 'download'],
    notifications: ['view'], reports: ['view'],
  },
  store_manager: {
    projects: ['view'], wings: ['view'],
    materials: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
    workers: ['view'],
    documents: ['view', 'upload', 'download'],
    notifications: ['view'], reports: ['view', 'export'],
  },
  accountant: {
    users: ['view', 'create'], roles: ['view'],
    projects: ['view'], wings: ['view'],
    billing: ['view', 'create', 'edit', 'delete', 'export'],
    sales: ['view', 'export'],
    attendance: ['view', 'export'], workers: ['view'],
    hrms: ['view', 'create', 'edit', 'approve', 'export'],
    petty_cash: ['view', 'create', 'edit', 'delete', 'export'],
    boq: ['view', 'export'], materials: ['view'],
    documents: ['view', 'download'],
    notifications: ['view'], reports: ['view', 'export'],
  },
  safety_officer: {
    projects: ['view'], wings: ['view'], floors: ['view'],
    inspections: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
    issues: ['view', 'create', 'edit', 'upload'],
    workers: ['view'], attendance: ['view'],
    progress: ['view'],
    documents: ['view', 'download'], notifications: ['view'],
  },
  quality_engineer: {
    projects: ['view'], wings: ['view'], floors: ['view'],
    test_reports: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
    inspections: ['view', 'create', 'edit', 'approve', 'export', 'upload'],
    drawings: ['view', 'download'], boq: ['view'], materials: ['view'],
    issues: ['view', 'create'],
    documents: ['view', 'download'], notifications: ['view'], reports: ['view'],
  },
};

const NOTIFICATION_EVENTS = [
  ['issue_created', 'New issue'],
  ['issue_assigned', 'Issue assigned'],
  ['issue_updated', 'Issue updated'],
  ['issue_overdue', 'Issue overdue'],
  ['inspection_failed', 'Inspection failure'],
  ['material_shortage', 'Material shortage (low stock)'],
  ['po_approval', 'Purchase order approval'],
  ['material_received', 'Material received'],
  ['milestone_delayed', 'Milestone delay'],
  ['labour_payment_due', 'Pending worker payment'],
  ['sales_payment_due', 'Sales payment due'],
  ['document_expiry', 'Document expiry'],
  ['test_failed', 'Test failure'],
  ['drawing_revision', 'Drawing revision awaiting approval'],
];

/**
 * Keep permission definitions forward-compatible for databases that were
 * seeded before a module was introduced. `seed.js` intentionally skips demo
 * data when users already exist, so this small sync must run first.
 */
async function ensureHrmsUserLinkConstraint(conn) {
  const [indexes] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'hrms_employees'
        AND index_name = 'uq_hrms_employee_user' LIMIT 1`
  );
  if (indexes.length) return;
  const [duplicates] = await conn.query(
    `SELECT user_id, COUNT(*) AS count FROM hrms_employees
      WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (duplicates.length) {
    throw new Error(`Cannot add unique HRMS user link: user ${duplicates[0].user_id} is linked more than once`);
  }
  await conn.query('ALTER TABLE hrms_employees ADD UNIQUE KEY uq_hrms_employee_user (user_id)');
}

async function ensureSalaryEffectiveConstraint(conn) {
  const [indexes] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'hrms_salary_structures'
        AND index_name = 'uq_salary_employee_effective' LIMIT 1`
  );
  if (indexes.length) return;
  const [duplicates] = await conn.query(
    `SELECT employee_id, effective_from, COUNT(*) AS count FROM hrms_salary_structures
      GROUP BY employee_id, effective_from HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (duplicates.length) {
    throw new Error(`Cannot add unique salary effective-date constraint for employee ${duplicates[0].employee_id}`);
  }
  await conn.query('ALTER TABLE hrms_salary_structures ADD UNIQUE KEY uq_salary_employee_effective (employee_id, effective_from)');
}

async function syncHrmsDefaults(conn) {
  const leaveTypes = [
    ['Casual Leave', 'CL', 12, 1, '#0d6cc4', 'Short personal leave'],
    ['Sick Leave', 'SL', 12, 1, '#e79a09', 'Illness and medical leave'],
    ['Earned Leave', 'EL', 18, 1, '#0ea878', 'Planned annual leave'],
    ['Unpaid Leave', 'LWP', 0, 0, '#e24545', 'Leave without pay'],
  ];
  for (const row of leaveTypes) {
    await conn.query(
      `INSERT INTO hrms_leave_types (name, code, annual_quota, is_paid, color_code, description)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE code = code`, row
    );
  }
}

async function syncPermissions(conn) {
  await ensureHrmsUserLinkConstraint(conn);
  await ensureSalaryEffectiveConstraint(conn);
  await syncHrmsDefaults(conn);
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    for (const action of actions) {
      await conn.query(
        `INSERT INTO permissions (module, action, code, label) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE module = VALUES(module), action = VALUES(action), label = VALUES(label)`,
        [module, action, `${module}.${action}`, `${module} - ${action}`]
      );
    }
  }

  const [permRows] = await conn.query('SELECT id, code FROM permissions');
  const permId = new Map(permRows.map((p) => [p.code, p.id]));
  const [roles] = await conn.query('SELECT id, code FROM roles WHERE is_active = 1');
  for (const role of roles) {
    const perms = ROLE_PERMS[role.code];
    if (!perms) continue;
    const codes = perms === 'all'
      ? Object.entries(MODULE_ACTIONS).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`))
      : Object.entries(perms).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`));
    for (const code of codes) {
      if (permId.has(code)) {
        await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)', [role.id, permId.get(code)]);
      }
    }
  }
}

async function main() {
  const conn = await mysql.createConnection({ ...DB, multipleStatements: false });
  console.log(`[seed] connected to ${DB.database}`);

  const [existing] = await conn.query('SELECT COUNT(*) AS c FROM users');
  if (existing[0].c > 0 && !force) {
    await syncPermissions(conn);
    console.log('[seed] users already exist — synced permissions and skipped demo data');
    await conn.end();
    return;
  }

  if (force) {
    console.log('[seed] --force: wiping existing data');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    for (const row of tables) await conn.query(`TRUNCATE TABLE \`${Object.values(row)[0]}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  await ensureHrmsUserLinkConstraint(conn);
  await ensureSalaryEffectiveConstraint(conn);
  await syncHrmsDefaults(conn);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------------- Permissions ----------------
  console.log('[seed] permissions');
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    for (const action of actions) {
      await conn.query(
        'INSERT INTO permissions (module, action, code, label) VALUES (?,?,?,?)',
        [module, action, `${module}.${action}`, `${module} - ${action}`]
      );
    }
  }
  const [permRows] = await conn.query('SELECT id, code FROM permissions');
  const permId = new Map(permRows.map((p) => [p.code, p.id]));

  // ---------------- Roles ----------------
  console.log('[seed] roles');
  const roles = [
    ['Super Admin', 'super_admin', 'Full unrestricted access', 1],
    ['Admin', 'admin', 'System administrator', 1],
    ['Project Manager', 'project_manager', 'Manages one or more projects', 1],
    ['Site Engineer', 'site_engineer', 'Daily site operations and progress', 1],
    ['Civil Engineer', 'civil_engineer', 'Civil works and BOQ', 1],
    ['Electrical Engineer', 'electrical_engineer', 'Electrical works', 1],
    ['Plumbing Engineer', 'plumbing_engineer', 'Plumbing works', 1],
    ['Sales Executive', 'sales_executive', 'Unit sales and collections', 1],
    ['Store Manager', 'store_manager', 'Materials and inventory', 1],
    ['Accountant', 'accountant', 'Billing, costs and payments', 1],
    ['Safety Officer', 'safety_officer', 'Safety inspections and issues', 1],
    ['Quality Engineer', 'quality_engineer', 'Quality tests and inspections', 1],
  ];
  const roleId = new Map();
  for (const [name, code, description, isSystem] of roles) {
    const [r] = await conn.query('INSERT INTO roles (name, code, description, is_system) VALUES (?,?,?,?)', [name, code, description, isSystem]);
    roleId.set(code, r.insertId);
    const perms = ROLE_PERMS[code];
    const flat = [];
    const codes = perms === 'all'
      ? Object.entries(MODULE_ACTIONS).flatMap(([m, acts]) => acts.map((a) => `${m}.${a}`))
      : Object.entries(perms).flatMap(([m, acts]) => acts.map((a) => `${m}.${a}`));
    for (const c of codes) {
      if (permId.has(c)) flat.push([r.insertId, permId.get(c)]);
    }
    if (flat.length) {
      await conn.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${flat.map(() => '(?,?)').join(',')}`, flat.flat());
    }
  }

  // ---------------- Users ----------------
  console.log('[seed] users');
  const [adminR] = await conn.query(
    'INSERT INTO users (employee_code, name, email, phone, password_hash, status) VALUES (?,?,?,?,?,?)',
    ['EMP-001', 'System Administrator', ADMIN_EMAIL, '9000000000', hash, 'active']);
  const adminId = adminR.insertId;
  await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [adminId, roleId.get('super_admin')]);

  const demoUsers = [
    ['EMP-002', 'Admin User', 'admin.user@constructionerp.com', 'admin'],
    ['EMP-003', 'Rajesh Sharma', 'pm@constructionerp.com', 'project_manager'],
    ['EMP-004', 'Amit Patil', 'engineer@constructionerp.com', 'site_engineer'],
    ['EMP-005', 'Sneha Kulkarni', 'civil@constructionerp.com', 'civil_engineer'],
    ['EMP-006', 'Vikram Joshi', 'electrical@constructionerp.com', 'electrical_engineer'],
    ['EMP-007', 'Pradip More', 'plumbing@constructionerp.com', 'plumbing_engineer'],
    ['EMP-008', 'Anjali Desai', 'sales@constructionerp.com', 'sales_executive'],
    ['EMP-009', 'Suresh Yadav', 'store@constructionerp.com', 'store_manager'],
    ['EMP-010', 'Meena Iyer', 'accounts@constructionerp.com', 'accountant'],
    ['EMP-011', 'Kiran Bhosale', 'safety@constructionerp.com', 'safety_officer'],
    ['EMP-012', 'Deepa Nair', 'quality@constructionerp.com', 'quality_engineer'],
  ];
  const userId = new Map();
  for (const [code, name, email, roleCode] of demoUsers) {
    const [r] = await conn.query(
      'INSERT INTO users (employee_code, name, email, phone, password_hash, status) VALUES (?,?,?,?,?,?)',
      [code, name, email, `91${Math.floor(100000000 + Math.random() * 899999999)}`, demoHash, 'active']);
    userId.set(email, r.insertId);
    await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [r.insertId, roleId.get(roleCode)]);
  }

  // ---------------- Projects ----------------
  console.log('[seed] projects / wings / floors / units');
  const [p1] = await conn.query(
    `INSERT INTO projects (name, code, project_type, client_name, developer_name, address, city, state, pincode, description, start_date, expected_completion_date, status, budget, manager_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['Sunrise Heights', 'PRJ-000001', 'residential', 'Sunrise Realty LLP', 'ABC Developers',
     'Plot 45, Baner Road', 'Pune', 'Maharashtra', '411045',
     'Premium 2/3 BHK residential towers with podium parking and clubhouse.',
     '2025-04-01', '2027-03-31', 'in_progress', 850000000.00, userId.get('pm@constructionerp.com'), adminId]);
  const [p2] = await conn.query(
    `INSERT INTO projects (name, code, project_type, client_name, developer_name, address, city, state, pincode, description, start_date, expected_completion_date, status, budget, manager_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['Tech Park Phase 2', 'PRJ-000002', 'commercial', 'InnoSpace Ventures', 'ABC Developers',
     'Survey 112, Hinjewadi', 'Pune', 'Maharashtra', '411057',
     'Grade-A IT office complex — 2 towers, ~4.2 lakh sqft.',
     '2025-08-15', '2027-12-31', 'planning', 1200000000.00, userId.get('pm@constructionerp.com'), adminId]);

  const project1 = p1.insertId;
  const project2 = p2.insertId;

  // PM + engineers assigned to projects
  const assignRows = [
    [userId.get('pm@constructionerp.com'), project1, 0],
    [userId.get('pm@constructionerp.com'), project2, 0],
    [userId.get('engineer@constructionerp.com'), project1, 0],
    [userId.get('civil@constructionerp.com'), project1, 0],
    [userId.get('sales@constructionerp.com'), project1, 0],
    [userId.get('store@constructionerp.com'), project1, 0],
    [userId.get('accounts@constructionerp.com'), project1, 0],
    [userId.get('safety@constructionerp.com'), project1, 0],
    [userId.get('quality@constructionerp.com'), project1, 0],
  ];
  await conn.query(`INSERT INTO user_projects (user_id, project_id, wing_id) VALUES ${assignRows.map(() => '(?,?,?)').join(',')}`, assignRows.flat());

  const wingNames = [['Wing A', 'A'], ['Wing B', 'B'], ['Wing C', 'C']];
  const wingId = new Map();
  for (const [name, code] of wingNames) {
    const [w] = await conn.query(
      `INSERT INTO wings (project_id, name, code, floors_count, units_count, start_date, expected_completion_date, status, progress, description)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [project1, `${name}`, code, 12, 48, '2025-04-15', '2027-01-31', 'in_progress', code === 'A' ? 42 : code === 'B' ? 28 : 12, `${name} — 12 storey tower`]);
    wingId.set(code, w.insertId);
    for (let f = 0; f < 12; f += 1) {
      const floorName = f === 0 ? 'Ground' : `Floor ${f}`;
      const [fl] = await conn.query(
        'INSERT INTO floors (project_id, wing_id, name, sequence, status, progress) VALUES (?,?,?,?,?,?)',
        [project1, w.insertId, floorName, f, f * 2 < 100 / 3 ? 'completed' : f < 8 ? 'in_progress' : 'pending', Math.max(0, Math.min(100, 100 - f * 15))]);
      if (f >= 1 && f <= 10) {
        for (let u = 1; u <= 4; u += 1) {
          const type = u <= 2 ? '2BHK' : '3BHK';
          await conn.query(
            'INSERT INTO units (project_id, wing_id, floor_id, unit_number, unit_type, carpet_area, saleable_area, facing, status, price) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [project1, w.insertId, fl.insertId, `${code}${f}0${u}`, type, u <= 2 ? 715 : 1020, u <= 2 ? 945 : 1350, u <= 2 ? 'East' : 'West', 'available', u <= 2 ? 9800000 : 14500000]);
        }
      }
    }
  }
  // Wing-level restriction example: electrical engineer → wing A only
  await conn.query('INSERT INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)',
    [userId.get('electrical@constructionerp.com'), project1, wingId.get('A')]);
  await conn.query('INSERT INTO user_projects (user_id, project_id, wing_id) VALUES (?,?,?)',
    [userId.get('plumbing@constructionerp.com'), project1, wingId.get('B')]);

  // ---------------- Materials master data ----------------
  console.log('[seed] materials / suppliers');
  const cats = [
    ['Cement & Binding', 1], ['Aggregates & Sand', 1], ['Steel & Metals', 1], ['Bricks & Blocks', 1],
    ['Tiles & Finishing', 1], ['Plumbing Materials', 1], ['Electrical Materials', 1], ['Paints', 1],
    ['Machinery & Equipment', 0], ['Other Consumables', 1],
  ];
  const catId = new Map();
  for (const [name, consumable] of cats) {
    const [r] = await conn.query('INSERT INTO material_categories (name, description, is_consumable) VALUES (?,?,?)', [name, `${name} materials`, consumable]);
    catId.set(name, r.insertId);
  }
  const mats = [
    ['OPC 53 Cement', 'CEM-001', 'Cement & Binding', 'bags', 100],
    ['River Sand', 'SAND-001', 'Aggregates & Sand', 'cft', 500],
    ['20mm Aggregate', 'AGG-001', 'Aggregates & Sand', 'cft', 400],
    ['TMT Steel Fe500', 'STL-001', 'Steel & Metals', 'kg', 2000],
    ['AAC Blocks', 'BLK-001', 'Bricks & Blocks', 'nos', 5000],
    ['Vitrified Tiles 600x600', 'TIL-001', 'Tiles & Finishing', 'sqft', 1000],
    ['CPVC Pipes 1"', 'PIP-001', 'Plumbing Materials', 'meter', 200],
    ['Copper Wire 2.5mm', 'ELE-001', 'Electrical Materials', 'meter', 500],
    ['Interior Emulsion', 'PNT-001', 'Paints', 'litre', 200],
    ['RMC M25', 'CON-001', 'Other Consumables', 'cum', 50],
  ];
  const matId = new Map();
  for (const [name, code, cat, unit, min] of mats) {
    const [r] = await conn.query('INSERT INTO materials (category_id, name, code, unit, description, min_stock_level) VALUES (?,?,?,?,?,?)',
      [catId.get(cat), name, code, unit, `${name} — construction material`, min]);
    matId.set(code, r.insertId);
  }

  const suppliers = [
    ['Shree Cement Traders', 'SUP-001', 'Ramesh Gupta', '9822011223', 'sales@shreecement.com', 'GST12345PUNE'],
    ['Om Sai Steel & Metals', 'SUP-002', 'Sanjay Kadam', '9823033445', 'omsaisteel@gmail.com', 'GST99887PUNE'],
    ['Pune Building Materials Co.', 'SUP-003', 'Farid Sheikh', '9824055667', 'punebmc@yahoo.com', 'GST55443PUNE'],
  ];
  const supId = [];
  for (const [name, code, cp, ph, em, gst] of suppliers) {
    const [r] = await conn.query('INSERT INTO suppliers (name, code, contact_person, phone, email, gst_number, city, state) VALUES (?,?,?,?,?,?,?,?)',
      [name, code, cp, ph, em, gst, 'Pune', 'Maharashtra']);
    supId.push(r.insertId);
  }

  // ---------------- Workforce ----------------
  console.log('[seed] workforce');
  const [con1] = await conn.query("INSERT INTO contractors (name, contact_person, phone) VALUES ('Balaji Constructions', 'Balaji Rao', '9822077889')");
  const [con2] = await conn.query("INSERT INTO contractors (name, contact_person, phone) VALUES ('Samarth Labour Supply', 'Samarth Pawar', '9822088990')");
  const workerCats = [
    ['Mason', 950], ['Helper', 600], ['Carpenter', 900], ['Bar Bender', 850],
    ['Electrician', 950], ['Plumber', 900], ['Painter', 850], ['Supervisor', 1200],
  ];
  const wcatId = new Map();
  for (const [name, rate] of workerCats) {
    const [r] = await conn.query('INSERT INTO worker_categories (name, description, base_daily_rate) VALUES (?,?,?)', [name, `${name} trade`, rate]);
    wcatId.set(name, r.insertId);
    await conn.query('INSERT INTO labour_rates (worker_category_id, contractor_id, daily_rate, overtime_rate, effective_date) VALUES (?,?,?,?,?)',
      [r.insertId, con1.insertId, rate, Math.round(rate / 8), '2025-04-01']);
  }

  const workerNames = ['Ramesh Kumar', 'Sunil Verma', 'Mohan Lal', 'Ganesh Shinde', 'Dinesh Pawar', 'Ravi Bhosale', 'Sanjay More', 'Vijay Kale', 'Nitin Jagtap', 'Santosh Gaikwad', 'Arun Chavan', 'Mahesh Jadhav'];
  const workerIds = [];
  for (let i = 0; i < workerNames.length; i += 1) {
    const catNames = ['Mason', 'Helper', 'Carpenter', 'Bar Bender'];
    const cat = catNames[i % catNames.length];
    const wage = wcatId && workerCats.find((w) => w[0] === cat)[1];
    const [r] = await conn.query(
      `INSERT INTO workers (worker_code, name, phone, category_id, contractor_id, daily_wage, overtime_rate, project_id, wing_id, joining_date, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      [`WK-${String(i + 1).padStart(4, '0')}`, workerNames[i], `98${String(22000000 + i * 111111).slice(0, 8)}`,
       wcatId.get(cat), i % 2 === 0 ? con1.insertId : con2.insertId, wage, Math.round(wage / 8), project1, wingId.get(['A', 'B', 'C'][i % 3]), '2025-05-01']);
    workerIds.push(r.insertId);
  }

  // Attendance: last 5 days
  console.log('[seed] attendance / progress / milestones');
  const statuses = ['present', 'present', 'present', 'absent', 'present', 'half_day', 'overtime', 'present'];
  for (let d = 0; d < 5; d += 1) {
    for (let i = 0; i < workerIds.length; i += 1) {
      const st = statuses[(i + d) % statuses.length];
      const wage = workerCats[i % 4][1];
      const ot = st === 'overtime' ? 2 : 0;
      const daily = st === 'present' || st === 'overtime' ? wage : st === 'half_day' ? wage / 2 : 0;
      await conn.query(
        `INSERT INTO attendance (worker_id, project_id, wing_id, attendance_date, shift, check_in, check_out, status, overtime_hours, daily_amount, overtime_amount, payment_status, marked_by)
         VALUES (?,?,?,DATE_SUB(CURDATE(), INTERVAL ? DAY),'day',?,?,?,?,?,?, 'pending', ?)`,
        [workerIds[i], project1, wingId.get(['A', 'B', 'C'][i % 3]), d,
         st === 'absent' || st === 'leave' ? null : '08:30:00', st === 'absent' || st === 'leave' ? null : '17:30:00',
         st, ot, daily, ot * Math.round(wage / 8), userId.get('engineer@constructionerp.com')]);
    }
  }

  // Daily progress samples
  const progresses = [
    ['Wing A', 'Floor 7 slab casting completed', 'Completed 7th floor RCC slab (620 sqm) with M25 RMC; curing started.', 48, 42, 'OPC cement 120 bags, RMC 45 cum', 18.979, 73.8566],
    ['Wing B', 'Brickwork 4th floor in progress', 'AAC block masonry on 4th floor — 60% completed; electric conduiting parallel.', 30, 35, 'AAC blocks 1800 nos, mortar 2 cum', 18.979, 73.8566],
    ['Wing C', 'Excavation & PCC for footing', 'Footing excavation done for F-101..F-112; PCC laid for 8 footings.', 15, 28, 'PCC M10 12 cum, sand 80 cft', 18.979, 73.8566],
  ];
  for (const [wingCode, desc, done, pct, labour, material, lat, lng] of progresses) {
    await conn.query(
      `INSERT INTO daily_progress (project_id, wing_id, floor_id, report_date, work_time, work_description, work_completed, percentage, labour_count, material_used, weather, remarks, latitude, longitude, created_by)
       VALUES (?,?,? ,CURDATE(),?,?,?,?,?,?,?,?,?,?,?)`,
      [project1, wingId.get(wingCode === 'Wing A' ? 'A' : wingCode === 'Wing B' ? 'B' : 'C'), null,
       '17:00:00', desc, done, pct, labour, material, 'Clear', 'Progress on track', lat, lng, userId.get('engineer@constructionerp.com')]);
  }

  const milestoneData = [
    [wingId.get('A'), 'Foundation & Plinth Completion', 'completed', 100, '2025-05-01', '2025-08-31', '2025-08-20'],
    [wingId.get('A'), 'Superstructure (Slabs up to 7th floor)', 'in_progress', 62, '2025-09-01', '2026-02-28', null],
    [wingId.get('B'), 'Brickwork & Plaster', 'in_progress', 35, '2025-11-01', '2026-05-31', null],
    [wingId.get('C'), 'Foundation Completion', 'in_progress', 40, '2026-01-01', '2026-04-30', null],
    [null, 'MEP First Fix', 'pending', 0, '2026-06-01', '2026-10-31', null],
  ];
  for (const [wid, name, status, pct, sd, td, cd] of milestoneData) {
    await conn.query(
      'INSERT INTO milestones (project_id, wing_id, name, description, start_date, target_date, completion_date, percentage, status, responsible_user_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [project1, wid, name, name, sd, td, cd, pct, status, userId.get('pm@constructionerp.com'), userId.get('pm@constructionerp.com')]);
  }

  // ---------------- Inventory ----------------
  console.log('[seed] inventory (requirement / PO / receipt / consumption)');
  const [mr] = await conn.query(
    `INSERT INTO material_requirements (requirement_no, project_id, wing_id, material_id, required_qty, unit, required_date, requested_by, status, approved_by, approved_at, remarks)
     VALUES (?,?,?,?,?,?,?,?, 'approved', ?, NOW(), ?)`,
    ['MRQ-000001', project1, wingId.get('A'), matId.get('STL-001'), 5000, 'kg', '2026-08-30', userId.get('engineer@constructionerp.com'), userId.get('pm@constructionerp.com'), 'Steel for slab 8']);
  void mr;

  const [po1] = await conn.query(
    `INSERT INTO purchase_orders (po_number, project_id, wing_id, supplier_id, po_date, expected_delivery_date, status, subtotal, discount, tax_amount, grand_total, remarks, created_by, approved_by, approved_at)
     VALUES ('TMP',?,?,?,?,?, 'approved', ?, ?, ?, ?, 'Steel supply for Q3', ?, ?, NOW())`,
    [project1, wingId.get('A'), supId[1], '2026-08-18', '2026-08-25', 295000, 0, 53100, 348100, userId.get('store@constructionerp.com'), userId.get('pm@constructionerp.com')]);
  const poId = po1.insertId;
  await conn.query('UPDATE purchase_orders SET po_number = ? WHERE id = ?', [`PO-${String(poId).padStart(6, '0')}`, poId]);
  const [poi] = await conn.query(
    'INSERT INTO purchase_order_items (po_id, material_id, quantity, unit, rate, tax_percent, amount, received_qty) VALUES (?,?,?,?,?,?,?,0)',
    [poId, matId.get('STL-001'), 5000, 'kg', 59, 18, 348100]);
  const [poi2] = await conn.query(
    'INSERT INTO purchase_order_items (po_id, material_id, quantity, unit, rate, tax_percent, amount, received_qty) VALUES (?,?,?,?,?,?,?,0)',
    [poId, matId.get('CEM-001'), 200, 'bags', 385, 18, 90860]);

  // Receipt (GRN): steel received full, cement partial with some damaged
  const [grn] = await conn.query(
    `INSERT INTO material_receipts (grn_number, po_id, project_id, supplier_id, receipt_date, challan_number, remarks, received_by)
     VALUES ('TMP',?,?,?,?, 'CH-8842', 'Received at main gate stores', ?)`,
    [poId, project1, supId[1], '2026-08-22', userId.get('store@constructionerp.com')]);
  const grnId = grn.insertId;
  await conn.query('UPDATE material_receipts SET grn_number = ? WHERE id = ?', [`GRN-${String(grnId).padStart(6, '0')}`, grnId]);
  await conn.query('INSERT INTO material_receipt_items (receipt_id, po_item_id, material_id, unit, received_qty, damaged_qty, accepted_qty) VALUES (?,?,?,?,?,0,?)',
    [grnId, poi.insertId, matId.get('STL-001'), 'kg', 5000, 5000]);
  await conn.query('INSERT INTO material_receipt_items (receipt_id, po_item_id, material_id, unit, received_qty, damaged_qty, accepted_qty) VALUES (?,?,?,?,?,?,?)',
    [grnId, poi2.insertId, matId.get('CEM-001'), 'bags', 200, 5, 195]);
  await conn.query('UPDATE purchase_order_items SET received_qty = received_qty + 5000 WHERE id = ?', [poi.insertId]);
  await conn.query('UPDATE purchase_order_items SET received_qty = received_qty + 195 WHERE id = ?', [poi2.insertId]);
  await conn.query("UPDATE purchase_orders SET status = 'partially_received' WHERE id = ?", [poId]);
  const stx = [
    [matId.get('STL-001'), 'receipt', 5000, 'material_receipt', grnId, '2026-08-22'],
    [matId.get('CEM-001'), 'receipt', 195, 'material_receipt', grnId, '2026-08-22'],
    [matId.get('CEM-001'), 'damage', -5, 'material_receipt', grnId, '2026-08-22'],
    [matId.get('SAND-001'), 'opening', 1200, null, null, '2026-08-01'],
    [matId.get('AGG-001'), 'opening', 900, null, null, '2026-08-01'],
  ];
  for (const [m, t, q, rm, rid, dt] of stx) {
    await conn.query('INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [project1, m, t, q, rm, rid, dt, userId.get('store@constructionerp.com')]);
  }
  // Consumption
  const [cons] = await conn.query(
    `INSERT INTO material_consumption (project_id, wing_id, floor_id, material_id, quantity, unit, consumption_date, location, used_by, remarks)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [project1, wingId.get('A'), null, matId.get('STL-001'), 1200, 'kg', '2026-08-23', 'Wing A slab 7 shuttering', userId.get('engineer@constructionerp.com'), 'Bar bending for slab 8']);
  await conn.query('INSERT INTO stock_transactions (project_id, material_id, txn_type, quantity, reference_module, reference_id, txn_date, created_by) VALUES (?,?,?,?,?,?,?,?)',
    [project1, matId.get('STL-001'), 'consumption', -1200, 'material_consumption', cons.insertId, '2026-08-23', userId.get('engineer@constructionerp.com')]);

  // ---------------- Billing ----------------
  console.log('[seed] billing');
  const ce = [
    ['consumable', 'Cement', 'OPC 53 cement 200 bags', 200, 'bags', 385, 18, 90860, 90860, 'paid', supId[0], 'INV-CEM-118'],
    ['consumable', 'Steel', 'TMT Fe500 5000 kg', 5000, 'kg', 59, 18, 348100, 200000, 'partial', supId[1], 'INV-STL-221'],
    ['non_consumable', 'Machinery', 'Tower crane rental — August', 1, 'month', 185000, 18, 218300, 218300, 'paid', supId[2], 'CRN-0826'],
    ['non_consumable', 'Vehicle', 'Site vehicle diesel & charges', 1, 'month', 22000, 0, 22000, 0, 'unpaid', null, 'VEH-0826'],
    ['labour', 'Labour', 'Contract labour bill — week 34', 1, 'nos', 146000, 0, 146000, 100000, 'partial', null, 'LAB-W34'],
  ];
  for (const [type, cat, desc, qty, unit, rate, taxPct, total, paid, status, sid, bill] of ce) {
    await conn.query(
      `INSERT INTO cost_entries (project_id, wing_id, entry_type, category, description, bill_number, bill_date, entry_date, quantity, unit, rate, tax_percent, tax_amount, total_amount, paid_amount, payment_status, supplier_id, created_by)
       VALUES (?,?,?,?,?,?,?, CURDATE() - INTERVAL 3 DAY, ?,?,?,?,?,?,?,?,?,?)`,
      [project1, wingId.get('A'), type, cat, desc, bill, '2026-08-20', qty, unit, rate, taxPct, +(qty * rate * taxPct / 100).toFixed(2), total, paid, status, sid, userId.get('accounts@constructionerp.com')]);
  }

  // ---------------- BOQ ----------------
  console.log('[seed] boq');
  const boqCats = ['Earthwork', 'Concrete Work', 'Masonry', 'Plastering & Finishing', 'Waterproofing', 'Electrical', 'Plumbing'];
  const boqCatId = new Map();
  for (const c of boqCats) {
    const [r] = await conn.query('INSERT INTO boq_categories (name) VALUES (?)', [c]);
    boqCatId.set(c, r.insertId);
  }
  const [boqIns] = await conn.query(
    "INSERT INTO boq (boq_number, project_id, wing_id, title, description, status, tax_percent, discount, created_by) VALUES ('TMP',?,?,?, 'Wing A structure package', 'active', 18, 0, ?)",
    [project1, wingId.get('A'), 'Wing A — Civil BOQ', userId.get('civil@constructionerp.com')]);
  const boqId = boqIns.insertId;
  await conn.query('UPDATE boq SET boq_number = ? WHERE id = ?', [`BOQ-${String(boqId).padStart(6, '0')}`, boqId]);
  const boqItems = [
    ['EW-001', 'Excavation for foundation in all types of soil', 'Earthwork', 'cum', 2200, 240, 2200],
    ['CW-001', 'PCC M10 below footings', 'Concrete Work', 'cum', 180, 4800, 165],
    ['CW-002', 'RCC M25 in footings, columns, beams & slabs', 'Concrete Work', 'cum', 1250, 7600, 780],
    ['CW-003', 'TMT reinforcement steel Fe500', 'Concrete Work', 'kg', 95000, 68, 62000],
    ['MW-001', 'AAC block masonry 200mm thick', 'Masonry', 'sqm', 4800, 620, 1400],
    ['PL-001', 'Internal cement plaster 12mm', 'Plastering & Finishing', 'sqm', 9500, 320, 0],
    ['EL-001', 'Point wiring — lighting circuit', 'Electrical', 'nos', 620, 950, 0],
  ];
  let sort = 0;
  for (const [code, desc, cat, unit, eq, rate, aq] of boqItems) {
    await conn.query(
      'INSERT INTO boq_items (boq_id, item_code, description, category_id, unit, estimated_qty, rate, actual_qty, actual_amount, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [boqId, code, desc, boqCatId.get(cat), unit, eq, rate, aq, aq * rate, sort]);
    sort += 1;
  }

  // ---------------- Quality ----------------
  console.log('[seed] quality');
  const testTypes = ['Cement Cube Test', 'Steel Tensile Test', 'Concrete Cube Test', 'Soil Compaction Test', 'Water Quality Test'];
  const ttId = new Map();
  for (const t of testTypes) {
    const [r] = await conn.query('INSERT INTO test_types (name, description) VALUES (?,?)', [t, `${t} as per IS standards`]);
    ttId.set(t, r.insertId);
  }
  const inspTypes = ['Quality Inspection', 'Safety Inspection', 'Site Inspection', 'Material Inspection', 'Workmanship Inspection', 'Electrical Inspection', 'Plumbing Inspection'];
  const itId = new Map();
  for (const t of inspTypes) {
    const [r] = await conn.query('INSERT INTO inspection_types (name, checklist_template) VALUES (?,?)', [t, t === 'Safety Inspection' ? 'PPE compliance;Barricading;Housekeeping; Scaffold tagging' : null]);
    itId.set(t, r.insertId);
  }
  const [tr1] = await conn.query(
    `INSERT INTO test_reports (test_number, test_type_id, project_id, wing_id, material_id, sample_date, test_date, laboratory, test_result, standard_spec, result_status, status, created_by)
     VALUES ('TMP',?,?,?,?,CURDATE() - INTERVAL 10 DAY, CURDATE() - INTERVAL 7 DAY, 'Pune Materials Lab', 'Compressive strength 28.4 N/mm² (avg of 3 cubes)', 'IS 456:2000 — M25 ≥ 25 N/mm²', 'pass', 'approved', ?)`,
    [ttId.get('Concrete Cube Test'), project1, wingId.get('A'), null, userId.get('quality@constructionerp.com')]);
  await conn.query('UPDATE test_reports SET test_number = ? WHERE id = ?', [`TST-${String(tr1.insertId).padStart(6, '0')}`, tr1.insertId]);

  const [insp1] = await conn.query(
    `INSERT INTO inspections (inspection_number, inspection_type_id, project_id, wing_id, location, inspector_id, inspection_date, observation, status, remarks, latitude, longitude, created_by)
     VALUES ('TMP',?,?,?,?,?,NOW(),?,?,?,?,?,?)`,
    [itId.get('Safety Inspection'), project1, wingId.get('A'), 'Wing A — podium level', userId.get('safety@constructionerp.com'),
     'Guard rails missing at two edges; PPE compliance ~90%.', 'passed', 'Fix guard rails before next pour', 18.979, 73.8566, userId.get('safety@constructionerp.com')]);
  await conn.query('UPDATE inspections SET inspection_number = ? WHERE id = ?', [`INS-${String(insp1.insertId).padStart(6, '0')}`, insp1.insertId]);
  await conn.query(
    "INSERT INTO inspection_items (inspection_id, checklist_item, result) VALUES (?,?,?), (?,?,?), (?,?,?), (?,?,?)",
    [insp1.insertId, 'PPE compliance', 'pass', insp1.insertId, 'Housekeeping', 'pass', insp1.insertId, 'Edge protection', 'fail', insp1.insertId, 'Scaffold tagging', 'pass']);

  // ---------------- Issues ----------------
  console.log('[seed] issues');
  const [ic1] = await conn.query("INSERT INTO issue_categories (name, description) VALUES ('Quality Defect','Workmanship or material quality issue'), ('Safety Hazard','Unsafe condition observed'), ('Delay','Schedule related issue'), ('Design Clarification','Drawing/spec clarification needed'), ('Material Shortage','Stock shortage on site')");
  void ic1;
  const [iss1] = await conn.query(
    `INSERT INTO issues (issue_number, project_id, wing_id, priority, title, description, raised_by, assigned_to, due_date, status, latitude, longitude)
     VALUES ('TMP',?,?, 'high', 'Honeycombing observed in column C-8', 'Surface honeycombing on west face of column C-8 at 6th floor. Needs repair methodology approval.', ?, ?, CURDATE() + INTERVAL 5 DAY, 'assigned', 18.979, 73.8566)`,
    [project1, wingId.get('A'), userId.get('quality@constructionerp.com'), userId.get('civil@constructionerp.com')]);
  await conn.query('UPDATE issues SET issue_number = ? WHERE id = ?', [`ISS-${String(iss1.insertId).padStart(6, '0')}`, iss1.insertId]);
  await conn.query('INSERT INTO issue_comments (issue_id, user_id, comment) VALUES (?,?,?)',
    [iss1.insertId, userId.get('civil@constructionerp.com'), 'Inspected on site — repair with polymer modified mortar approved.']);

  // ---------------- Sales ----------------
  console.log('[seed] sales');
  const [unitRows] = await conn.query('SELECT id, wing_id, floor_id, price FROM units WHERE project_id = ? AND unit_number IN (?,?)', [project1, 'A101', 'A102']);
  for (const [i, u] of unitRows.entries()) {
    const cust = i === 0 ? ['Nilesh & Rohini Khandelwal', '9860112233'] : ['Farhan Sheikh', '9860223344'];
    const [sale] = await conn.query(
      `INSERT INTO sales (project_id, wing_id, floor_id, unit_id, customer_name, customer_phone, booking_date, sale_date, sale_amount, amount_received, payment_status, is_gst, gst_amount, status, sold_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [project1, u.wing_id, u.floor_id, u.id, cust[0], cust[1], '2026-08-10', '2026-08-12', u.price, i === 0 ? u.price : u.price * 0.3, i === 0 ? 'paid' : 'partially_paid', 1, +(u.price * 0.05).toFixed(2), 'sold', userId.get('sales@constructionerp.com')]);
    await conn.query('UPDATE units SET status = "sold" WHERE id = ?', [u.id]);
    await conn.query(
      'INSERT INTO sales_payments (sale_id, payment_date, amount, payment_mode, is_gst, reference_number, received_by) VALUES (?,?,?,?,?,?,?)',
      [sale.insertId, '2026-08-12', i === 0 ? u.price : u.price * 0.3, 'bank_transfer', 1, `UTR-8260${i}123`, userId.get('sales@constructionerp.com')]);
  }

  // ---------------- Notification settings & sample notifications ------------
  console.log('[seed] notification settings');
  for (const [key, label] of NOTIFICATION_EVENTS) {
    await conn.query('INSERT INTO notification_settings (event_key, label, enabled) VALUES (?,?,1)', [key, label]);
  }
  await conn.query(
    "INSERT INTO notifications (user_id, title, message, type, module) VALUES (?, 'Welcome to Construction ERP', 'Your admin account is ready. Explore the dashboard to get started.', 'success', 'system')",
    [adminId]);

  console.log('');
  console.log('[seed] ✅ Seeding complete.');
  console.log(`[seed] Super Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`[seed] Demo users password: ${DEMO_PASSWORD}`);
  console.log('[seed] Demo logins: pm@ / engineer@ / store@ / sales@ / accounts@ / safety@ / quality@  @constructionerp.com');
  await conn.end();
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
