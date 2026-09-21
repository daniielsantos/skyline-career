/** Career store schema v19 — VA member airline-labor cut %. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV18Ddl } from './career-store-v18.js';

export const CAREER_STORE_SCHEMA_V19 = '19';
export type SqliteDb = DatabaseSync;

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV19Ddl(db: SqliteDb): void {
  ensureV18Ddl(db);
  if (!columnExists(db, 'companies', 'member_airline_cut_pct')) {
    db.exec(
      `ALTER TABLE companies ADD COLUMN member_airline_cut_pct INTEGER NOT NULL DEFAULT 50`,
    );
  }
}

export function migrateV18toV19IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV19Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 19) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV19Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
