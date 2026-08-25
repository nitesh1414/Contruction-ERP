// Mock replacement for `mysql2/promise` that validates seed SQL against the parsed schema
// and keeps an in-memory store so dependent SELECTs resolve.
import { parseSchema, splitTopLevel, tupleElements } from './schema-parse.mjs';

const SCHEMA_PATH = process.env.SCHEMA_PATH || new URL('../../database/schema.sql', import.meta.url).pathname;
export const { tables: SCHEMA, errors: SCHEMA_ERRORS } = parseSchema(SCHEMA_PATH);

export const problems = [];
export const stats = { inserts: 0, updates: 0, selects: 0, rows: 0 };

const store = new Map(); // table -> rows[]
const autoId = new Map(); // table -> next id

function rowsOf(table) {
  if (!store.has(table)) store.set(table, []);
  return store.get(table);
}

function fail(msg) {
  problems.push(msg);
}

function countPlaceholders(sql) {
  let n = 0, i = 0, inStr = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === inStr) inStr = null;
    } else if (ch === "'" || ch === '"') inStr = ch;
    else if (ch === '?') n += 1;
    i += 1;
  }
  return n;
}

function validateParams(sql, params) {
  const expected = countPlaceholders(sql);
  const got = (params || []).length;
  if (expected !== got) {
    fail(`Placeholder mismatch (${expected} ? vs ${got} params): ${sql.slice(0, 110)}`);
    return false;
  }
  return true;
}

function colCheck(table, cols, sql) {
  const t = SCHEMA.get(table);
  if (!t) { fail(`INSERT/UPDATE into unknown table "${table}": ${sql.slice(0, 90)}`); return null; }
  for (const c of cols) {
    if (!t.columns.has(c)) fail(`${table}: unknown column "${c}" :: ${sql.slice(0, 90)}`);
  }
  const seen = new Set();
  for (const c of cols) {
    if (seen.has(c)) fail(`${table}: column "${c}" listed twice`);
    seen.add(c);
    const meta = t.columns.get(c);
    if (meta?.generated) fail(`${table}: writing generated column "${c}"`);
  }
  return t;
}

function notNullCheck(table, t, cols, sql) {
  for (const [name, meta] of t.columns) {
    if (!meta.nullable && !meta.hasDefault && !meta.autoIncrement && !meta.generated && !cols.includes(name)) {
      fail(`${table}: NOT NULL column "${name}" has no default and is not inserted :: ${sql.slice(0, 90)}`);
    }
  }
}

function enumCheck(table, t, cols, elements, paramsRef, sql) {
  for (let i = 0; i < cols.length && i < elements.length; i += 1) {
    const meta = t.columns.get(cols[i]);
    if (!meta?.enum) continue;
    let val;
    if (elements[i] === '?') {
      val = paramsRef.shift();
    } else if (/^'.*'$/s.test(elements[i])) {
      val = elements[i].slice(1, -1).replace(/''/g, "'");
    } else if (/^(null)$/i.test(elements[i])) {
      val = null;
    } else {
      continue; // numeric / expression — skip
    }
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && !meta.enum.includes(val)) {
      fail(`${table}.${cols[i]}: value "${val}" not in ENUM (${meta.enum.join('|')}) :: ${sql.slice(0, 80)}`);
    }
  }
  return paramsRef;
}

