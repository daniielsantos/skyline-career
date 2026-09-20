/**
 * Local Auth mold — account → session → company membership.
 * OAuth providers later plug into the same membership table.
 * Callers supply SqliteDb; CAREER_AUTH enforcement lives in the API layer.
 */

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { SqliteDb } from './career-store-v3.js';
import { ensureCompany, type CareerCompanyRow } from './career-companies.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import { ensureV10Ddl } from './career-store-v10.js';
import { claimAccessKeySqlite } from './career-access-keys.js';

export type CareerAccountRole = 'owner' | 'dispatcher' | 'pilot';

export type CareerAccount = {
  id: string;
  loginName: string;
  displayName: string;
  createdAtMs: number;
};

export type CareerAccountSession = {
  token: string;
  accountId: string;
  expiresAtMs: number;
};

export type CareerCompanyMember = {
  companyId: string;
  accountId: string;
  role: CareerAccountRole;
  createdAtMs: number;
};

export type AuthSessionContext = {
  account: CareerAccount;
  companies: CareerCompanyRow[];
  memberships: CareerCompanyMember[];
};

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
/** 30 days */
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** last_seen within this window → treated as online for /api/auth/sessions */
export const AUTH_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type AuthSessionListItem = {
  accountId: string;
  loginName: string;
  displayName: string;
  createdAtMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number;
  online: boolean;
  /** Short prefix of token_hash for Adminer correlation (not the Bearer). */
  tokenHashPrefix: string;
};

function normalizeLoginName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(trimmed)) {
    throw new Error('login name must be 3–32 chars [a-z0-9_]');
  }
  return trimmed;
}

function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 48) {
    throw new Error('display name must be 2–48 characters');
  }
  return trimmed;
}

function normalizePassword(raw: string): string {
  if (raw.length < 6 || raw.length > 128) {
    throw new Error('password must be 6–128 characters');
  }
  return raw;
}

function normalizeRole(raw: string | undefined): CareerAccountRole {
  const role = (raw ?? 'owner').trim().toLowerCase();
  if (role === 'owner' || role === 'dispatcher' || role === 'pilot') return role;
  throw new Error('role must be owner|dispatcher|pilot');
}

function suggestAccountId(): string {
  return `acc_${randomBytes(6).toString('hex')}`;
}

function suggestCompanyIdFromLogin(loginName: string): string {
  const base = `co_${loginName}`.slice(0, 48);
  return base.replace(/[^a-z0-9_-]/gi, '_');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isFinite(n) && n > 0)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function mintSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

function rowToAccount(row: {
  id: string;
  login_name: string;
  display_name: string;
  created_at_ms: number;
}): CareerAccount {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    createdAtMs: row.created_at_ms,
  };
}

export function getAccountById(db: SqliteDb, accountId: string): CareerAccount | null {
  ensureV10Ddl(db);
  const row = db
    .prepare(
      `SELECT id, login_name, display_name, created_at_ms FROM accounts WHERE id = ?`,
    )
    .get(accountId) as
    | {
        id: string;
        login_name: string;
        display_name: string;
        created_at_ms: number;
      }
    | undefined;
  return row ? rowToAccount(row) : null;
}

export function getAccountByLogin(
  db: SqliteDb,
  loginName: string,
): (CareerAccount & { passwordHash: string }) | null {
  ensureV10Ddl(db);
  const normalized = normalizeLoginName(loginName);
  const row = db
    .prepare(
      `SELECT id, login_name, display_name, password_hash, created_at_ms
       FROM accounts WHERE login_name = ?`,
    )
    .get(normalized) as
    | {
        id: string;
        login_name: string;
        display_name: string;
        password_hash: string;
        created_at_ms: number;
      }
    | undefined;
  if (!row) return null;
  return { ...rowToAccount(row), passwordHash: row.password_hash };
}

export type RegisterAccountOpts = {
  loginName: string;
  displayName: string;
  password: string;
  /** Create + claim a new company for this account (default true). */
  createCompany?: boolean;
  companyId?: string;
  companyDisplayName?: string;
  worldId?: string;
  homeHubIcao?: string;
  homeCountryId?: string;
  /**
   * Claim an existing company that has zero members (lab migration / orphan tenants).
   * Ignored when createCompany creates a fresh id.
   */
  claimCompanyId?: string;
  /**
   * One-time product key (MP access keys). Claimed in the same SQLite
   * transaction as account create when set.
   */
  accessKeyCode?: string;
  nowMs?: number;
  sessionTtlMs?: number;
};

