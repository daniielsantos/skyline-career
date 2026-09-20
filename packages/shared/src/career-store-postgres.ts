/**
 * MP Postgres career store (lab / hosted world).
 * Auth + companies relational; economy SoT is relational tables +
 * economy_meta.misc_json (see career-store-pg-world).
 * Schema v22 adds companies.recruiting + company_join_requests (VA directory).
 * Schema v21 adds company_invites + haul ranking stats (VA IH-2).
 * Schema v20 adds aircraft_instances.owner_company_id (F7 dealer claim).
 * Schema v19 widens charter_offers.group_size to 1…230 (med/narrow).
 * Schema v18 adds hub_economy_samples for Pulse / Hub Stats history.
 * Schema v17 adds monotonic economy revision for cross-process snapshots.
 * Schema v16 promotes fleet_aircraft payload fields to columns.
 * Schema v15 drops legacy stubs `economy_json` + `company_missions`.
 * SP stays on SQLite files — this backend is for CAREER_DATABASE_URL only.
 */

import pg from 'pg';
import {
  AUTH_ONLINE_WINDOW_MS,
  AUTH_SESSION_TTL_MS,
  hashPassword,
  hashSessionToken,
  mintSessionToken,
  verifyPassword,
  type AuthSessionContext,
  type AuthSessionListItem,
  type CareerAccount,
  type CareerAccountSession,
  type CareerCompanyMember,
  type LoginAccountOpts,
  type RegisterAccountOpts,
  type RegisterAccountResult,
} from './career-auth.js';
import {
  VA_INVITE_DEFAULT_MAX_USES,
  VA_INVITE_NEVER_EXPIRES_MS,
  VA_ALREADY_IN_VA_MSG,
  VA_MEMBER_CAP,
  VA_MEMBER_ROUTE_CUT_DEFAULT_PCT,
  clampMemberRouteCutPct,
  type CareerCompanyInvite,
  type VaCompanyRankRow,
  type VaDirectoryEntry,
  type VaJoinRequestRow,
  type VaMemberRow,
  type VaPilotRankRow,
  type VaPublishResult,
} from './career-va.js';
import type { CareerCompanyRow, EnsureCompanyOpts } from './career-companies.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import {
  LOCAL_WORLD_ID,
  type AirportBoardSnapshot,
  type AirportInventorySnapshot,
} from './career-store-v4.js';
import {
  createSeedEconomyWorld,
  ensureEconomyCaughtUp,
  ensureSeedMarketFormed,
  migrateEconomyWorld,
  type CareerEconomyWorld,
} from './career-economy.js';
import { emptyMissionsStateV2, normalizeMissionsState } from './career-fleet.js';
import { normalizeMissionIntent } from './career-mission.js';
import {
  summarizeCareerLedger,
  type CareerLedgerEntry,
  type CareerLedgerSummary,
} from './career-ledger.js';
import type {
  CareerMissionsState,
  DemandOrder,
  HubEconomySample,
  PortConcessionIndexRow,
  PortListing,
} from './types/career-economy.js';
import type {
  CareerStore,
  CommandWorldSliceOpts,
  EconomyLoadResult,
  PersistCommandWorldSliceOpts,
} from './career-store.js';
import { MAX_LOAD_CATCH_UP_TICKS } from './career-clock.js';
import { createHash, randomBytes } from 'node:crypto';
import { ensureHomeCountryId } from './career-partition.js';
import {
  emptyPgEconomyShell,
  ensurePgWorldDdl,
  economyNeedsPgTableBackfill,
  hydrateEconomyFromPg,
  hydrateMissionsFromPg,
  isPgEconomyMiscEmpty,
  persistEconomyTablesToPg,
  persistAircraftPoolToPg,
  claimAircraftInstanceInPg,
  releaseAircraftInstanceClaimInPg,
  persistDemandBoardToPg,
  persistDemandOrderToPg,
  persistInboundPendingToPg,
  persistMissionsTablesToPg,
  persistNpcLiveToPg,
  persistPortConcessionsToPg,
  persistPortListingToPg,
  persistPortMarketToPg,
} from './career-store-pg-world.js';
import {
  readHubEconomySamplesFromPg,
  readHubEconomySamplesSinceFromPg,
} from './career-store-pg-hub-economy.js';
import {
  companySessionFromTick,
  settleCompanyPassiveFeesForTickRange,
} from './career-company-session.js';
import type { OfflineFeeSummary } from './career-offline-fees.js';
import { CAREER_PG_WORLD_WRITER_LOCK_KEY } from './career-postgres-retry.js';

export {
  careerDatabaseUrlFromEnv,
  careerTestDatabaseUrlFromEnv,
  DEFAULT_CAREER_DATABASE_URL,
  DEFAULT_CAREER_TEST_DATABASE_URL,
  isCareerLabDatabaseUrl,
} from './career-database-url.js';

const CAREER_PG_SCHEMA_VERSION = '25';
const { Pool } = pg;

export function isCareerWorldSeedAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.CAREER_WORLD_ALLOW_SEED;
  if (raw == null || raw.trim() === '') return true;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function assertCareerWorldSeedAllowed(
  hasEconomy: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (hasEconomy || isCareerWorldSeedAllowed(env)) return;
  throw new Error(
    'Postgres world is empty and CAREER_WORLD_ALLOW_SEED=0; refusing automatic world creation. Restore the database or explicitly set CAREER_WORLD_ALLOW_SEED=1 for the first bootstrap only.',
  );
}

function catchUpOpts(opts?: { maxCatchUpTicks?: number }) {
  return { maxTicks: opts?.maxCatchUpTicks ?? MAX_LOAD_CATCH_UP_TICKS };
}

function pgRevision(value: unknown): bigint {
  try {
    return BigInt(
      typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'bigint'
        ? value
        : 0,
    );
  } catch {
    return 0n;
  }
}

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

function suggestAccountId(): string {
  return `acc_${randomBytes(6).toString('hex')}`;
}

function suggestCompanyIdFromLogin(loginName: string): string {
  return `co_${loginName}`.slice(0, 48).replace(/[^a-z0-9_-]/gi, '_');
}

function normalizeCompanyId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error('company id required');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    throw new Error('company id must be 1–64 chars [a-zA-Z0-9_-]');
  }
  return trimmed;
}

function normalizeMissions(raw: Record<string, unknown>): CareerMissionsState {
  const normalized = normalizeMissionsState(raw);
  normalized.missions = normalized.missions.map((m) => normalizeMissionIntent(m));
  return normalized;
}

