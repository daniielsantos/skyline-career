/** Career store schema v10 — local Auth (accounts / sessions / company members). */

import type { DatabaseSync } from 'node:sqlite';

export const CAREER_STORE_SCHEMA_V10 = '10';
export type SqliteDb = DatabaseSync;

export function ensureV10Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      login_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS accounts_login_idx ON accounts(login_name);

    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      last_seen_at_ms INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS account_sessions_account_idx
      ON account_sessions(account_id);
    CREATE INDEX IF NOT EXISTS account_sessions_expires_idx
      ON account_sessions(expires_at_ms);

    CREATE TABLE IF NOT EXISTS company_members (
      company_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (company_id, account_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS company_members_account_idx
      ON company_members(account_id);
  `);
}

export function migrateV9toV10IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV10Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 10) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV10Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
