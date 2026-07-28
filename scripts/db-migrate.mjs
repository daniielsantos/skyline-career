#!/usr/bin/env node
/**
 * Apply database/migrations/001_initial.sql (fresh DB).
 * Requires DATABASE_URL.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://skyline:skyline@localhost:5432/skyline';

async function main() {
  const sqlPath = join(root, 'database', 'migrations', '001_initial.sql');
  const sql = await readFile(sqlPath, 'utf8');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`[db-migrate] applying ${sqlPath}`);
    await client.query(sql);
    console.log('[db-migrate] OK');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db-migrate] FAILED', err instanceof Error ? err.message || String(err) : err);
  process.exit(1);
});