async function pgTableExists(pool: pg.Pool, name: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT to_regclass($1) AS reg`, [
    `public.${name}`,
  ]);
  return rows[0]?.reg != null;
}

/**
 * One-shot retire of PG-only JSON stubs (schema v15).
 * SP SQLite keeps economy_json / missions_json — do not mirror this there.
 */
async function retirePgLegacyStubTables(pool: pg.Pool): Promise<void> {
  if (await pgTableExists(pool, 'company_missions')) {
    const { rows } = await pool.query(
      `SELECT company_id, payload FROM company_missions`,
    );
    for (const row of rows) {
      const companyId = String(row.company_id ?? '').trim();
      if (!companyId) continue;
      const payload = row.payload as Record<string, unknown> | null | undefined;
      const stateRes = await pool.query(
        `SELECT 1 AS ok FROM company_state WHERE company_id = $1`,
        [companyId],
      );
      const hasCompanyState = Boolean(stateRes.rows[0]);
      if (
        !hasCompanyState &&
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload)
      ) {
        await persistMissionsTablesToPg(
          pool,
          normalizeMissions(payload),
          companyId,
        );
        continue;
      }
      const hasFatMissions =
        Array.isArray(payload?.missions) && payload.missions.length > 0;
      const hasFatFleet =
        Array.isArray(payload?.fleet) && payload.fleet.length > 0;
      if (!hasFatMissions && !hasFatFleet) continue;
      const tableCounts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM missions WHERE company_id = $1) AS missions,
           (SELECT COUNT(*)::int FROM fleet_aircraft WHERE company_id = $1) AS fleet`,
        [companyId],
      );
      const counts = tableCounts.rows[0] as
        | { missions: number; fleet: number }
        | undefined;
      if (Number(counts?.missions) > 0 || Number(counts?.fleet) > 0) continue;
      const blobFallback =
        payload && Array.isArray(payload.missions)
          ? normalizeMissions(payload)
          : emptyMissionsStateV2();
      const fromTables = await hydrateMissionsFromPg(
        pool,
        companyId,
        blobFallback,
      );
      await persistMissionsTablesToPg(pool, fromTables, companyId);
    }
    await pool.query(`DROP TABLE IF EXISTS company_missions`);
  }

  if (await pgTableExists(pool, 'economy_json')) {
    const airportRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM airports WHERE world_id = $1`,
      [LOCAL_WORLD_ID],
    );
    const metaRes = await pool.query(
      `SELECT 1 AS ok FROM economy_meta WHERE world_id = $1`,
      [LOCAL_WORLD_ID],
    );
    const hasAirports = Number(airportRes.rows[0]?.n) > 0;
    const hasMeta = Boolean(metaRes.rows[0]);
    if (!hasAirports && !hasMeta) {
      const stubRes = await pool.query(
        `SELECT payload FROM economy_json WHERE id = 1`,
      );
      const stubPayload = stubRes.rows[0]?.payload as
        | Record<string, unknown>
        | undefined;
      if (stubPayload) {
        const world = migrateEconomyWorld(stubPayload);
        await persistEconomyTablesToPg(pool, world, LOCAL_WORLD_ID);
      }
    }
    await pool.query(`DROP TABLE IF EXISTS economy_json`);
  }
}

async function postgresWorldHasEconomy(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query(
    `SELECT (
       EXISTS (SELECT 1 FROM economy_meta WHERE world_id = $1)
       OR EXISTS (SELECT 1 FROM airports WHERE world_id = $1)
       OR EXISTS (SELECT 1 FROM lots WHERE world_id = $1)
       OR EXISTS (SELECT 1 FROM npcs WHERE world_id = $1)
     ) AS present`,
    [LOCAL_WORLD_ID],
  );
  return result.rows[0]?.present === true;
}

const PG_DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  home_hub_icao TEXT NOT NULL DEFAULT '',
  home_country_id TEXT NOT NULL DEFAULT '',
  world_id TEXT,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  login_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_login_idx ON accounts(login_name);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  last_seen_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expires_idx ON account_sessions(expires_at_ms);

CREATE TABLE IF NOT EXISTS company_members (
  company_id TEXT NOT NULL REFERENCES companies(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL DEFAULT 'owner',
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY (company_id, account_id)
);
CREATE INDEX IF NOT EXISTS company_members_account_idx ON company_members(account_id);

CREATE TABLE IF NOT EXISTS company_invites (
  code TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  created_by_account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL DEFAULT 'pilot',
  created_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 8,
  uses INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS company_invites_company_idx ON company_invites(company_id);
CREATE INDEX IF NOT EXISTS company_invites_expires_idx ON company_invites(expires_at_ms);

CREATE TABLE IF NOT EXISTS company_haul_stats (
  company_id TEXT NOT NULL REFERENCES companies(id),
  day_key INTEGER NOT NULL,
  hauls INTEGER NOT NULL DEFAULT 0,
  nm DOUBLE PRECISION NOT NULL DEFAULT 0,
  pay_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, day_key)
);
CREATE INDEX IF NOT EXISTS company_haul_stats_day_idx ON company_haul_stats(day_key);

CREATE TABLE IF NOT EXISTS company_pilot_haul_stats (
  company_id TEXT NOT NULL REFERENCES companies(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  day_key INTEGER NOT NULL,
  hauls INTEGER NOT NULL DEFAULT 0,
  nm DOUBLE PRECISION NOT NULL DEFAULT 0,
  pay_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, account_id, day_key)
);
CREATE INDEX IF NOT EXISTS company_pilot_haul_stats_day_idx
  ON company_pilot_haul_stats(company_id, day_key);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS recruiting BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE company_state ADD COLUMN IF NOT EXISTS va_line_crew_json JSONB;

CREATE TABLE IF NOT EXISTS company_join_requests (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at_ms BIGINT NOT NULL,
  decided_at_ms BIGINT,
  decided_by_account_id TEXT
);
CREATE INDEX IF NOT EXISTS company_join_requests_company_idx
  ON company_join_requests(company_id, status);
CREATE INDEX IF NOT EXISTS company_join_requests_account_idx
  ON company_join_requests(account_id, status);
`;

function rowToCompany(row: {
  id: string;
  display_name: string;
  home_hub_icao: string;
  home_country_id: string;
  world_id: string | null;
  created_at_ms: string | number;
}): CareerCompanyRow {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    homeHubIcao: row.home_hub_icao ?? '',
    homeCountryId: row.home_country_id ?? '',
    worldId: row.world_id?.trim() || LOCAL_WORLD_ID,
    createdAtMs: Number(row.created_at_ms) || 0,
  };
}

function rowToAccount(row: {
  id: string;
  login_name: string;
  display_name: string;
  created_at_ms: string | number;
}): CareerAccount {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    createdAtMs: Number(row.created_at_ms) || 0,
  };
}