export type RegisterAccountResult = {
  account: CareerAccount;
  session: CareerAccountSession;
  company: CareerCompanyRow | null;
};

export function registerAccount(
  db: SqliteDb,
  opts: RegisterAccountOpts,
): RegisterAccountResult {
  ensureV10Ddl(db);
  const accessKey = opts.accessKeyCode?.trim();
  const run = (): RegisterAccountResult => {
    const loginName = normalizeLoginName(opts.loginName);
    const displayName = normalizeDisplayName(opts.displayName);
    const password = normalizePassword(opts.password);
    const now = opts.nowMs ?? Date.now();
    const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;

    if (getAccountByLogin(db, loginName)) {
      throw new Error('login name already taken');
    }

    const accountId = suggestAccountId();
    if (accessKey) {
      claimAccessKeySqlite(db, { code: accessKey, accountId, nowMs: now });
    }

    db.prepare(
      `INSERT INTO accounts (id, login_name, display_name, password_hash, created_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(accountId, loginName, displayName, hashPassword(password), now);

    const account = getAccountById(db, accountId)!;
    let company: CareerCompanyRow | null = null;

    const wantCreate = opts.createCompany !== false;
    if (wantCreate) {
      const companyId =
        opts.companyId?.trim() || suggestCompanyIdFromLogin(loginName);
      company = ensureCompany(db, {
        id: companyId,
        worldId,
        displayName: opts.companyDisplayName?.trim() || displayName,
        homeHubIcao: opts.homeHubIcao,
        homeCountryId: opts.homeCountryId,
      });
      addCompanyMember(db, {
        companyId: company.id,
        accountId,
        role: 'owner',
        nowMs: now,
      });
    } else if (opts.claimCompanyId?.trim()) {
      company = claimOrphanCompany(db, {
        companyId: opts.claimCompanyId.trim(),
        accountId,
        nowMs: now,
      });
    }

    const session = createSession(db, {
      accountId,
      nowMs: now,
      ttlMs: opts.sessionTtlMs,
    });
    return { account, session, company };
  };

  if (accessKey) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw error;
    }
  }
  return run();
}

export type LoginAccountOpts = {
  loginName: string;
  password: string;
  nowMs?: number;
  sessionTtlMs?: number;
};

export function loginAccount(
  db: SqliteDb,
  opts: LoginAccountOpts,
): { account: CareerAccount; session: CareerAccountSession } {
  ensureV10Ddl(db);
  const row = getAccountByLogin(db, opts.loginName);
  if (!row || !verifyPassword(opts.password, row.passwordHash)) {
    throw new Error('invalid login or password');
  }
  const now = opts.nowMs ?? Date.now();
  const session = createSession(db, {
    accountId: row.id,
    nowMs: now,
    ttlMs: opts.sessionTtlMs,
  });
  return {
    account: {
      id: row.id,
      loginName: row.loginName,
      displayName: row.displayName,
      createdAtMs: row.createdAtMs,
    },
    session,
  };
}

export function createSession(
  db: SqliteDb,
  opts: { accountId: string; nowMs?: number; ttlMs?: number },
): CareerAccountSession {
  ensureV10Ddl(db);
  const now = opts.nowMs ?? Date.now();
  const ttl = opts.ttlMs ?? AUTH_SESSION_TTL_MS;
  purgeExpiredSessions(db, now);
  // One live Bearer per account — new login kicks previous clients.
  revokeAllSessionsForAccount(db, opts.accountId);
  const token = mintSessionToken();
  const expiresAtMs = now + ttl;
  db.prepare(
    `INSERT INTO account_sessions
       (token_hash, account_id, created_at_ms, expires_at_ms, last_seen_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(hashSessionToken(token), opts.accountId, now, expiresAtMs, now);
  return { token, accountId: opts.accountId, expiresAtMs };
}

/** Delete expired rows. Returns how many were removed. */
export function purgeExpiredSessions(db: SqliteDb, nowMs = Date.now()): number {
  ensureV10Ddl(db);
  const result = db
    .prepare(`DELETE FROM account_sessions WHERE expires_at_ms <= ?`)
    .run(nowMs);
  return Number(result.changes ?? 0);
}

export function listAccountSessions(
  db: SqliteDb,
  opts?: {
    accountId?: string;
    nowMs?: number;
    onlineWindowMs?: number;
    /** When false, include expired rows (default: purge then list live only). */
    includeExpired?: boolean;
  },
): AuthSessionListItem[] {
  ensureV10Ddl(db);
  const now = opts?.nowMs ?? Date.now();
  const onlineWindow = opts?.onlineWindowMs ?? AUTH_ONLINE_WINDOW_MS;
  if (!opts?.includeExpired) {
    purgeExpiredSessions(db, now);
  }
  const accountId = opts?.accountId?.trim();
  const rows = accountId
    ? (db
        .prepare(
          `SELECT s.token_hash, s.account_id, s.created_at_ms, s.expires_at_ms,
                  s.last_seen_at_ms, a.login_name, a.display_name
           FROM account_sessions s
           JOIN accounts a ON a.id = s.account_id
           WHERE s.account_id = ?
           ORDER BY s.last_seen_at_ms DESC`,
        )
        .all(accountId) as Array<{
        token_hash: string;
        account_id: string;
        created_at_ms: number;
        expires_at_ms: number;
        last_seen_at_ms: number;
        login_name: string;
        display_name: string;
      }>)
    : (db
        .prepare(
          `SELECT s.token_hash, s.account_id, s.created_at_ms, s.expires_at_ms,
                  s.last_seen_at_ms, a.login_name, a.display_name
           FROM account_sessions s
           JOIN accounts a ON a.id = s.account_id
           ORDER BY s.last_seen_at_ms DESC`,
        )
        .all() as Array<{
        token_hash: string;
        account_id: string;
        created_at_ms: number;
        expires_at_ms: number;
        last_seen_at_ms: number;
        login_name: string;
        display_name: string;
      }>);

  return rows.map((r) => ({
    accountId: r.account_id,
    loginName: r.login_name,
    displayName: r.display_name,
    createdAtMs: r.created_at_ms,
    expiresAtMs: r.expires_at_ms,
    lastSeenAtMs: r.last_seen_at_ms,
    online: r.last_seen_at_ms >= now - onlineWindow,
    tokenHashPrefix: String(r.token_hash).slice(0, 8),
  }));
}

export function revokeSession(db: SqliteDb, token: string): boolean {
  ensureV10Ddl(db);
  const result = db
    .prepare(`DELETE FROM account_sessions WHERE token_hash = ?`)
    .run(hashSessionToken(token));
  return Number(result.changes ?? 0) > 0;
}

export function revokeAllSessionsForAccount(db: SqliteDb, accountId: string): number {
  ensureV10Ddl(db);
  const result = db
    .prepare(`DELETE FROM account_sessions WHERE account_id = ?`)
    .run(accountId);
  return Number(result.changes ?? 0);
}

/** Resolve Bearer token → account + companies. Expired sessions are deleted. */
export function resolveSession(
  db: SqliteDb,
  token: string | null | undefined,
  opts?: { nowMs?: number; touch?: boolean },
): AuthSessionContext | null {
  ensureV10Ddl(db);
  const raw = token?.trim();
  if (!raw) return null;
  const now = opts?.nowMs ?? Date.now();
  // Opportunistic GC so Adminer does not fill with dead rows.
  purgeExpiredSessions(db, now);
  const tokenHash = hashSessionToken(raw);
  const row = db
    .prepare(
      `SELECT token_hash, account_id, expires_at_ms FROM account_sessions
       WHERE token_hash = ?`,
    )
    .get(tokenHash) as
    | { token_hash: string; account_id: string; expires_at_ms: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at_ms <= now) {
    db.prepare(`DELETE FROM account_sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }
  if (opts?.touch !== false) {
    db.prepare(
      `UPDATE account_sessions SET last_seen_at_ms = ? WHERE token_hash = ?`,
    ).run(now, tokenHash);
  }
  const account = getAccountById(db, row.account_id);
  if (!account) {
    db.prepare(`DELETE FROM account_sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }
  const memberships = listMembershipsForAccount(db, account.id);
  const companies = listCompaniesForAccount(db, account.id);
  return { account, companies, memberships };
}

export function addCompanyMember(
  db: SqliteDb,
  opts: {
    companyId: string;
    accountId: string;
    role?: CareerAccountRole;
    nowMs?: number;
  },
): CareerCompanyMember {
  ensureV10Ddl(db);
  const companyId = opts.companyId.trim();
  const accountId = opts.accountId.trim();
  if (!companyId || !accountId) throw new Error('companyId and accountId required');
  const role = normalizeRole(opts.role);
  const now = opts.nowMs ?? Date.now();
  db.prepare(
    `INSERT INTO company_members (company_id, account_id, role, created_at_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, account_id) DO UPDATE SET role = excluded.role`,
  ).run(companyId, accountId, role, now);
  return { companyId, accountId, role, createdAtMs: now };
}

export function listMembershipsForAccount(
  db: SqliteDb,
  accountId: string,
): CareerCompanyMember[] {
  ensureV10Ddl(db);
  const rows = db
    .prepare(
      `SELECT company_id, account_id, role, created_at_ms
       FROM company_members WHERE account_id = ?`,
    )
    .all(accountId) as Array<{
    company_id: string;
    account_id: string;
    role: string;
    created_at_ms: number;
  }>;
  return rows.map((row) => ({
    companyId: row.company_id,
    accountId: row.account_id,
    role: normalizeRole(row.role),
    createdAtMs: row.created_at_ms,
  }));
}

export function listCompaniesForAccount(
  db: SqliteDb,
  accountId: string,
): CareerCompanyRow[] {
  ensureV10Ddl(db);
  const rows = db
    .prepare(
      `SELECT c.id, c.display_name, c.home_hub_icao, c.home_country_id,
              c.world_id, c.created_at_ms
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.account_id = ?
       ORDER BY c.created_at_ms ASC`,
    )
    .all(accountId) as Array<{
    id: string;
    display_name: string;
    home_hub_icao: string;
    home_country_id: string;
    world_id: string | null;
    created_at_ms: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name ?? '',
    homeHubIcao: row.home_hub_icao ?? '',
    homeCountryId: row.home_country_id ?? '',
    worldId: row.world_id?.trim() || LOCAL_WORLD_ID,
    createdAtMs: row.created_at_ms,
  }));
}

/** True when account is a company_members row (any role). */
export function accountOwnsCompany(
  db: SqliteDb,
  accountId: string,
  companyId: string,
): boolean {
  ensureV10Ddl(db);
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM company_members
       WHERE account_id = ? AND company_id = ?`,
    )
    .get(accountId, companyId) as { ok: number } | undefined;
  return Boolean(row);
}

export function countCompanyMembers(db: SqliteDb, companyId: string): number {
  ensureV10Ddl(db);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?`)
    .get(companyId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

/** Attach account as owner of a company that has no members yet. */
export function claimOrphanCompany(
  db: SqliteDb,
  opts: { companyId: string; accountId: string; nowMs?: number },
): CareerCompanyRow {
  ensureV10Ddl(db);
  const companyId = opts.companyId.trim();
  const row = db
    .prepare(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies WHERE id = ?`,
    )
    .get(companyId) as
    | {
        id: string;
        display_name: string;
        home_hub_icao: string;
        home_country_id: string;
        world_id: string | null;
        created_at_ms: number;
      }
    | undefined;
  if (!row) throw new Error('company not found');
  if (countCompanyMembers(db, companyId) > 0) {
    throw new Error('company already has members');
  }
  addCompanyMember(db, {
    companyId,
    accountId: opts.accountId,
    role: 'owner',
    nowMs: opts.nowMs,
  });
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    homeHubIcao: row.home_hub_icao ?? '',
    homeCountryId: row.home_country_id ?? '',
    worldId: row.world_id?.trim() || LOCAL_WORLD_ID,
    createdAtMs: row.created_at_ms,
  };
}

/** Parse `Authorization: Bearer <token>` (or raw token). */
export function bearerTokenFromHeader(
  authorization: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const m = /^Bearer\s+(.+)$/i.exec(trimmed);
  return (m?.[1] ?? trimmed).trim() || null;
}

/** Env gate: CAREER_AUTH=1|true|on enables enforcement. */
export function isCareerAuthRequired(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.CAREER_AUTH ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * Fixed shared world — host opens one SQL DB forever; clients attach (no ProfileGate).
 * Env: CAREER_WORLD_FIXED=1 (host mode defaults this on).
 * Not stored in SQLite — process env only. DB path: careerRoot/world/skyline.sqlite.
 */
export function isCareerWorldFixed(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.CAREER_WORLD_FIXED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}
