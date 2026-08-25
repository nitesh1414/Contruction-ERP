// Dry-run validation of ../seed.js against ../../database/schema.sql without MySQL.
//   node scripts/sql-lint/seed-dry-run.mjs
import { register } from 'node:module';

register('./loader.mjs', new URL('./', import.meta.url));

const { SCHEMA, SCHEMA_ERRORS, problems, stats } = await import('./mock-mysql.mjs');

console.log(`[check] schema tables parsed: ${SCHEMA.size}`);
if (SCHEMA_ERRORS.length) {
  console.log(`\n[check] ❌ ${SCHEMA_ERRORS.length} schema structural problem(s):`);
  for (const e of SCHEMA_ERRORS) console.log('   -', e);
} else {
  console.log('[check] schema structure OK (FKs, indexes, duplicate columns)');
}

// sanity: verify the loader really redirects mysql2/promise to the mock
const probe = await import('mysql2/promise');
if (!probe.createConnection) {
  console.error('[check] ❌ mysql2/promise import probe failed — loader not redirecting');
  process.exit(1);
}
const conn = await probe.createConnection();
try {
  await conn.query('INSERT INTO permissions (module, action, code, label) VALUES (?,?,?,?)', ['__probe', 'view', '__probe.view', 'x']);
  if (stats.inserts !== 1) {
    console.error(`[check] ❌ loader not redirecting mysql2/promise to mock (probe stats=${stats.inserts})`);
    process.exit(1);
  }
  console.log('[check] loader redirection probe OK');
} catch (e) {
  console.error('[check] ❌ probe failed:', e.message);
  process.exit(1);
}

try {
  await import(new URL('../seed.js', import.meta.url));
} catch (err) {
  console.error('\n[check] ❌ seed threw:', err);
  process.exit(1);
}

setTimeout(() => {
  console.log(`\n[check] executed SQL: ${stats.inserts} inserts, ${stats.updates} updates, ${stats.selects} selects → ${stats.rows} rows`);
  if (problems.length) {
    console.log(`[check] ❌ ${problems.length} SQL problem(s) found:`);
    const uniq = [...new Set(problems)];
    for (const p of uniq.slice(0, 60)) console.log('   -', p);
    if (uniq.length > 60) console.log(`   … and ${uniq.length - 60} more`);
    process.exit(1);
  }
  if (SCHEMA_ERRORS.length) process.exit(1);
  console.log('[check] ✅ All seed SQL validates against the schema.');
  process.exit(0);
}, 300);