export class PostgresCareerStore implements CareerStore {
  readonly kind = 'postgres' as const;
  readonly supportsAuth = true;
  private readonly pool: pg.Pool;
  private activeCompanyId = LOCAL_COMPANY_ID;
  private ram: CareerEconomyWorld | null = null;
  /** Revision of `ram`; null means no authoritative PG snapshot is cached. */
  private ramRevision: bigint | null = null;
  private writerLeaseClient: pg.PoolClient | null = null;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.ready = this.ensureSchema();
  }

  /** Wait until DDL is applied (call after open). */
  async init(): Promise<void> {
    await this.ready;
  }

  async acquireWorldWriterLease(): Promise<boolean> {
    await this.ready;
    if (this.writerLeaseClient) return true;
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock($1) AS acquired`,
        [CAREER_PG_WORLD_WRITER_LOCK_KEY],
      );
      if (result.rows[0]?.acquired !== true) {
        client.release();
        return false;
      }
      this.writerLeaseClient = client;
      client.once('error', (error) => {
        if (this.writerLeaseClient === client) {
          this.writerLeaseClient = null;
          client.release(error);
        }
      });
      return true;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  hasWorldWriterLease(): boolean {
    return this.writerLeaseClient !== null;
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(PG_DDL);
    await ensurePgWorldDdl(this.pool);
    await this.pool.query(
      `INSERT INTO meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [CAREER_PG_SCHEMA_VERSION],
    );
    await retirePgLegacyStubTables(this.pool);
    await this.pool.query(
      `INSERT INTO companies (id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms)
       VALUES ($1, '', '', '', $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [LOCAL_COMPANY_ID, LOCAL_WORLD_ID, Date.now()],
    );
    assertCareerWorldSeedAllowed(
      await postgresWorldHasEconomy(this.pool),
    );
  }

  getActiveCompanyId(): string {
    return this.activeCompanyId;
  }

  setActiveCompanyId(companyId: string): void {
    this.activeCompanyId = companyId.trim() || LOCAL_COMPANY_ID;
  }

  private async persistRevisioned(
    persist: (expectedRevision: bigint | undefined) => Promise<bigint>,
    applyToRam: () => void,
  ): Promise<void> {
    try {
      const revision = await persist(this.ramRevision ?? undefined);
      applyToRam();
      this.ramRevision = revision;
    } catch (error) {
      // The caller may already have mutated the shared object. Never serve it
      // after a failed/conflicting commit; the next read rehydrates from PG.
      this.ram = null;
      this.ramRevision = null;
      throw error;
    }
  }

  async listWorldCompanies(worldId = LOCAL_WORLD_ID): Promise<CareerCompanyRow[]> {
    await this.ready;
    const wid = worldId.trim() || LOCAL_WORLD_ID;
    const { rows } = await this.pool.query(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies
       WHERE world_id = $1 OR (world_id IS NULL AND $1 = $2)
       ORDER BY created_at_ms ASC, id ASC`,
      [wid, LOCAL_WORLD_ID],
    );
    return rows.map(rowToCompany);
  }

  async ensureCompany(opts: EnsureCompanyOpts): Promise<CareerCompanyRow> {
    await this.ready;
    const id = normalizeCompanyId(opts.id);
    const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
    const now = Date.now();
    const existing = await this.pool.query(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies WHERE id = $1`,
      [id],
    );
    if (existing.rows[0]) {
      if (opts.displayName || opts.homeHubIcao || opts.homeCountryId || opts.worldId) {
        await this.pool.query(
          `UPDATE companies SET
             display_name = COALESCE(NULLIF($1, ''), display_name),
             home_hub_icao = COALESCE(NULLIF($2, ''), home_hub_icao),
             home_country_id = COALESCE(NULLIF($3, ''), home_country_id),
             world_id = COALESCE(NULLIF($4, ''), world_id)
           WHERE id = $5`,
          [
            opts.displayName ?? '',
            opts.homeHubIcao ?? '',
            opts.homeCountryId ?? '',
            opts.worldId ?? '',
            id,
          ],
        );
      }
      const again = await this.pool.query(
        `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
         FROM companies WHERE id = $1`,
        [id],
      );
      return rowToCompany(again.rows[0]!);
    }
    await this.pool.query(
      `INSERT INTO companies (id, display_name, home_hub_icao, home_country_id, created_at_ms, world_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        opts.displayName ?? '',
        opts.homeHubIcao ?? '',
        opts.homeCountryId ?? '',
        now,
        worldId,
      ],
    );
    return {
      id,
      displayName: opts.displayName ?? '',
      homeHubIcao: opts.homeHubIcao ?? '',
      homeCountryId: opts.homeCountryId ?? '',
      worldId,
      createdAtMs: now,
    };
  }

  async authRegister(opts: RegisterAccountOpts): Promise<RegisterAccountResult> {
    await this.ready;
    const loginName = normalizeLoginName(opts.loginName);
    const displayName = normalizeDisplayName(opts.displayName);
    const password = normalizePassword(opts.password);
    const now = opts.nowMs ?? Date.now();
    const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;

    const taken = await this.pool.query(
      `SELECT 1 AS ok FROM accounts WHERE login_name = $1`,
      [loginName],
    );
    if (taken.rows[0]) throw new Error('login name already taken');

    const accountId = suggestAccountId();
    await this.pool.query(
      `INSERT INTO accounts (id, login_name, display_name, password_hash, created_at_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, loginName, displayName, hashPassword(password), now],
    );

    const account = rowToAccount({
      id: accountId,
      login_name: loginName,
      display_name: displayName,
      created_at_ms: now,
    });

    let company: CareerCompanyRow | null = null;
    if (opts.createCompany !== false) {
      const companyId =
        opts.companyId?.trim() || suggestCompanyIdFromLogin(loginName);
      company = await this.ensureCompany({
        id: companyId,
        worldId,
        displayName: opts.companyDisplayName?.trim() || displayName,
        homeHubIcao: opts.homeHubIcao,
        homeCountryId: opts.homeCountryId,
      });
      await this.authAddCompanyMember({
        companyId: company.id,
        accountId,
        role: 'owner',
      });
    }

    const session = await this.createSession(accountId, now, opts.sessionTtlMs);
    return { account, session, company };
  }

  async authLogin(opts: LoginAccountOpts): Promise<{
    account: CareerAccount;
    session: CareerAccountSession;
  }> {
    await this.ready;
    const loginName = normalizeLoginName(opts.loginName);
    const { rows } = await this.pool.query(
      `SELECT id, login_name, display_name, password_hash, created_at_ms
       FROM accounts WHERE login_name = $1`,
      [loginName],
    );
    const row = rows[0] as
      | {
          id: string;
          login_name: string;
          display_name: string;
          password_hash: string;
          created_at_ms: string | number;
        }
      | undefined;
    if (!row || !verifyPassword(opts.password, row.password_hash)) {
      throw new Error('invalid login or password');
    }
    const now = opts.nowMs ?? Date.now();
    const account = rowToAccount(row);
    const session = await this.createSession(account.id, now, opts.sessionTtlMs);
    return { account, session };
  }

  private async createSession(
    accountId: string,
    now: number,
    ttlMs?: number,
  ): Promise<CareerAccountSession> {
    const ttl = ttlMs ?? AUTH_SESSION_TTL_MS;
    await this.authPurgeExpiredSessions(now);
    // One live Bearer per account — new login kicks previous clients.
    await this.pool.query(`DELETE FROM account_sessions WHERE account_id = $1`, [
      accountId,
    ]);
    const token = mintSessionToken();
    const expiresAtMs = now + ttl;
    await this.pool.query(
      `INSERT INTO account_sessions
         (token_hash, account_id, created_at_ms, expires_at_ms, last_seen_at_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [hashSessionToken(token), accountId, now, expiresAtMs, now],
    );
    return { token, accountId, expiresAtMs };
  }

  async authResolveSession(
    token: string | null | undefined,
    opts?: { nowMs?: number; touch?: boolean },
  ): Promise<AuthSessionContext | null> {
    await this.ready;
    const raw = token?.trim();
    if (!raw) return null;
    const now = opts?.nowMs ?? Date.now();
    await this.authPurgeExpiredSessions(now);
    const tokenHash = hashSessionToken(raw);
    const { rows } = await this.pool.query(
      `SELECT token_hash, account_id, expires_at_ms FROM account_sessions
       WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0] as
      | { token_hash: string; account_id: string; expires_at_ms: string | number }
      | undefined;
    if (!row) return null;
    if (Number(row.expires_at_ms) <= now) {
      await this.pool.query(`DELETE FROM account_sessions WHERE token_hash = $1`, [
        tokenHash,
      ]);
      return null;
    }
    if (opts?.touch !== false) {
      await this.pool.query(
        `UPDATE account_sessions SET last_seen_at_ms = $1 WHERE token_hash = $2`,
        [now, tokenHash],
      );
    }
    const acc = await this.pool.query(
      `SELECT id, login_name, display_name, created_at_ms FROM accounts WHERE id = $1`,
      [row.account_id],
    );
    if (!acc.rows[0]) {
      await this.pool.query(`DELETE FROM account_sessions WHERE token_hash = $1`, [
        tokenHash,
      ]);
      return null;
    }
    const account = rowToAccount(acc.rows[0]!);
    const memberships = await this.listMemberships(account.id);
    const companies = await this.authListCompaniesForAccount(account.id);
    return { account, companies, memberships };
  }

  async authRevokeSession(token: string): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `DELETE FROM account_sessions WHERE token_hash = $1`,
      [hashSessionToken(token)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async authPurgeExpiredSessions(nowMs = Date.now()): Promise<number> {
    await this.ready;
    const result = await this.pool.query(
      `DELETE FROM account_sessions WHERE expires_at_ms <= $1`,
      [nowMs],
    );
    return result.rowCount ?? 0;
  }

  async authListSessions(opts?: {
    accountId?: string;
    nowMs?: number;
    onlineWindowMs?: number;
    includeExpired?: boolean;
  }): Promise<AuthSessionListItem[]> {
    await this.ready;
    const now = opts?.nowMs ?? Date.now();
    const onlineWindow = opts?.onlineWindowMs ?? AUTH_ONLINE_WINDOW_MS;
    if (!opts?.includeExpired) {
      await this.authPurgeExpiredSessions(now);
    }
    const accountId = opts?.accountId?.trim();
    const { rows } = accountId
      ? await this.pool.query(
          `SELECT s.token_hash, s.account_id, s.created_at_ms, s.expires_at_ms,
                  s.last_seen_at_ms, a.login_name, a.display_name
           FROM account_sessions s
           JOIN accounts a ON a.id = s.account_id
           WHERE s.account_id = $1
           ORDER BY s.last_seen_at_ms DESC`,
          [accountId],
        )
      : await this.pool.query(
          `SELECT s.token_hash, s.account_id, s.created_at_ms, s.expires_at_ms,
                  s.last_seen_at_ms, a.login_name, a.display_name
           FROM account_sessions s
           JOIN accounts a ON a.id = s.account_id
           ORDER BY s.last_seen_at_ms DESC`,
        );
    return (
      rows as Array<{
        token_hash: string;
        account_id: string;
        created_at_ms: string | number;
        expires_at_ms: string | number;
        last_seen_at_ms: string | number;
        login_name: string;
        display_name: string;
      }>
    ).map((r) => ({
      accountId: r.account_id,
      loginName: r.login_name,
      displayName: r.display_name,
      createdAtMs: Number(r.created_at_ms),
      expiresAtMs: Number(r.expires_at_ms),
      lastSeenAtMs: Number(r.last_seen_at_ms),
      online: Number(r.last_seen_at_ms) >= now - onlineWindow,
      tokenHashPrefix: String(r.token_hash).slice(0, 8),
    }));
  }

  async authListCompaniesForAccount(accountId: string): Promise<CareerCompanyRow[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT c.id, c.display_name, c.home_hub_icao, c.home_country_id, c.world_id, c.created_at_ms
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.account_id = $1
       ORDER BY m.created_at_ms ASC, c.id ASC`,
      [accountId],
    );
    return rows.map(rowToCompany);
  }

  async authAddCompanyMember(opts: {
    companyId: string;
    accountId: string;
    role?: CareerCompanyMember['role'];
  }): Promise<CareerCompanyMember> {
    await this.ready;
    const now = Date.now();
    const role = opts.role ?? 'owner';
    await this.pool.query(
      `INSERT INTO company_members (company_id, account_id, role, created_at_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, account_id) DO UPDATE SET role = EXCLUDED.role`,
      [opts.companyId, opts.accountId, role, now],
    );
    return {
      companyId: opts.companyId,
      accountId: opts.accountId,
      role,
      createdAtMs: now,
    };
  }

  async authAccountOwnsCompany(
    accountId: string,
    companyId: string,
  ): Promise<boolean> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT 1 AS ok FROM company_members
       WHERE account_id = $1 AND company_id = $2 AND role = 'owner'`,
      [accountId, companyId],
    );
    return Boolean(rows[0]);
  }

  async vaGetMembership(
    accountId: string,
    companyId: string,
  ): Promise<CareerCompanyMember | null> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT company_id, account_id, role, created_at_ms
       FROM company_members WHERE account_id = $1 AND company_id = $2`,
      [accountId, companyId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      companyId: r.company_id as string,
      accountId: r.account_id as string,
      role: r.role as CareerCompanyMember['role'],
      createdAtMs: Number(r.created_at_ms) || 0,
    };
  }

  async vaListMembers(companyId: string): Promise<VaMemberRow[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT m.company_id, m.account_id, m.role, m.created_at_ms,
              a.login_name, a.display_name
       FROM company_members m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.company_id = $1
       ORDER BY
         CASE m.role WHEN 'owner' THEN 0 WHEN 'dispatcher' THEN 1 ELSE 2 END,
         m.created_at_ms ASC`,
      [companyId],
    );
    return rows.map((r) => ({
      companyId: r.company_id as string,
      accountId: r.account_id as string,
      role: r.role as CareerCompanyMember['role'],
      createdAtMs: Number(r.created_at_ms) || 0,
      loginName: r.login_name as string,
      displayName: r.display_name as string,
    }));
  }

  async vaCreateInvite(opts: {
    companyId: string;
    createdByAccountId: string;
    role?: CareerCompanyMember['role'];
    maxUses?: number;
  }): Promise<CareerCompanyInvite> {
    await this.ready;
    const membership = await this.vaGetMembership(
      opts.createdByAccountId,
      opts.companyId,
    );
    if (
      !membership ||
      (membership.role !== 'owner' && membership.role !== 'dispatcher')
    ) {
      throw new Error('Only owner or dispatcher can create invites');
    }
    const role = opts.role === 'dispatcher' ? 'dispatcher' : 'pilot';
    const now = Date.now();
    const maxUses = Math.max(
      1,
      Math.min(
        VA_INVITE_DEFAULT_MAX_USES,
        Math.floor(opts.maxUses ?? VA_INVITE_DEFAULT_MAX_USES),
      ),
    );
    const expiresAtMs = VA_INVITE_NEVER_EXPIRES_MS;
    // One active code: revoke any still-open invites for this company.
    await this.pool.query(
      `UPDATE company_invites
       SET expires_at_ms = $1
       WHERE company_id = $2 AND expires_at_ms > $1`,
      [now, opts.companyId],
    );
    let code = `VA-${randomBytes(4).toString('hex').toUpperCase()}`;
    for (let i = 0; i < 5; i++) {
      const exists = await this.pool.query(
        `SELECT 1 AS ok FROM company_invites WHERE code = $1`,
        [code],
      );
      if (!exists.rows[0]) break;
      code = `VA-${randomBytes(4).toString('hex').toUpperCase()}`;
    }
    await this.pool.query(
      `INSERT INTO company_invites
         (code, company_id, created_by_account_id, role, created_at_ms, expires_at_ms, max_uses, uses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [
        code,
        opts.companyId,
        opts.createdByAccountId,
        role,
        now,
        expiresAtMs,
        maxUses,
      ],
    );
    return {
      code,
      companyId: opts.companyId,
      createdByAccountId: opts.createdByAccountId,
      role,
      createdAtMs: now,
      expiresAtMs,
      maxUses,
      uses: 0,
    };
  }

  async vaListInvites(companyId: string): Promise<CareerCompanyInvite[]> {
    await this.ready;
    const now = Date.now();
    const { rows } = await this.pool.query(
      `SELECT code, company_id, created_by_account_id, role, created_at_ms,
              expires_at_ms, max_uses, uses
       FROM company_invites
       WHERE company_id = $1 AND expires_at_ms > $2 AND uses < max_uses
       ORDER BY created_at_ms DESC`,
      [companyId, now],
    );
    return rows.map((r) => ({
      code: r.code as string,
      companyId: r.company_id as string,
      createdByAccountId: r.created_by_account_id as string,
      role: r.role as CareerCompanyMember['role'],
      createdAtMs: Number(r.created_at_ms) || 0,
      expiresAtMs: Number(r.expires_at_ms) || 0,
      maxUses: Number(r.max_uses) || 0,
      uses: Number(r.uses) || 0,
    }));
  }

  async vaJoinInvite(opts: {
    code: string;
    accountId: string;
  }): Promise<{ member: CareerCompanyMember; companyId: string }> {
    await this.ready;
    const code = opts.code.trim().toUpperCase();
    const now = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT code, company_id, role, expires_at_ms, max_uses, uses
         FROM company_invites WHERE code = $1 FOR UPDATE`,
        [code],
      );
      const row = rows[0] as
        | {
            code: string;
            company_id: string;
            role: string;
            expires_at_ms: string | number;
            max_uses: number;
            uses: number;
          }
        | undefined;
      if (!row) throw new Error('Invite code not found');
      if (Number(row.expires_at_ms) <= now) throw new Error('Invite code expired');
      if (row.uses >= row.max_uses) throw new Error('Invite code exhausted');
      const existing = await client.query(
        `SELECT 1 AS ok FROM company_members
         WHERE account_id = $1 AND company_id = $2`,
        [opts.accountId, row.company_id],
      );
      if (existing.rows[0]) throw new Error('Already a member of this company');
      const listed = await client.query(
        `SELECT m.company_id
         FROM company_members m
         JOIN companies c ON c.id = m.company_id
         WHERE m.account_id = $1
           AND COALESCE(c.va_listed, false) = true
           AND m.company_id <> $2
         LIMIT 1`,
        [opts.accountId, row.company_id],
      );
      if (listed.rows[0]) {
        throw new Error(VA_ALREADY_IN_VA_MSG);
      }
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM company_members WHERE company_id = $1`,
        [row.company_id],
      );
      if ((countRes.rows[0]?.n as number) >= VA_MEMBER_CAP) {
        throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
      }
      const role =
        row.role === 'dispatcher' || row.role === 'pilot' ? row.role : 'pilot';
      await client.query(
        `INSERT INTO company_members (company_id, account_id, role, created_at_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, account_id) DO UPDATE SET role = EXCLUDED.role`,
        [row.company_id, opts.accountId, role, now],
      );
      await client.query(
        `UPDATE company_invites SET uses = uses + 1 WHERE code = $1`,
        [code],
      );
      await client.query('COMMIT');
      return {
        companyId: row.company_id,
        member: {
          companyId: row.company_id,
          accountId: opts.accountId,
          role: role as CareerCompanyMember['role'],
          createdAtMs: now,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async vaLeave(opts: { companyId: string; accountId: string }): Promise<void> {
    await this.ready;
    const membership = await this.vaGetMembership(opts.accountId, opts.companyId);
    if (!membership) throw new Error('Not a member of this company');
    if (membership.role === 'owner') {
      throw new Error('Owner cannot leave — transfer ownership first (not yet)');
    }
    await this.pool.query(
      `DELETE FROM company_members WHERE company_id = $1 AND account_id = $2`,
      [opts.companyId, opts.accountId],
    );
  }

  async vaKick(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
  }): Promise<void> {
    await this.ready;
    const actor = await this.vaGetMembership(opts.actorAccountId, opts.companyId);
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can kick members');
    }
    if (opts.targetAccountId === opts.actorAccountId) {
      throw new Error('Cannot kick yourself');
    }
    const target = await this.vaGetMembership(
      opts.targetAccountId,
      opts.companyId,
    );
    if (!target) throw new Error('Member not found');
    if (target.role === 'owner') throw new Error('Cannot kick another owner');
    await this.pool.query(
      `DELETE FROM company_members WHERE company_id = $1 AND account_id = $2`,
      [opts.companyId, opts.targetAccountId],
    );
  }

  async vaSetRole(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
    role: CareerCompanyMember['role'];
  }): Promise<CareerCompanyMember> {
    await this.ready;
    const actor = await this.vaGetMembership(opts.actorAccountId, opts.companyId);
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can change roles');
    }
    if (opts.role === 'owner') throw new Error('Cannot promote to owner this way');
    const target = await this.vaGetMembership(
      opts.targetAccountId,
      opts.companyId,
    );
    if (!target) throw new Error('Member not found');
    if (target.role === 'owner') throw new Error('Cannot demote owner');
    return this.authAddCompanyMember({
      companyId: opts.companyId,
      accountId: opts.targetAccountId,
      role: opts.role === 'dispatcher' ? 'dispatcher' : 'pilot',
    });
  }

  async vaHomeCompanyId(accountId: string): Promise<string | null> {
    const memberships = await this.listMemberships(accountId);
    const asOwner = memberships.find((m) => m.role === 'owner');
    if (asOwner) return asOwner.companyId;
    return memberships[0]?.companyId ?? null;
  }

  async vaRecordHaulStats(opts: {
    companyId: string;
    accountId?: string | null;
    dayKey: number;
    nm: number;
    payUsd: number;
  }): Promise<void> {
    await this.ready;
    const nm = Math.max(0, opts.nm);
    const pay = Math.max(0, opts.payUsd);
    await this.pool.query(
      `INSERT INTO company_haul_stats (company_id, day_key, hauls, nm, pay_usd)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (company_id, day_key) DO UPDATE SET
         hauls = company_haul_stats.hauls + 1,
         nm = company_haul_stats.nm + EXCLUDED.nm,
         pay_usd = company_haul_stats.pay_usd + EXCLUDED.pay_usd`,
      [opts.companyId, opts.dayKey, nm, pay],
    );
    if (opts.accountId?.trim()) {
      await this.pool.query(
        `INSERT INTO company_pilot_haul_stats
           (company_id, account_id, day_key, hauls, nm, pay_usd)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (company_id, account_id, day_key) DO UPDATE SET
           hauls = company_pilot_haul_stats.hauls + 1,
           nm = company_pilot_haul_stats.nm + EXCLUDED.nm,
           pay_usd = company_pilot_haul_stats.pay_usd + EXCLUDED.pay_usd`,
        [opts.companyId, opts.accountId.trim(), opts.dayKey, nm, pay],
      );
    }
  }

  async vaCompanyRanking(opts: {
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): Promise<VaCompanyRankRow[]> {
    await this.ready;
    const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
    const { rows } = await this.pool.query(
      `SELECT s.company_id, c.display_name,
              SUM(s.hauls)::int AS hauls, SUM(s.nm) AS nm, SUM(s.pay_usd) AS pay_usd
       FROM company_haul_stats s
       JOIN companies c ON c.id = s.company_id
       WHERE s.day_key >= $1 AND s.day_key <= $2
       GROUP BY s.company_id, c.display_name
       ORDER BY nm DESC, hauls DESC
       LIMIT $3`,
      [opts.fromDayKey, opts.toDayKey, limit],
    );
    return rows.map((r) => ({
      companyId: r.company_id as string,
      displayName: (r.display_name as string) || (r.company_id as string),
      hauls: Number(r.hauls) || 0,
      nm: Math.round(Number(r.nm) || 0),
      payUsd: Math.round((Number(r.pay_usd) || 0) * 100) / 100,
    }));
  }

  async vaPilotRanking(opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): Promise<VaPilotRankRow[]> {
    await this.ready;
    const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
    const { rows } = await this.pool.query(
      `SELECT s.account_id, a.login_name, a.display_name,
              SUM(s.hauls)::int AS hauls, SUM(s.nm) AS nm, SUM(s.pay_usd) AS pay_usd
       FROM company_pilot_haul_stats s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.company_id = $1 AND s.day_key >= $2 AND s.day_key <= $3
       GROUP BY s.account_id, a.login_name, a.display_name
       ORDER BY nm DESC, hauls DESC
       LIMIT $4`,
      [opts.companyId, opts.fromDayKey, opts.toDayKey, limit],
    );
    return rows.map((r) => ({
      accountId: r.account_id as string,
      loginName: r.login_name as string,
      displayName: r.display_name as string,
      hauls: Number(r.hauls) || 0,
      nm: Math.round(Number(r.nm) || 0),
      payUsd: Math.round((Number(r.pay_usd) || 0) * 100) / 100,
    }));
  }

  async vaIsRecruiting(companyId: string): Promise<boolean> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT recruiting FROM companies WHERE id = $1`,
      [companyId],
    );
    if (!rows[0]) return false;
    return Boolean(rows[0].recruiting);
  }

  async vaSetRecruiting(opts: {
    companyId: string;
    actorAccountId: string;
    recruiting: boolean;
  }): Promise<boolean> {
    await this.ready;
    const actor = await this.vaGetMembership(opts.actorAccountId, opts.companyId);
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can change recruiting');
    }
    await this.pool.query(`UPDATE companies SET recruiting = $1 WHERE id = $2`, [
      opts.recruiting,
      opts.companyId,
    ]);
    return opts.recruiting;
  }

  async vaPublish(opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
    memberRouteCutPct?: number;
  }): Promise<VaPublishResult> {
    await this.ready;
    const companyId = opts.companyId.trim();
    if (!companyId) throw new Error('companyId required');
    const actor = await this.vaGetMembership(opts.actorAccountId, companyId);
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can publish this company as a VA');
    }
    const exists = await this.pool.query(`SELECT id FROM companies WHERE id = $1`, [
      companyId,
    ]);
    if (!exists.rows[0]) throw new Error('Unknown company');
    const displayName = opts.displayName.trim();
    if (!displayName) throw new Error('displayName required');
    if (displayName.length > 64) throw new Error('displayName too long');
    const homeHubIcao = opts.homeHubIcao.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(homeHubIcao)) {
      throw new Error('homeHubIcao must be a 3–4 letter ICAO');
    }
    const recruiting = opts.recruiting !== false;
    const memberRouteCutPct = clampMemberRouteCutPct(
      opts.memberRouteCutPct ?? VA_MEMBER_ROUTE_CUT_DEFAULT_PCT,
    );
    await this.pool.query(
      `UPDATE companies SET display_name = $1, home_hub_icao = $2, recruiting = $3, va_listed = TRUE, member_route_cut_pct = $4 WHERE id = $5`,
      [displayName, homeHubIcao, recruiting, memberRouteCutPct, companyId],
    );
    return {
      companyId,
      displayName,
      homeHubIcao,
      recruiting,
      listed: true,
      memberRouteCutPct,
    };
  }

  async vaUnpublish(opts: {
    companyId: string;
    actorAccountId: string;
  }): Promise<{ companyId: string; listed: false; removedMembers: number }> {
    await this.ready;
    const companyId = opts.companyId.trim();
    if (!companyId) throw new Error('companyId required');
    const actor = await this.vaGetMembership(opts.actorAccountId, companyId);
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can unlist this VA');
    }
    if (!(await this.vaIsListed(companyId))) {
      throw new Error('Company is not listed as a VA');
    }
    const now = Date.now();
    await this.pool.query(
      `UPDATE company_join_requests
       SET status = 'rejected', decided_at_ms = $1, decided_by_account_id = $2
       WHERE company_id = $3 AND status = 'pending'`,
      [now, opts.actorAccountId, companyId],
    );
    await this.pool.query(
      `UPDATE company_invites
       SET expires_at_ms = $1
       WHERE company_id = $2 AND expires_at_ms > $1`,
      [now, companyId],
    );
    const removed = await this.pool.query(
      `DELETE FROM company_members
       WHERE company_id = $1 AND role <> 'owner'`,
      [companyId],
    );
    await this.pool.query(
      `UPDATE companies SET va_listed = FALSE, recruiting = FALSE WHERE id = $1`,
      [companyId],
    );
    return {
      companyId,
      listed: false,
      removedMembers: removed.rowCount ?? 0,
    };
  }

  async vaGetMemberRouteCutPct(companyId: string): Promise<number> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT member_route_cut_pct FROM companies WHERE id = $1`,
      [companyId],
    );
    if (!rows[0]) return VA_MEMBER_ROUTE_CUT_DEFAULT_PCT;
    return clampMemberRouteCutPct(rows[0].member_route_cut_pct);
  }

  async vaSetMemberRouteCutPct(opts: {
    companyId: string;
    actorAccountId: string;
    memberRouteCutPct: number;
  }): Promise<number> {
    await this.ready;
    const actor = await this.vaGetMembership(
      opts.actorAccountId,
      opts.companyId,
    );
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only owner can change member route cut');
    }
    const pct = clampMemberRouteCutPct(opts.memberRouteCutPct);
    await this.pool.query(
      `UPDATE companies SET member_route_cut_pct = $1 WHERE id = $2`,
      [pct, opts.companyId],
    );
    return pct;
  }

  async vaIsListed(companyId: string): Promise<boolean> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT va_listed FROM companies WHERE id = $1`,
      [companyId],
    );
    if (!rows[0]) return false;
    return Boolean(rows[0].va_listed);
  }

  async vaListedMembership(
    accountId: string,
  ): Promise<{ companyId: string; role: CareerCompanyMember['role'] } | null> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT m.company_id, m.role
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.account_id = $1 AND COALESCE(c.va_listed, false) = true
       ORDER BY m.created_at_ms ASC
       LIMIT 1`,
      [accountId],
    );
    const row = rows[0] as { company_id: string; role: string } | undefined;
    if (!row) return null;
    const role =
      row.role === 'owner' || row.role === 'dispatcher' || row.role === 'pilot'
        ? row.role
        : 'pilot';
    return { companyId: row.company_id, role };
  }

  async vaDirectory(opts?: {
    worldId?: string;
    accountId?: string;
    includeClosed?: boolean;
    limit?: number;
  }): Promise<VaDirectoryEntry[]> {
    await this.ready;
    const limit = Math.max(1, Math.min(100, opts?.limit ?? 50));
    const includeClosed = opts?.includeClosed === true;
    const worldId = opts?.worldId?.trim() || null;
    const { rows } = await this.pool.query(
      `SELECT c.id, c.display_name, c.home_hub_icao, c.recruiting, c.va_listed,
              c.member_route_cut_pct,
              (SELECT COUNT(*)::int FROM company_members m WHERE m.company_id = c.id) AS member_count,
              (SELECT COUNT(*)::int FROM fleet_aircraft f WHERE f.company_id = c.id) AS aircraft_count
       FROM companies c
       WHERE c.va_listed IS TRUE
         AND ($1::text IS NULL OR COALESCE(c.world_id, 'local') = $1)
         AND ($2::int = 1 OR c.recruiting IS TRUE)
       ORDER BY c.display_name ASC, c.id ASC
       LIMIT $3`,
      [worldId, includeClosed ? 1 : 0, limit],
    );
    const out: VaDirectoryEntry[] = [];
    for (const r of rows) {
      const memberCount = Number(r.member_count) || 0;
      const aircraftCount = Number(r.aircraft_count) || 0;
      const recruiting = Boolean(r.recruiting);
      let myRequestStatus: VaDirectoryEntry['myRequestStatus'] = null;
      let myRole: VaDirectoryEntry['myRole'] = null;
      if (opts?.accountId) {
        const membership = await this.vaGetMembership(
          opts.accountId,
          r.id as string,
        );
        if (membership) myRole = membership.role;
        const req = await this.pool.query(
          `SELECT status FROM company_join_requests
           WHERE company_id = $1 AND account_id = $2
           ORDER BY created_at_ms DESC LIMIT 1`,
          [r.id, opts.accountId],
        );
        const st = req.rows[0]?.status as string | undefined;
        if (st === 'pending' || st === 'accepted' || st === 'rejected') {
          myRequestStatus = st;
        }
      }
      out.push({
        companyId: r.id as string,
        displayName: (r.display_name as string) || (r.id as string),
        homeHubIcao: (r.home_hub_icao as string) || '',
        memberCount,
        memberCap: VA_MEMBER_CAP,
        aircraftCount,
        recruiting,
        listed: Boolean(r.va_listed),
        memberRouteCutPct: clampMemberRouteCutPct(r.member_route_cut_pct),
        seatsOpen: Math.max(0, VA_MEMBER_CAP - memberCount),
        myRequestStatus,
        myRole,
      });
    }
    return out;
  }

  async vaCreateJoinRequest(opts: {
    companyId: string;
    accountId: string;
  }): Promise<VaJoinRequestRow> {
    await this.ready;
    const companyId = opts.companyId.trim();
    if (!companyId) throw new Error('companyId required');
    if (await this.vaGetMembership(opts.accountId, companyId)) {
      throw new Error('Already a member of this company');
    }
    const otherVa = await this.pool.query(
      `SELECT m.company_id
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.account_id = $1
         AND COALESCE(c.va_listed, false) = true
         AND m.company_id <> $2
       LIMIT 1`,
      [opts.accountId, companyId],
    );
    if (otherVa.rows[0]) throw new Error(VA_ALREADY_IN_VA_MSG);
    if (!(await this.vaIsRecruiting(companyId))) {
      throw new Error('This company is not recruiting');
    }
    if (!(await this.vaIsListed(companyId))) {
      throw new Error('This company is not listed as a VA');
    }
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM company_members WHERE company_id = $1`,
      [companyId],
    );
    if ((countRes.rows[0]?.n as number) >= VA_MEMBER_CAP) {
      throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
    }
    const pending = await this.pool.query(
      `SELECT id FROM company_join_requests
       WHERE company_id = $1 AND account_id = $2 AND status = 'pending'`,
      [companyId, opts.accountId],
    );
    if (pending.rows[0]) throw new Error('Join request already pending');
    const now = Date.now();
    const id = `jr_${randomBytes(8).toString('hex')}`;
    await this.pool.query(
      `INSERT INTO company_join_requests
         (id, company_id, account_id, status, created_at_ms, decided_at_ms, decided_by_account_id)
       VALUES ($1, $2, $3, 'pending', $4, NULL, NULL)`,
      [id, companyId, opts.accountId, now],
    );
    const acc = await this.pool.query(
      `SELECT login_name, display_name FROM accounts WHERE id = $1`,
      [opts.accountId],
    );
    return {
      id,
      companyId,
      accountId: opts.accountId,
      loginName: (acc.rows[0]?.login_name as string) ?? '',
      displayName: (acc.rows[0]?.display_name as string) ?? '',
      status: 'pending',
      createdAtMs: now,
      decidedAtMs: null,
    };
  }

  async vaListJoinRequests(companyId: string): Promise<VaJoinRequestRow[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT r.id, r.company_id, r.account_id, r.status, r.created_at_ms, r.decided_at_ms,
              a.login_name, a.display_name
       FROM company_join_requests r
       JOIN accounts a ON a.id = r.account_id
       WHERE r.company_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at_ms ASC`,
      [companyId],
    );
    return rows.map((r) => ({
      id: r.id as string,
      companyId: r.company_id as string,
      accountId: r.account_id as string,
      loginName: r.login_name as string,
      displayName: r.display_name as string,
      status: 'pending' as const,
      createdAtMs: Number(r.created_at_ms) || 0,
      decidedAtMs: r.decided_at_ms != null ? Number(r.decided_at_ms) : null,
    }));
  }

  async vaAcceptJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }): Promise<{ member: CareerCompanyMember; companyId: string }> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, company_id, account_id, status FROM company_join_requests
         WHERE id = $1 FOR UPDATE`,
        [opts.requestId],
      );
      const row = rows[0] as
        | { id: string; company_id: string; account_id: string; status: string }
        | undefined;
      if (!row) throw new Error('Join request not found');
      if (row.status !== 'pending') throw new Error('Join request is not pending');
      const actor = await this.vaGetMembership(opts.actorAccountId, row.company_id);
      if (!actor || (actor.role !== 'owner' && actor.role !== 'dispatcher')) {
        throw new Error('Only owner or dispatcher can accept requests');
      }
      const now = Date.now();
      const existing = await this.vaGetMembership(row.account_id, row.company_id);
      let member: CareerCompanyMember;
      if (existing) {
        member = existing;
      } else {
        const otherVa = await client.query(
          `SELECT m.company_id
           FROM company_members m
           JOIN companies c ON c.id = m.company_id
           WHERE m.account_id = $1
             AND COALESCE(c.va_listed, false) = true
             AND m.company_id <> $2
           LIMIT 1`,
          [row.account_id, row.company_id],
        );
        if (otherVa.rows[0]) throw new Error(VA_ALREADY_IN_VA_MSG);
        const countRes = await client.query(
          `SELECT COUNT(*)::int AS n FROM company_members WHERE company_id = $1`,
          [row.company_id],
        );
        if ((countRes.rows[0]?.n as number) >= VA_MEMBER_CAP) {
          throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
        }
        member = await this.authAddCompanyMember({
          companyId: row.company_id,
          accountId: row.account_id,
          role: 'pilot',
        });
      }
      await client.query(
        `UPDATE company_join_requests
         SET status = 'accepted', decided_at_ms = $1, decided_by_account_id = $2
         WHERE id = $3`,
        [now, opts.actorAccountId, row.id],
      );
      await client.query('COMMIT');
      return { member, companyId: row.company_id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async vaRejectJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }): Promise<void> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT id, company_id, status FROM company_join_requests WHERE id = $1`,
      [opts.requestId],
    );
    const row = rows[0] as
      | { id: string; company_id: string; status: string }
      | undefined;
    if (!row) throw new Error('Join request not found');
    if (row.status !== 'pending') throw new Error('Join request is not pending');
    const actor = await this.vaGetMembership(opts.actorAccountId, row.company_id);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'dispatcher')) {
      throw new Error('Only owner or dispatcher can reject requests');
    }
    await this.pool.query(
      `UPDATE company_join_requests
       SET status = 'rejected', decided_at_ms = $1, decided_by_account_id = $2
       WHERE id = $3`,
      [Date.now(), opts.actorAccountId, row.id],
    );
  }

  private async listMemberships(accountId: string): Promise<CareerCompanyMember[]> {

    const { rows } = await this.pool.query(
      `SELECT company_id, account_id, role, created_at_ms
       FROM company_members WHERE account_id = $1`,
      [accountId],
    );
    return rows.map((r) => ({
      companyId: r.company_id as string,
      accountId: r.account_id as string,
      role: r.role as CareerCompanyMember['role'],
      createdAtMs: Number(r.created_at_ms) || 0,
    }));
  }

  peekEconomyWorld(): CareerEconomyWorld | null {
    return this.ram;
  }

  async readEconomyMiscField(key: string): Promise<unknown> {
    await this.ready;
    const field = key.trim();
    if (!field) return undefined;
    const { rows } = await this.pool.query<{ value: unknown }>(
      `SELECT misc_json -> $2 AS value
       FROM economy_meta
       WHERE world_id = $1`,
      [LOCAL_WORLD_ID, field],
    );
    return rows[0]?.value;
  }

  loadCommandWorldSlice(_opts: CommandWorldSliceOpts): CareerEconomyWorld | null {
    return this.ram;
  }

  async persistCommandWorldSlice(
    world: CareerEconomyWorld,
    _opts: PersistCommandWorldSliceOpts,
  ): Promise<void> {
    await this.saveEconomy(world);
  }

  readAirportInventory(icao: string): AirportInventorySnapshot | null {
    const world = this.ram;
    if (!world) return null;
    const code = icao.trim().toUpperCase();
    const airport = world.airports.find((a) => a.icao === code);
    if (!airport) return null;
    return {
      worldId: LOCAL_WORLD_ID,
      meta: {
        worldId: LOCAL_WORLD_ID,
        seed: world.seed,
        tick: world.tick,
        lastBatchAtMs: world.lastBatchAtMs,
        homeCountryId: world.homeCountryId ?? '',
      },
      airport,
    };
  }

  readAirportBoard(icao: string): AirportBoardSnapshot | null {
    const world = this.ram;
    if (!world) return null;
    const code = icao.trim().toUpperCase();
    const airport = world.airports.find((a) => a.icao === code);
    if (!airport) return null;
    const lots = (world.lots ?? []).filter(
      (lot) =>
        (lot.originIcao === code || lot.destIcao === code) &&
        (lot.status === 'available' ||
          lot.status === 'reserved' ||
          lot.status === 'in_transit'),
    );
    const partnerIcaos = lots
      .flatMap((l) => [l.originIcao, l.destIcao])
      .filter((c) => c !== code);
    const relatedAirports = world.airports.filter((a) =>
      partnerIcaos.includes(a.icao),
    );
    return {
      worldId: LOCAL_WORLD_ID,
      meta: {
        worldId: LOCAL_WORLD_ID,
        seed: world.seed,
        tick: world.tick,
        lastBatchAtMs: world.lastBatchAtMs,
        homeCountryId: world.homeCountryId ?? '',
      },
      airport,
      lots,
      relatedAirports,
    };
  }

  async loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult> {
    await this.ready;
    const coldLoad = this.ram === null;
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      const revisionRes = await this.pool.query(
        `SELECT revision FROM economy_meta WHERE world_id = $1`,
        [LOCAL_WORLD_ID],
      );
      const databaseRevision = pgRevision(revisionRes.rows[0]?.revision);
      if (this.ramRevision === databaseRevision) {
        return {
          world: this.ram,
          advancedTicks: 0,
          settledFlights: 0,
          dirty: false,
        };
      }
    }

    const client = await this.pool.connect();
    let meta:
      | {
          seed: string;
          tick: number;
          last_batch_at_ms: string | number;
          home_country_id: string;
          misc_json: unknown;
          revision: string | number;
        }
      | undefined;
    let counts: { airports: number; lots: number; npcs: number } | undefined;
    let hydrated: CareerEconomyWorld | null = null;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const metaRes = await client.query(
        `SELECT seed, tick, last_batch_at_ms, home_country_id, misc_json, revision
         FROM economy_meta WHERE world_id = $1`,
        [LOCAL_WORLD_ID],
      );
      meta = metaRes.rows[0] as typeof meta;
      const countRes = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM airports WHERE world_id = $1) AS airports,
           (SELECT COUNT(*)::int FROM lots WHERE world_id = $1) AS lots,
           (SELECT COUNT(*)::int FROM npcs WHERE world_id = $1) AS npcs`,
        [LOCAL_WORLD_ID],
      );
      counts = countRes.rows[0] as typeof counts;
      const hasRelational =
        Boolean(meta) ||
        Number(counts?.airports) > 0 ||
        Number(counts?.lots) > 0 ||
        Number(counts?.npcs) > 0;
      if (hasRelational) {
        hydrated = emptyPgEconomyShell(
          meta
            ? {
                seed: meta.seed,
                tick: Number(meta.tick) || 0,
                lastBatchAtMs: Number(meta.last_batch_at_ms) || Date.now(),
                homeCountryId: meta.home_country_id ?? '',
              }
            : {
                seed: 'skyline-career-br-v1',
                tick: 0,
                lastBatchAtMs: Date.now(),
                homeCountryId: '',
              },
        );
        await hydrateEconomyFromPg(client, hydrated, LOCAL_WORLD_ID);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (hydrated) {
      const { world: caught, advancedTicks, settledFlights } =
        ensureEconomyCaughtUp(hydrated, Date.now(), catchUpOpts(opts));
      ensureHomeCountryId(caught);
      let dirty = advancedTicks > 0 || settledFlights > 0;
      // Migration/backfill belongs to process cold-open only. Re-running these
      // repair probes after every cross-process revision can create a write
      // ping-pong between API and worker.
      if (coldLoad) {
        if (ensureSeedMarketFormed(caught)) dirty = true;
        if (await economyNeedsPgTableBackfill(this.pool, caught, LOCAL_WORLD_ID)) {
          dirty = true;
        }
        if (isPgEconomyMiscEmpty(meta?.misc_json)) {
          // Schema bump: persist leftover fields into misc_json once.
          dirty = true;
        }
      }
      this.ram = caught;
      this.ramRevision = pgRevision(meta?.revision);
      if (dirty) await this.saveEconomy(caught);
      return { world: caught, advancedTicks, settledFlights, dirty };
    }

    assertCareerWorldSeedAllowed(false);
    const fresh = createSeedEconomyWorld();
    ensureSeedMarketFormed(fresh);
    await this.saveEconomy(fresh);
    this.ram = fresh;
    return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
  }

  async saveEconomy(
    world: CareerEconomyWorld,
    _opts?: { liveTables?: boolean },
  ): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    if (
      (!toSave.pendingHubEconomySamples ||
        toSave.pendingHubEconomySamples.length === 0) &&
      world.pendingHubEconomySamples?.length
    ) {
      toSave.pendingHubEconomySamples = world.pendingHubEconomySamples;
    }
    ensureHomeCountryId(toSave);
    await this.persistRevisioned(
      (expected) =>
        persistEconomyTablesToPg(
          this.pool,
          toSave,
          LOCAL_WORLD_ID,
          expected,
        ),
      () => {
        this.ram = toSave;
        world.pendingHubEconomySamples = undefined;
      },
    );
  }

  async persistDemandOrder(order: DemandOrder): Promise<void> {
    await this.ready;
    await this.persistRevisioned(
      (expected) =>
        persistDemandOrderToPg(this.pool, order, LOCAL_WORLD_ID, expected),
      () => {
        if (!this.ram?.demandOrders) return;
        const i = this.ram.demandOrders.findIndex((o) => o.id === order.id);
        if (i >= 0) this.ram.demandOrders[i] = order;
        else this.ram.demandOrders.push(order);
      },
    );
  }
  async persistPortListing(listing: PortListing): Promise<void> {
    await this.ready;
    await this.persistRevisioned(
      (expected) =>
        persistPortListingToPg(this.pool, listing, LOCAL_WORLD_ID, expected),
      () => {
        if (!this.ram?.portListings) return;
        const i = this.ram.portListings.findIndex((l) => l.id === listing.id);
        if (i >= 0) this.ram.portListings[i] = listing;
        else this.ram.portListings.push(listing);
      },
    );
  }
  async persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void> {
    await this.ready;
    await this.persistRevisioned(
      (expected) =>
        persistPortConcessionsToPg(this.pool, rows, LOCAL_WORLD_ID, expected),
      () => {
        if (this.ram) this.ram.portConcessions = rows;
      },
    );
  }
  async persistPortMarketTables(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    await this.persistRevisioned(
      (expected) =>
        persistPortMarketToPg(this.pool, toSave, LOCAL_WORLD_ID, expected),
      () => {
        this.ram = this.ram
          ? {
              ...this.ram,
              portListings: toSave.portListings ?? [],
              portInventories: toSave.portInventories ?? [],
              portConcessions: toSave.portConcessions ?? [],
            }
          : toSave;
      },
    );
  }
  async persistDemandBoardTables(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    await this.persistRevisioned(
      (expected) =>
        persistDemandBoardToPg(this.pool, toSave, LOCAL_WORLD_ID, expected),
      () => {
        this.ram = this.ram
          ? { ...this.ram, demandOrders: toSave.demandOrders ?? [] }
          : toSave;
      },
    );
  }
  async persistInboundPending(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    await this.persistRevisioned(
      (expected) =>
        persistInboundPendingToPg(this.pool, toSave, LOCAL_WORLD_ID, expected),
      () => {
        this.ram = this.ram
          ? { ...this.ram, inboundPending: toSave.inboundPending ?? [] }
          : toSave;
      },
    );
  }
  async persistNpcLiveWorld(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    if (
      (!toSave.pendingHubEconomySamples ||
        toSave.pendingHubEconomySamples.length === 0) &&
      world.pendingHubEconomySamples?.length
    ) {
      toSave.pendingHubEconomySamples = world.pendingHubEconomySamples;
    }
    ensureHomeCountryId(toSave);
    await this.persistRevisioned(
      (expected) =>
        persistNpcLiveToPg(this.pool, toSave, LOCAL_WORLD_ID, expected),
      () => {
        this.ram = toSave;
        world.pendingHubEconomySamples = undefined;
      },
    );
  }
  async persistAircraftPool(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    await this.persistRevisioned(
      (expected) =>
        persistAircraftPoolToPg(this.pool, toSave, LOCAL_WORLD_ID, expected),
      () => {
        this.ram = this.ram
          ? {
              ...this.ram,
              aircraftInstances: toSave.aircraftInstances ?? [],
            }
          : toSave;
      },
    );
  }

  async claimAircraftInstance(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<'claimed' | 'unavailable'> {
    await this.ready;
    const result = await claimAircraftInstanceInPg(this.pool, {
      ...opts,
      // Don't CAS against ramRevision — pulse may bump between peek and claim;
      // instance FOR UPDATE is the real exclusivity guard.
    });
    // Claim bumps revision outside persistRevisioned — refresh local CAS.
    try {
      const rev = await this.pool.query(
        `SELECT revision FROM economy_meta WHERE world_id = $1`,
        [LOCAL_WORLD_ID],
      );
      if (rev.rows[0]?.revision != null) {
        this.ramRevision = BigInt(rev.rows[0].revision);
      }
    } catch {
      this.ramRevision = null;
    }
    if (result === 'claimed' && this.ram?.aircraftInstances) {
      const inst = this.ram.aircraftInstances.find(
        (row) => row.id === opts.instanceId.trim(),
      );
      if (inst) {
        inst.status = 'sold';
        inst.ownerCompanyId = opts.companyId.trim();
      }
    }
    return result;
  }

  async releaseAircraftInstanceClaim(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<boolean> {
    await this.ready;
    const ok = await releaseAircraftInstanceClaimInPg(this.pool, {
      ...opts,
    });
    try {
      const rev = await this.pool.query(
        `SELECT revision FROM economy_meta WHERE world_id = $1`,
        [LOCAL_WORLD_ID],
      );
      if (rev.rows[0]?.revision != null) {
        this.ramRevision = BigInt(rev.rows[0].revision);
      }
    } catch {
      this.ramRevision = null;
    }
    if (ok && this.ram?.aircraftInstances) {
      const inst = this.ram.aircraftInstances.find(
        (row) => row.id === opts.instanceId.trim(),
      );
      if (inst) {
        inst.status = 'available';
        delete inst.ownerCompanyId;
      }
    }
    return ok;
  }

  async settleWorldCompaniesPassiveFees(opts: {
    world: CareerEconomyWorld;
    fromTick: number;
    toTick: number;
    worldId?: string;
    nowMs?: number;
  }): Promise<OfflineFeeSummary | null> {
    await this.ready;
    const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
    const companies = await this.listWorldCompanies(worldId);
    if (companies.length === 0) return null;
    const nowMs = opts.nowMs ?? Date.now();
    let preferred: OfflineFeeSummary | null = null;
    let first: OfflineFeeSummary | null = null;
    for (const company of companies) {
      const missions = await this.loadMissions({ companyId: company.id });
      const fromTick = companySessionFromTick(
        missions,
        opts.fromTick,
        opts.toTick,
      );
      const summary = settleCompanyPassiveFeesForTickRange(
        missions,
        opts.world,
        fromTick,
        opts.toTick,
        nowMs,
      );
      missions.lastSeenTick = Math.max(0, Math.floor(opts.toTick));
      await this.saveMissions(missions, { companyId: company.id });
      if (summary) {
        if (!first) first = summary;
        if (company.id === this.activeCompanyId) preferred = summary;
      }
    }
    return preferred ?? first;
  }

  readHubEconomySamples(opts: {
    icao: string;
    sinceDay?: number;
  }): Promise<HubEconomySample[]> {
    return this.ready.then(() =>
      readHubEconomySamplesFromPg(this.pool, {
        icao: opts.icao,
        sinceDay: opts.sinceDay,
        worldId: LOCAL_WORLD_ID,
      }),
    );
  }

  readHubEconomySamplesSince(opts?: {
    sinceDay?: number;
    untilDay?: number;
  }): Promise<HubEconomySample[]> {
    return this.ready.then(() =>
      readHubEconomySamplesSinceFromPg(this.pool, {
        sinceDay: opts?.sinceDay,
        untilDay: opts?.untilDay,
        worldId: LOCAL_WORLD_ID,
      }),
    );
  }

  async loadMissions(opts?: { companyId?: string }): Promise<CareerMissionsState> {
    await this.ready;
    const companyId = (opts?.companyId ?? this.activeCompanyId).trim() || LOCAL_COMPANY_ID;
    const fromTables = await hydrateMissionsFromPg(
      this.pool,
      companyId,
      emptyMissionsStateV2(),
    );
    // Persist hubSelected heal (companies.home_hub set but flag cleared).
    if (fromTables.hubSelected && fromTables.homeHubIcao?.trim()) {
      const flag = await this.pool.query(
        `SELECT hub_selected FROM company_state WHERE company_id = $1`,
        [companyId],
      );
      if (flag.rows[0] && flag.rows[0].hub_selected === false) {
        await this.saveMissions(fromTables, { companyId });
      }
    }
    return fromTables;
  }

  async saveMissions(
    state: CareerMissionsState,
    opts?: { companyId?: string },
  ): Promise<void> {
    await this.ready;
    const companyId = (opts?.companyId ?? this.activeCompanyId).trim() || LOCAL_COMPANY_ID;
    const payload = normalizeMissions(state as unknown as Record<string, unknown>);
    await persistMissionsTablesToPg(this.pool, payload, companyId);
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const missions = await this.loadMissions();
    return missions.ledger ?? [];
  }

  async summarizeCashflow(atTick: number): Promise<{
    week: CareerLedgerSummary;
    month: CareerLedgerSummary;
    allTime: CareerLedgerSummary;
    recent: CareerLedgerEntry[];
  }> {
    const missions = await this.loadMissions();
    return summarizeCareerLedger(missions, atTick);
  }

  close(): void {
    const lease = this.writerLeaseClient;
    this.writerLeaseClient = null;
    if (!lease) {
      void this.pool.end();
      return;
    }
    void lease
      .query(`SELECT pg_advisory_unlock($1)`, [
        CAREER_PG_WORLD_WRITER_LOCK_KEY,
      ])
      .catch(() => undefined)
      .finally(() => {
        lease.release();
        void this.pool.end();
      });
  }
}

export async function openPostgresCareerStore(
  connectionString: string,
): Promise<PostgresCareerStore> {
  const store = new PostgresCareerStore(connectionString);
  await store.init();
  return store;
}

/** Fingerprint helper kept for debugging connections. */
export function careerPgConnectionLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
  } catch {
    return createHash('sha1').update(url).digest('hex').slice(0, 8);
  }
}
