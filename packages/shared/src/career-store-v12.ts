/** Career store schema v12 — VA directory recruiting + join requests. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV11Ddl } from './career-store-v11.js';

export const CAREER_STORE_SCHEMA_V12 = '12';
export type SqliteDb = DatabaseSync;

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV12Ddl(db: SqliteDb): void {
  ensureV11Ddl(db);
  if (!columnExists(db, 'companies', 'recruiting')) {
    db.exec(
      `ALTER TABLE companies ADD COLUMN recruiting INTEGER NOT NULL DEFAULT 1`,
    );
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_join_requests (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at_ms INTEGER NOT NULL,
      decided_at_ms INTEGER,
      decided_by_account_id TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS company_join_requests_company_idx
      ON company_join_requests(company_id, status);
    CREATE INDEX IF NOT EXISTS company_join_requests_account_idx
      ON company_join_requests(account_id, status);
  `);
}

export function migrateV11toV12IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV12Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 12) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV12Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