function handleInsert(sql, params) {
  const m = /INSERT INTO\s+`?(\w+)`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*)$/i.exec(sql.trim());
  if (!m) { fail(`Unparseable INSERT: ${sql.slice(0, 110)}`); return null; }
  const [, table, colList, valuesPart] = m;
  const cols = colList.split(',').map((c) => c.trim().replace(/`/g, ''));
  const t = colCheck(table, cols, sql);
  if (!t) return null;

  // parse tuples (..),(..),..
  const tuples = [];
  let depth = 0, start = -1;
  for (let i = 0; i < valuesPart.length; i += 1) {
    const ch = valuesPart[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < valuesPart.length) {
        if (valuesPart[j] === '\\') { j += 2; continue; }
        if (valuesPart[j] === ch) break;
        j += 1;
      }
      i = j;
      continue;
    }
    if (ch === '(') { if (depth === 0) start = i + 1; depth += 1; }
    else if (ch === ')') { depth -= 1; if (depth === 0) tuples.push(valuesPart.slice(start, i)); }
  }
  if (!tuples.length) { fail(`INSERT has no tuples: ${sql.slice(0, 90)}`); return null; }

  notNullCheck(table, t, cols, sql);
  const ids = [];
  let firstId = autoId.get(table) || 1;
  let paramIdx = 0;
  for (const tpl of tuples) {
    const elements = tupleElements(`(${tpl})`);
    if (elements.length !== cols.length) {
      fail(`${table}: tuple arity ${elements.length} != ${cols.length} cols :: (${tpl.slice(0, 70)}) :: ${sql.slice(0, 70)}`);
    }
    const row = {};
    for (let i = 0; i < cols.length; i += 1) {
      const el = elements[i];
      let val;
      if (el === '?') { val = (params || [])[paramIdx]; paramIdx += 1; }
      else if ((el || '').includes('?')) {
        // SQL expression containing placeholders (e.g. DATE_SUB(CURDATE(), INTERVAL ? DAY))
        paramIdx += countPlaceholders(el);
        val = undefined; // cannot attribute a single value — skip literal checks
      } else if (/^'.*'$/s.test(el || '')) val = el.slice(1, -1);
      else if (/^-?\d+(\.\d+)?$/.test(el || '')) val = Number(el);
      else if (/^(null)$/i.test(el || '')) val = null;
      else val = el; // SQL expression / function — keep raw

      const meta = t.columns.get(cols[i]);
      if (meta?.enum && typeof val === 'string' && val !== '' && !meta.enum.includes(val)) {
        fail(`${table}.${cols[i]}: value "${val}" not in ENUM (${meta.enum.join('|')}) :: ${sql.slice(0, 80)}`);
      }
      row[cols[i]] = val;
    }
    const id = firstId;
    row.id = id;
    ids.push(id);
    rowsOf(table).push(row);
    firstId += 1;
    stats.rows += 1;
  }
  autoId.set(table, firstId);
  stats.inserts += 1;
  return { insertId: ids[0], affectedRows: ids.length };
}

function handleUpdate(sql, params) {
  const m = /UPDATE\s+`?(\w+)`?\s+SET\s+([\s\S]+?)\s+WHERE\s/i.exec(sql.trim());
  if (!m) return;
  const [, table, setPart] = m;
  const t = SCHEMA.get(table);
  if (!t) { fail(`UPDATE unknown table ${table}`); return; }
  for (const assign of splitTopLevel(setPart, ',')) {
    const col = assign.split('=')[0].trim().replace(/`/g, '');
    if (!t.columns.has(col)) fail(`${table}: UPDATE unknown column "${col}" :: ${sql.slice(0, 80)}`);
    const meta = t.columns.get(col);
    if (meta?.enum) {
      const valM = /=\s*'([^']*)'/.exec(assign);
      if (valM && !meta.enum.includes(valM[1])) fail(`${table}.${col}: UPDATE value "${valM[1]}" not in ENUM`);
    }
  }
  stats.updates += 1;
}

async function query(sql, params) {
  const s = String(sql).trim();
  const upper = s.toUpperCase();

  // reads the seed depends on
  if (/^SELECT COUNT\(\*\) AS c FROM users/i.test(s)) {
    stats.selects += 1;
    return [[{ c: rowsOf('users').length }], []];
  }
  if (/^SELECT id, code FROM permissions/i.test(s)) {
    stats.selects += 1;
    return [rowsOf('permissions').map((r) => ({ id: r.id, code: r.code })), []];
  }
  if (/^SELECT id, wing_id, floor_id, price FROM units WHERE project_id = \? AND unit_number IN/i.test(s)) {
    stats.selects += 1;
    const [projectId, ...nums] = params;
    return [rowsOf('units').filter((r) => r.project_id === projectId && nums.includes(r.unit_number))
      .map((r) => ({ id: r.id, wing_id: r.wing_id, floor_id: r.floor_id, price: r.price })) , []];
  }
  if (upper.startsWith('SHOW FULL TABLES')) return [[], []];
  if (upper.startsWith('SET ') || upper.startsWith('TRUNCATE')) return [[], []];

  if (!validateParams(s, params || [])) return [{}, []];

  if (upper.startsWith('INSERT')) {
    const res = handleInsert(s, params || []);
    return [res || { insertId: 0, affectedRows: 0 }, []];
  }
  if (upper.startsWith('UPDATE')) {
    handleUpdate(s, params || []);
    return [{ affectedRows: 1 }, []];
  }
  if (upper.startsWith('SELECT')) {
    fail(`Unexpected SELECT in seed (mock doesn't serve it): ${s.slice(0, 100)}`);
    return [[], []];
  }
  fail(`Unhandled statement type: ${s.slice(0, 90)}`);
  return [[], []];
}

export function createConnection() {
  return Promise.resolve({
    query,
    execute: query,
    end: () => Promise.resolve(),
  });
}

export default { createConnection };
