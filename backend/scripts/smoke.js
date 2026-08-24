/**
 * API smoke test — runs against a live server holding a seeded database.
 *   BASE_URL=http://localhost:4000 node scripts/smoke.js
 * Exits non-zero if any check fails. Used by CI after migrate+seed+start.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@constructionerp.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';

let token = null;
let passed = 0;
let failed = 0;

async function api(method, path, body, useToken = true) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(useToken && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`[smoke] testing ${BASE}`);

  await check('health endpoint', async () => {
    const r = await api('GET', '/api/health', null, false);
    assert(r.status === 200 && r.data?.status === 'ok', `got ${r.status}`);
  });

  await check('login as admin', async () => {
    const r = await api('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, false);
    assert(r.status === 200 && r.data?.data?.accessToken, `login failed: ${JSON.stringify(r.data)}`);
    token = r.data.data.accessToken;
  });

  await check('me profile', async () => {
    const r = await api('GET', '/api/auth/me');
    assert(r.status === 200 && r.data?.data?.email === ADMIN_EMAIL, `got ${r.status}`);
  });

  await check('list projects', async () => {
    const r = await api('GET', '/api/projects');
    assert(r.status === 200 && Array.isArray(r.data?.data), `got ${r.status}`);
    assert(r.data.data.length >= 1, 'expected seeded projects');
    globalThis.projectId = r.data.data[0].id;
  });

  await check('list wings', async () => {
    const r = await api('GET', `/api/wings?projectId=${globalThis.projectId}`);
    assert(r.status === 200 && r.data.data.length >= 1, 'expected wings');
  });

  await check('dashboard overview', async () => {
    const r = await api('GET', '/api/dashboard/overview');
    assert(r.status === 200 && r.data?.data?.projects, `got ${r.status}`);
  });

  await check('create + update + delete milestone', async () => {
    const c = await api('POST', '/api/milestones', { project_id: globalThis.projectId, name: 'Smoke milestone', percentage: 10 });
    assert(c.status === 201, `create: ${c.status} ${JSON.stringify(c.data)}`);
    const id = c.data.data.id;
    const u = await api('PUT', `/api/milestones/${id}`, { percentage: 100 });
    assert(u.status === 200 && u.data.data.status === 'completed', `update: ${JSON.stringify(u.data)}`);
    const d = await api('DELETE', `/api/milestones/${id}`);
    assert(d.status === 200, `delete: ${d.status}`);
  });

  await check('daily progress create', async () => {
    const r = await api('POST', '/api/progress', {
      project_id: globalThis.projectId, report_date: new Date().toISOString().slice(0, 10),
      work_description: 'Smoke test entry', percentage: 55, labour_count: 12,
    });
    assert(r.status === 201, `got ${r.status}: ${JSON.stringify(r.data)}`);
  });

  await check('stock summary', async () => {
    const r = await api('GET', `/api/materials/stock?projectId=${globalThis.projectId}`);
    assert(r.status === 200 && Array.isArray(r.data?.data), `got ${r.status}`);
  });

  await check('boq list + totals', async () => {
    const r = await api('GET', '/api/boq');
    assert(r.status === 200, `got ${r.status}`);
    if (r.data.data[0]) {
      const d = await api('GET', `/api/boq/${r.data.data[0].id}`);
      assert(d.status === 200 && d.data.data.totals, 'boq totals missing');
    }
  });

  await check('attendance monthly report', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const r = await api('GET', `/api/attendance/monthly-report?projectId=${globalThis.projectId}&month=${month}`);
    assert(r.status === 200, `got ${r.status}`);
  });

  await check('sales summary', async () => {
    const r = await api('GET', `/api/sales/summary?projectId=${globalThis.projectId}`);
    assert(r.status === 200 && r.data?.data?.totals, `got ${r.status}`);
  });

  await check('issues list', async () => {
    const r = await api('GET', '/api/issues');
    assert(r.status === 200, `got ${r.status}`);
  });

  await check('reports registry + csv export', async () => {
    const r = await api('GET', '/api/reports');
    assert(r.status === 200 && r.data.data.length >= 10, `got ${r.status}`);
    const res = await fetch(`${BASE}/api/reports/project-progress?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    assert(res.status === 200 && text.includes('code'), 'csv export failed');
  });

  await check('audit logs visible', async () => {
    const r = await api('GET', '/api/admin/audit-logs');
    assert(r.status === 200 && r.data.data.length > 0, `got ${r.status}`);
  });

  await check('rbac blocks unauthorized (no token → 401)', async () => {
    const r = await api('GET', '/api/users', null, false);
    assert(r.status === 401, `got ${r.status}`);
  });

  console.log(`\n[smoke] ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
