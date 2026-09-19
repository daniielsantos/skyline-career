/** Career store schema v11 — VA invites + haul ranking stats. */

import type { DatabaseSync } from 'node:sqlite';
import { ensureV10Ddl } from './career-store-v10.js';

export const CAREER_STORE_SCHEMA_V11 = '11';
export type SqliteDb = DatabaseSync;

export function ensureV11Ddl(db: SqliteDb): void {
  ensureV10Ddl(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_invites (
      code TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      created_by_account_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pilot',
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 8,
      uses INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (created_by_account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS company_invites_company_idx
      ON company_invites(company_id);
    CREATE INDEX IF NOT EXISTS company_invites_expires_idx
      ON company_invites(expires_at_ms);

    CREATE TABLE IF NOT EXISTS company_haul_stats (
      company_id TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      hauls INTEGER NOT NULL DEFAULT 0,
      nm REAL NOT NULL DEFAULT 0,
      pay_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, day_key),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS company_haul_stats_day_idx
      ON company_haul_stats(day_key);

    CREATE TABLE IF NOT EXISTS company_pilot_haul_stats (
      company_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      hauls INTEGER NOT NULL DEFAULT 0,
      nm REAL NOT NULL DEFAULT 0,
      pay_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, account_id, day_key),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS company_pilot_haul_stats_day_idx
      ON company_pilot_haul_stats(company_id, day_key);
  `);
}

export function migrateV10toV11IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV11Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 11) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV11Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
