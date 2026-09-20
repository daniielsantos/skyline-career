/** Career store schema v14 — VA member route cut % (Freights/Demand/Charter). */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV13Ddl } from './career-store-v13.js';

export const CAREER_STORE_SCHEMA_V14 = '14';
export type SqliteDb = DatabaseSync;

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((r) => r.name === column);
}

export function ensureV14Ddl(db: SqliteDb): void {
  ensureV13Ddl(db);
  if (!columnExists(db, 'companies', 'member_route_cut_pct')) {
    db.exec(
      `ALTER TABLE companies ADD COLUMN member_route_cut_pct INTEGER NOT NULL DEFAULT 30`,
    );
  }
  if (!columnExists(db, 'company_state', 'va_line_crew_json')) {
    db.exec(`ALTER TABLE company_state ADD COLUMN va_line_crew_json TEXT`);
  }
}

export function migrateV13toV14IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV14Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 14) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV14Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
