/**
 * One-time product access keys for MP world register.
 * Plaintext is shown once at mint; only sha256(normalized) is stored.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ensureV17Ddl } from './career-store-v17.js';

type SqliteDb = DatabaseSync;

/** Crockford base32 (no I L O U) — easy to type / read aloud. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type AccessKeyErrorCode =
  | 'access_key_invalid'
  | 'access_key_used'
  | 'access_key_revoked';

export class AccessKeyError extends Error {
  readonly code: AccessKeyErrorCode;

  constructor(code: AccessKeyErrorCode) {
    super(code);
    this.name = 'AccessKeyError';
    this.code = code;
  }
}

export type MintedAccessKey = {
  key: string;
  batchId: string;
  createdAtMs: number;
};

/** Strip dashes/spaces; uppercase Crockford (map ambiguous glyphs). */
export function normalizeAccessKey(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return cleaned
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

export function formatAccessKeyDisplay(normalized: string): string {
  const n = normalizeAccessKey(normalized);
  const parts: string[] = [];
  for (let i = 0; i < n.length; i += 4) {
    parts.push(n.slice(i, i + 4));
  }
  return parts.join('-');
}

export function hashAccessKey(raw: string): string {
  const normalized = normalizeAccessKey(raw);
  if (normalized.length < 12) {
    throw new AccessKeyError('access_key_invalid');
  }
  return createHash('sha256').update(`skyline-access-key:v1:${normalized}`).digest('hex');
}

/** 16 Crockford chars → XXXX-XXXX-XXXX-XXXX. */
export function generateAccessKeyPlaintext(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += CROCKFORD[bytes[i]! % CROCKFORD.length]!;
  }
  return formatAccessKeyDisplay(out);
}

export function mintAccessKeysSqlite(
  db: SqliteDb,
  opts: { count: number; batchId?: string; nowMs?: number },
): MintedAccessKey[] {
  ensureV17Ddl(db);
  const count = Math.floor(opts.count);
  if (!Number.isFinite(count) || count < 1 || count > 10_000) {
    throw new Error('mint count must be 1..10000');
  }
  const now = opts.nowMs ?? Date.now();
  const batchId =
    opts.batchId?.trim() ||
    `batch_${new Date(now).toISOString().slice(0, 10)}_${randomBytes(3).toString('hex')}`;
  const minted: MintedAccessKey[] = [];
  const insert = db.prepare(
    `INSERT INTO access_keys (code_hash, batch_id, created_at_ms)
     VALUES (?, ?, ?)`,
  );
  const exists = db.prepare(
    `SELECT 1 AS ok FROM access_keys WHERE code_hash = ?`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < count; i++) {
      let plaintext = '';
      let hash = '';
      for (let attempt = 0; attempt < 32; attempt++) {
        plaintext = generateAccessKeyPlaintext();
        hash = hashAccessKey(plaintext);
        if (!exists.get(hash)) break;
        hash = '';
      }
      if (!hash) throw new Error('failed to mint unique access key');
      insert.run(hash, batchId, now);
      minted.push({ key: plaintext, batchId, createdAtMs: now });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return minted;
}

/**
 * Atomically claim an unused key for accountId.
 * Call inside the same transaction as account create when possible.
 */
export function claimAccessKeySqlite(
  db: SqliteDb,
  opts: { code: string; accountId: string; nowMs?: number },
): void {
  ensureV17Ddl(db);
  const accountId = opts.accountId.trim();
  if (!accountId) throw new AccessKeyError('access_key_invalid');
  let hash: string;
  try {
    hash = hashAccessKey(opts.code);
  } catch (err) {
    if (err instanceof AccessKeyError) throw err;
    throw new AccessKeyError('access_key_invalid');
  }
  const now = opts.nowMs ?? Date.now();
  const row = db
    .prepare(
      `SELECT claimed_by_account_id AS claimed, revoked_at_ms AS revoked
       FROM access_keys WHERE code_hash = ?`,
    )
    .get(hash) as { claimed: string | null; revoked: number | null } | undefined;
  if (!row) throw new AccessKeyError('access_key_invalid');
  if (row.revoked != null) throw new AccessKeyError('access_key_revoked');
  if (row.claimed) throw new AccessKeyError('access_key_used');
  const result = db
    .prepare(
      `UPDATE access_keys
       SET claimed_by_account_id = ?, claimed_at_ms = ?
       WHERE code_hash = ?
         AND claimed_by_account_id IS NULL
         AND revoked_at_ms IS NULL`,
    )
    .run(accountId, now, hash);
  if (result.changes !== 1) throw new AccessKeyError('access_key_used');
}

export function revokeAccessKeySqlite(
  db: SqliteDb,
  opts: { code: string; nowMs?: number },
): boolean {
  ensureV17Ddl(db);
  let hash: string;
  try {
    hash = hashAccessKey(opts.code);
  } catch {
    return false;
  }
  const now = opts.nowMs ?? Date.now();
  const result = db
    .prepare(
      `UPDATE access_keys
       SET revoked_at_ms = ?
       WHERE code_hash = ? AND revoked_at_ms IS NULL`,
    )
    .run(now, hash);
  return result.changes === 1;
}

type PgQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: unknown[]; rowCount: number | null }>;

