// Parse schema.sql into a structural model: tables, columns, enums, FKs, indexes.
import fs from 'node:fs';

export function parseSchema(path) {
  const sql = fs.readFileSync(path, 'utf8');
  // strip comments
  const clean = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tables = new Map();
  const errors = [];

  const createRe = /CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE/gi;
  let m;
  while ((m = createRe.exec(clean))) {
    const [, name, body] = m;
    const t = { name, columns: new Map(), fks: [], indexes: [] };
    const defs = splitTopLevel(body, ',').map((s) => s.trim()).filter(Boolean);
    for (const def of defs) {
      const head = def.split(/\s+/)[0].replace(/`/g, '');
      const upper = def.toUpperCase();
      if (/^(PRIMARY KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN KEY|CHECK)\b/.test(upper)) {
        // FK
        const fk = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+`?(\w+)`?\s*\(([^)]+)\)/i.exec(def);
        if (fk) {
          t.fks.push({
            cols: fk[1].split(',').map((c) => c.trim().replace(/`/g, '')),
            refTable: fk[2],
            refCols: fk[3].split(',').map((c) => c.trim().replace(/`/g, '')),
          });
          continue;
        }
        const idx = /^(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)?`?\s*\(([^)]+)\)/i.exec(def.trim());
        if (idx) {
          t.indexes.push(idx[2].split(',').map((c) => c.trim().replace(/`/g, '').split('(')[0]));
        } else if (/^PRIMARY KEY/i.test(def.trim())) {
          const pk = /\(([^)]+)\)/.exec(def);
          if (pk) t.indexes.push(pk[1].split(',').map((c) => c.trim().replace(/`/g, '')));
        }
        continue;
      }
      // column definition
      const colName = head;
      if (!/^\w+$/.test(colName)) { errors.push(`Weird column head in ${name}: ${def.slice(0, 50)}`); continue; }
      if (t.columns.has(colName)) errors.push(`Duplicate column ${name}.${colName}`);
      const enumM = /ENUM\s*\(([^)]*)\)/i.exec(def);
      t.columns.set(colName, {
        name: colName,
        nullable: !/NOT NULL/i.test(upper),
        hasDefault: /\bDEFAULT\b/i.test(upper),
        autoIncrement: /AUTO_INCREMENT/i.test(upper),
        generated: /GENERATED ALWAYS AS/i.test(upper),
        enum: enumM ? enumM[1].split(',').map((v) => v.trim().replace(/^'(.*)'$/s, '$1')) : null,
        def: def.slice(0, 200),
      });
    }
    tables.set(name, t);
  }

  // Cross-validate FKs and indexes
  for (const t of tables.values()) {
    for (const fk of t.fks) {
      const rt = tables.get(fk.refTable);
      if (!rt) { errors.push(`${t.name}: FK references missing table ${fk.refTable}`); continue; }
      for (const c of fk.cols) if (!t.columns.has(c)) errors.push(`${t.name}: FK column missing ${c}`);
      for (const rc of fk.refCols) if (!rt.columns.has(rc)) errors.push(`${t.name}: FK references missing column ${fk.refTable}.${rc}`);
      // referenced columns must be indexed (PK/unique/first col of an index)
      const ok = fk.refCols.every((rc) => {
        const col = rt.columns.get(rc);
        if (!col) return false;
        if (col.autoIncrement || /PRIMARY KEY/i.test(col.def)) return true;
        return rt.indexes.some((ix) => ix[0] === rc) || /UNIQUE/i.test(col.def);
      });
      if (!ok) errors.push(`${t.name}: FK references non-indexed ${fk.refTable}.(${fk.refCols.join(',')})`);
    }
    for (const ix of t.indexes) {
      for (const c of ix) if (!t.columns.has(c)) errors.push(`${t.name}: index on missing column ${c}`);
    }
  }
  return { tables, errors };
}

/** Split on a delimiter at paren depth 0, respecting quotes. */
export function splitTopLevel(text, delim) {
  const out = [];
  let depth = 0, cur = '', i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      const j = skipString(text, i, ch);
      cur += text.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === delim && depth === 0) { out.push(cur); cur = ''; i += 1; continue; }
    cur += ch; i += 1;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function skipString(text, i, quote) {
  i += 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Tokenize a VALUES tuple like (?, 'abc', NULL, 12.5) into element strings (paren-depth aware). */
export function tupleElements(tuple) {
  const inner = tuple.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let cur = '', i = 0, depth = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === "'") {
      const j = skipString(inner, i, "'");
      cur += inner.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; i += 1; continue; }
    cur += ch; i += 1;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}
