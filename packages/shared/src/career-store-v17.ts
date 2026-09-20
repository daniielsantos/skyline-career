/** Career store schema v17 — one-time MP access keys for register. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV16Ddl } from './career-store-v16.js';

export const CAREER_STORE_SCHEMA_V17 = '17';
export type SqliteDb = DatabaseSync;

export function ensureV17Ddl(db: SqliteDb): void {
  ensureV16Ddl(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_keys (
      code_hash TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      claimed_by_account_id TEXT,
      claimed_at_ms INTEGER,
      revoked_at_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS access_keys_batch_idx
      ON access_keys(batch_id);
    CREATE INDEX IF NOT EXISTS access_keys_claimed_idx
      ON access_keys(claimed_by_account_id);
  `);
}

export function migrateV16toV17IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV17Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 17) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV17Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