export async function claimAccessKeyPg(
  query: PgQuery,
  opts: { code: string; accountId: string; nowMs?: number },
): Promise<void> {
  const accountId = opts.accountId.trim();
  if (!accountId) throw new AccessKeyError('access_key_invalid');
  let hash: string;
  try {
    hash = hashAccessKey(opts.code);
  } catch (err) {
    if (err instanceof AccessKeyError) throw err;
    throw new AccessKeyError('access_key_invalid');
  }
  const now = opts.nowMs ?? Date.now();
  const found = await query(
    `SELECT claimed_by_account_id AS claimed, revoked_at_ms AS revoked
     FROM access_keys WHERE code_hash = $1`,
    [hash],
  );
  const row = found.rows[0] as
    | { claimed: string | null; revoked: string | number | null }
    | undefined;
  if (!row) throw new AccessKeyError('access_key_invalid');
  if (row.revoked != null) throw new AccessKeyError('access_key_revoked');
  if (row.claimed) throw new AccessKeyError('access_key_used');
  const updated = await query(
    `UPDATE access_keys
     SET claimed_by_account_id = $1, claimed_at_ms = $2
     WHERE code_hash = $3
       AND claimed_by_account_id IS NULL
       AND revoked_at_ms IS NULL`,
    [accountId, now, hash],
  );
  if ((updated.rowCount ?? 0) !== 1) throw new AccessKeyError('access_key_used');
}

export async function mintAccessKeysPg(
  query: PgQuery,
  opts: { count: number; batchId?: string; nowMs?: number },
): Promise<MintedAccessKey[]> {
  const count = Math.floor(opts.count);
  if (!Number.isFinite(count) || count < 1 || count > 10_000) {
    throw new Error('mint count must be 1..10000');
  }
  const now = opts.nowMs ?? Date.now();
  const batchId =
    opts.batchId?.trim() ||
    `batch_${new Date(now).toISOString().slice(0, 10)}_${randomBytes(3).toString('hex')}`;
  const minted: MintedAccessKey[] = [];
  for (let i = 0; i < count; i++) {
    let plaintext = '';
    let hash = '';
    for (let attempt = 0; attempt < 32; attempt++) {
      plaintext = generateAccessKeyPlaintext();
      hash = hashAccessKey(plaintext);
      const exists = await query(
        `SELECT 1 AS ok FROM access_keys WHERE code_hash = $1`,
        [hash],
      );
      if (!exists.rows[0]) break;
      hash = '';
    }
    if (!hash) throw new Error('failed to mint unique access key');
    await query(
      `INSERT INTO access_keys (code_hash, batch_id, created_at_ms)
       VALUES ($1, $2, $3)`,
      [hash, batchId, now],
    );
    minted.push({ key: plaintext, batchId, createdAtMs: now });
  }
  return minted;
}

export async function revokeAccessKeyPg(
  query: PgQuery,
  opts: { code: string; nowMs?: number },
): Promise<boolean> {
  let hash: string;
  try {
    hash = hashAccessKey(opts.code);
  } catch {
    return false;
  }
  const now = opts.nowMs ?? Date.now();
  const result = await query(
    `UPDATE access_keys
     SET revoked_at_ms = $1
     WHERE code_hash = $2 AND revoked_at_ms IS NULL`,
    [now, hash],
  );
  return (result.rowCount ?? 0) === 1;
}
