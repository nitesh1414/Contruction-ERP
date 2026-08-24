import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

/**
 * Shared MySQL connection pool (mysql2).
 * All queries MUST use parameterised statements — never string-concat user input.
 */
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  namedPlaceholders: false,
  decimalNumbers: true, // return DECIMAL as numbers (safe at our scales)
  dateStrings: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run a set of statements inside a transaction; receives a connection. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

export async function checkConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}
