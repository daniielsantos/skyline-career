/** Career store schema v18 — ledger.actor_account_id for VA Member column. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV17Ddl } from './career-store-v17.js';

export const CAREER_STORE_SCHEMA_V18 = '18';
export type SqliteDb = DatabaseSync;

function tableHasColumn(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV18Ddl(db: SqliteDb): void {
  ensureV17Ddl(db);
  if (!tableHasColumn(db, 'ledger', 'actor_account_id')) {
    db.exec(`ALTER TABLE ledger ADD COLUMN actor_account_id TEXT`);
  }
}

export function migrateV17toV18IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV18Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 18) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV18Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
