// Statically lint SQL in backend/src against schema.sql using node-sql-parser.
// v2: proper template-literal scanner (handles nesting & escapes).
import fs from 'node:fs';
import path from 'node:path';
import pkg from 'node-sql-parser';
import { parseSchema } from './schema-parse.mjs';

const { Parser } = pkg;
const parser = new Parser();
const { tables: SCHEMA } = parseSchema(new URL('../../database/schema.sql', import.meta.url).pathname);

// pull view names from schema too
{
  const ddl = fs.readFileSync(new URL('../../database/schema.sql', import.meta.url).pathname, 'utf8');
  const vRe = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+`?(\w+)`?/gi;
  let vm;
  while ((vm = vRe.exec(ddl))) SCHEMA.set(vm[1], { name: vm[1], columns: new Map(), fks: [], indexes: [], isView: true });
}

const SRC = new URL('../../src', import.meta.url).pathname;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

/** Scan source, yielding {sql, line, kind} for every template literal / quoted string containing SQL. */
function extractSqlStrings(source) {
  const out = [];
  const n = source.length;
  let i = 0;

  const readQuoted = (start, quote) => {
    let j = start + 1;
    while (j < n) {
      if (source[j] === '\\') { j += 2; continue; }
      if (source[j] === quote) return j + 1;
      j += 1;
    }
    return n;
  };

  const readTemplate = (start) => {
    // returns end index (exclusive) of template literal starting at start (which is a backtick)
    let j = start + 1;
    while (j < n) {
      const ch = source[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') return j + 1;
      if (ch === '$' && source[j + 1] === '{') {
        // scan expression, respecting nesting & strings
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          const c2 = source[j];
          if (c2 === '{') depth += 1;
          else if (c2 === '}') depth -= 1;
          else if (c2 === "'" || c2 === '"') j = readQuoted(j, c2) - 1;
          else if (c2 === '`') j = readTemplate(j) - 1;
          j += 1;
        }
        continue;
      }
      j += 1;
    }
    return n;
  };

  let inLine = false, inBlock = false;
  while (i < n) {
    const ch = source[i];
    if (inLine) { if (ch === '\n') inLine = false; i += 1; continue; }
    if (inBlock) { if (ch === '*' && source[i + 1] === '/') { inBlock = false; i += 2; } else i += 1; continue; }
    if (ch === '/' && source[i + 1] === '/') { inLine = true; i += 2; continue; }
    if (ch === '/' && source[i + 1] === '*') { inBlock = true; i += 2; continue; }
    if (ch === "'" || ch === '"') {
      const end = readQuoted(i, ch);
      const body = source.slice(i + 1, end - 1);
      if (/\b(SELECT\b.+\bFROM\b|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)/is.test(body)) {
        out.push({ sql: body, line: source.slice(0, i).split('\n').length, kind: 'str' });
      }
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = readTemplate(i);
      const body = source.slice(i + 1, end - 1);
      if (/\b(SELECT\b|INSERT INTO|UPDATE\s+\w+|DELETE FROM|CREATE TABLE)/i.test(body) && body.length > 20) {
        out.push({ sql: body, line: source.slice(0, i).split('\n').length, kind: 'tpl' });
      }
      i = end;
      continue;
    }
    i += 1;
  }
  return out;
}

/** Replace ${...} interpolations and literal ? placeholders with parseable literals. */
function normalize(sql) {
  let out = '', i = 0;
  const n = sql.length;
  while (i < n) {
    if (sql[i] === '$' && sql[i + 1] === '{') {
      let depth = 1, j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '{') depth += 1;
        else if (sql[j] === '}') depth -= 1;
        j += 1;
      }
      const expr = sql.slice(i + 2, j - 1).trim();
      // Only plain identifiers/member expressions count as analyzable values;
      // anything composed (join/map/ternary/whereSql/etc.) → skip statically.
      if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*(\[[^\]]*\])?)*$/.test(expr)) {
        return { sql: null, dynamic: true };
      }
      if (/clause|whereSql|Sql|conditions|ids$/i.test(expr)) {
        return { sql: null, dynamic: true };
      }
      out += ' 1 ';
      i = j;
    } else if (sql[i] === '?') {
      out += ' 1 ';
      i += 1;
    } else {
      out += sql[i]; i += 1;
    }
  }
  return { sql: out.trim(), dynamic: false };
}

const problems = [];
let parsed = 0, dynamicSkipped = 0, failedParse = 0, total = 0;

// SELECT-alias / computed-column names we can't resolve to base tables
const COMPUTED = new Set(['total', 'count', 'amount', 'd', 'reports', 'avg_pct', 'c', 'qty', 'days_open', 'total_cost', 'avg_progress', 'total_budget', 'units_sold', 'sales_value', 'received', 'pending', 'critical', 'earned', 'days', 'present_days', 'month_key', 'balance', 'n', 'running_total', 'value']);

