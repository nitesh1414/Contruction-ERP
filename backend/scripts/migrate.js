/**
 * Database migration runner.
 *   node scripts/migrate.js          # create database (if missing) + apply schema
 *   node scripts/migrate.js --drop   # DROP all tables first, then re-apply (DESTRUCTIVE)
 */
import mysql from 'mysql2/promise';
import fs from 'node:fs';
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
  multipleStatements: true,
};

const withDrop = process.argv.includes('--drop');

function splitStatements(sql) {
  // Simple statement splitter that respects MySQL DELIMITER-free DDL used in schema.sql
  const cleaned = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return cleaned
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ';');
}

async function main() {
  console.log(`[migrate] connecting to ${DB.host}:${DB.port} as ${DB.user}`);
  const admin = await mysql.createConnection({ ...DB, database: undefined, multipleStatements: true });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE \`${DB.database}\``);
  console.log(`[migrate] database "${DB.database}" ready`);

  if (withDrop) {
    console.log('[migrate] --drop: dropping existing tables & views');
    await admin.query('SET FOREIGN_KEY_CHECKS = 0');
    const [views] = await admin.query("SELECT TABLE_NAME AS t FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?", [DB.database]);
    for (const v of views) await admin.query(`DROP VIEW IF EXISTS \`${v.t}\``);
    const [tables] = await admin.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE='BASE TABLE'", [DB.database]);
    for (const t of tables) await admin.query(`DROP TABLE IF EXISTS \`${t.t}\``);
    await admin.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`[migrate] dropped ${tables.length} tables`);
  }

  const schemaPath = path.resolve(__dirname, '../database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitStatements(schema);
  console.log(`[migrate] applying ${statements.length} statements from database/schema.sql`);

  let applied = 0;
  for (const stmt of statements) {
    try {
      await admin.query(stmt);
      applied += 1;
    } catch (err) {
      console.error(`\n[migrate] FAILED on statement:\n${stmt.slice(0, 300)}...\nError: ${err.message}`);
      await admin.end();
      process.exit(1);
    }
  }
  console.log(`[migrate] done — ${applied} statements applied`);
  await admin.end();
}

main().catch((err) => {
  console.error('[migrate] fatal:', err.message);
  process.exit(1);
});
