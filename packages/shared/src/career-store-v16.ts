/** Career store schema v16 — VA hangar aircraft reservation columns. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV15Ddl } from './career-store-v15.js';

export const CAREER_STORE_SCHEMA_V16 = '16';
export type SqliteDb = DatabaseSync;

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV16Ddl(db: SqliteDb): void {
  ensureV15Ddl(db);
  if (!columnExists(db, 'fleet_aircraft', 'reserved_by_account_id')) {
    db.exec(
      `ALTER TABLE fleet_aircraft ADD COLUMN reserved_by_account_id TEXT`,
    );
  }
  if (!columnExists(db, 'fleet_aircraft', 'reserved_at_ms')) {
    db.exec(`ALTER TABLE fleet_aircraft ADD COLUMN reserved_at_ms INTEGER`);
  }
}

export function migrateV15toV16IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV16Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 16) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV16Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
