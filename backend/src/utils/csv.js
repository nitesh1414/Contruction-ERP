/** Minimal, dependency-free CSV helpers (Excel-compatible). */

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (value instanceof Date) s = value.toISOString().slice(0, 19).replace('T', ' ');
  else s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * rows: array of objects; columns: [{ key, label }] (defaults to object keys).
 */
export function toCsv(rows, columns) {
  const cols = columns && columns.length
    ? columns
    : rows.length
      ? Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
      : [];
  const header = cols.map((c) => escapeCell(c.label)).join(',');
  const lines = rows.map((r) => cols.map((c) => escapeCell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return '﻿' + [header, ...lines].join('\r\n');
}

/** Send rows as a CSV download response. */
export function sendCsv(res, filename, rows, columns) {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
