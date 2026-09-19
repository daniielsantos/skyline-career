/** Career store schema v13 — explicit VA listing (company ≠ VA until published). */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV12Ddl } from './career-store-v12.js';

export const CAREER_STORE_SCHEMA_V13 = '13';
export type SqliteDb = DatabaseSync;

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV13Ddl(db: SqliteDb): void {
  ensureV12Ddl(db);
  if (!columnExists(db, 'companies', 'va_listed')) {
    db.exec(
      `ALTER TABLE companies ADD COLUMN va_listed INTEGER NOT NULL DEFAULT 0`,
    );
  }
}

export function migrateV12toV13IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV13Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 13) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV13Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