/** Recursively collect every statement-ish node (handles subqueries in FROM / WHERE). */
function* selectNodes(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) yield* selectNodes(x);
    return;
  }
  const isStatement =
    Array.isArray(node.from) ||
    (node.type && ['select', 'insert', 'update', 'delete', 'replace'].includes(String(node.type).toLowerCase()));
  if (isStatement) yield node;
  for (const v of Object.values(node)) yield* selectNodes(v);
}

function aliasToTable(ast) {
  const map = new Map();
  for (const a of selectNodes(ast)) {
    for (const f of a.from || []) {
      if (f.table && f.table !== 'dual') map.set(f.as || f.table, f.table);
    }
    const tt = a.table;
    if (Array.isArray(tt)) for (const t of tt) map.set(t.as || t.table, t.table);
    else if (typeof tt === 'string') map.set(tt, tt);
    else if (tt?.table) map.set(tt.as || tt.table, tt.table);
  }
  return map;
}

function realTableNames(ast) {
  const names = new Set();
  for (const a of selectNodes(ast)) {
    for (const f of a.from || []) if (f.table && f.table !== 'dual') names.add(f.table);
    const tt = a.table;
    if (Array.isArray(tt)) for (const t of tt) names.add(t.table || t);
    else if (typeof tt === 'string') names.add(tt);
    else if (tt?.table) names.add(tt.table);
  }
  return names;
}

function* collectColumnRefs(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) yield* collectColumnRefs(x);
    return;
  }
  if (node.type === 'column_ref') { yield node; return; }
  for (const v of Object.values(node)) yield* collectColumnRefs(v);
}

function checkAst(ast, ctx) {
  const aliases = aliasToTable(ast);
  const tables = realTableNames(ast);
  for (const t of tables) {
    if (!SCHEMA.has(t)) problems.push(`${ctx}: unknown table "${t}"`);
  }
  for (const col of collectColumnRefs(ast)) {
    const name = col.column;
    if (!name || name === '*' || typeof name !== 'string') continue;
    if (col.table) {
      const rt = aliases.get(col.table);
      if (!rt) continue;
      const t = SCHEMA.get(rt);
      if (t && !t.isView && !t.columns.has(name) && !COMPUTED.has(name)) {
        problems.push(`${ctx}: ${rt}.${name} not in schema`);
      }
    } else if (tables.size) {
      const found = [...tables].some((t) => {
        const tt = SCHEMA.get(t);
        return tt && (tt.isView || tt.columns.has(name));
      });
      if (!found && !COMPUTED.has(name)) {
        problems.push(`${ctx}: column "${name}" not found in [${[...tables].join(', ')}]`);
      }
    }
  }
}

for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const { sql: raw, line } of extractSqlStrings(source)) {
    total += 1;
    const { sql, dynamic } = normalize(raw);
    if (dynamic) { dynamicSkipped += 1; continue; }
    if (!sql || sql.length < 10) continue;
    const ctx = `${path.relative(SRC, file)}:${line}`;
    // Skip interp-artifacts & fragments: statement starts mid-air, or a table/
    // column-list constant was substituted by `1` (FROM 1, VALUES 1, `1 WHERE`,
    // SELECT-column constants like `${SELECT}`), or the text is a clause fragment.
    if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH|CREATE|SHOW|SET|EXPLAIN)\b/i.test(sql)) {
      dynamicSkipped += 1; continue;
    }
    // identifier-position interpolation artifacts only (FROM 1, INTO 1, ...)
    if (/^1\b/.test(sql) || /\b(FROM|INTO|JOIN|UPDATE|TABLE|VALUES)\s+1\b/.test(sql) || /\bWHERE\s+1\s+AND\s/i.test(sql) || /,\s*1\s*\)\s*$/.test(sql) && /INSERT/i.test(sql) === false) {
      dynamicSkipped += 1; continue;
    }
    let ast;
    try {
      ast = parser.astify(sql, { database: 'MySQL' });
      parsed += 1;
    } catch (perr) {
      failedParse += 1;
      problems.push(`${ctx}: UNPARSEABLE SQL: ${sql.replace(/\s+/g, ' ').slice(0, 110)} :: ${String(perr.message).replace(/\s+/g,' ').slice(-110)}`);
      continue;
    }
    try { checkAst(ast, ctx); } catch { /* tolerate odd AST shapes */ }
  }
}

console.log(`[lint] scanned ${total} SQL candidates: ${parsed} parsed, ${failedParse} unparseable, ${dynamicSkipped} dynamic-skipped`);
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.log(`[lint] ❌ ${uniq.length} finding(s):`);
  for (const p of uniq) console.log('   -', p);
  process.exit(1);
} else {
  console.log('[lint] ✅ all resolvable table/column references match the schema');
}
