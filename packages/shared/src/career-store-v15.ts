/** Career store schema v15 — VA flight quality stats (settle score rolling). */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV14Ddl } from './career-store-v14.js';

export const CAREER_STORE_SCHEMA_V15 = '15';
export type SqliteDb = DatabaseSync;

export function ensureV15Ddl(db: SqliteDb): void {
  ensureV14Ddl(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_flight_quality_stats (
      company_id TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      flights INTEGER NOT NULL DEFAULT 0,
      score_sum REAL NOT NULL DEFAULT 0,
      on_time INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, day_key),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS company_flight_quality_stats_day_idx
      ON company_flight_quality_stats(day_key);
  `);
}

export function migrateV14toV15IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV15Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 15) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV15Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
