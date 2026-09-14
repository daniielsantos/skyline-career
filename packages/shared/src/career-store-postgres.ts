/**
 * MP Postgres career store (lab / hosted world).
 * Auth + companies relational; economy SoT is relational tables +
 * economy_meta.misc_json (see career-store-pg-world).
 * Schema v16 promotes fleet_aircraft payload fields to columns.
 * Schema v15 drops legacy stubs `economy_json` + `company_missions`.
 * SP stays on SQLite files — this backend is for CAREER_DATABASE_URL only.
 */

import pg from 'pg';
import {
  AUTH_SESSION_TTL_MS,
  hashPassword,
  hashSessionToken,
  mintSessionToken,
  verifyPassword,
  type AuthSessionContext,
  type CareerAccount,
  type CareerAccountSession,
  type CareerCompanyMember,
  type LoginAccountOpts,
  type RegisterAccountOpts,
  type RegisterAccountResult,
} from './career-auth.js';
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
  companySessionFromTick,
  settleCompanyPassiveFeesForTickRange,
} from './career-company-session.js';
import type { OfflineFeeSummary } from './career-offline-fees.js';

export {
  careerDatabaseUrlFromEnv,
  careerTestDatabaseUrlFromEnv,
  DEFAULT_CAREER_DATABASE_URL,
  DEFAULT_CAREER_TEST_DATABASE_URL,
  isCareerLabDatabaseUrl,
} from './career-database-url.js';

const CAREER_PG_SCHEMA_VERSION = '16';
const { Pool } = pg;

function catchUpOpts(opts?: { maxCatchUpTicks?: number }) {
  return { maxTicks: opts?.maxCatchUpTicks ?? MAX_LOAD_CATCH_UP_TICKS };
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
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.ready = this.ensureSchema();
  }

  /** Wait until DDL is applied (call after open). */
  async init(): Promise<void> {
    await this.ready;
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
  }

  getActiveCompanyId(): string {
    return this.activeCompanyId;
  }

  setActiveCompanyId(companyId: string): void {
    this.activeCompanyId = companyId.trim() || LOCAL_COMPANY_ID;
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
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      return {
        world: this.ram,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }

    const metaRes = await this.pool.query(
      `SELECT seed, tick, last_batch_at_ms, home_country_id, misc_json
       FROM economy_meta WHERE world_id = $1`,
      [LOCAL_WORLD_ID],
    );
    const meta = metaRes.rows[0] as
      | {
          seed: string;
          tick: number;
          last_batch_at_ms: string | number;
          home_country_id: string;
          misc_json: unknown;
        }
      | undefined;

    const countRes = await this.pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM airports WHERE world_id = $1) AS airports,
         (SELECT COUNT(*)::int FROM lots WHERE world_id = $1) AS lots,
         (SELECT COUNT(*)::int FROM npcs WHERE world_id = $1) AS npcs`,
      [LOCAL_WORLD_ID],
    );
    const counts = countRes.rows[0] as
      | { airports: number; lots: number; npcs: number }
      | undefined;
    const hasRelational =
      Boolean(meta) ||
      Number(counts?.airports) > 0 ||
      Number(counts?.lots) > 0 ||
      Number(counts?.npcs) > 0;

    if (hasRelational) {
      const world = emptyPgEconomyShell(
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
      await hydrateEconomyFromPg(this.pool, world, LOCAL_WORLD_ID);
      const { world: caught, advancedTicks, settledFlights } =
        ensureEconomyCaughtUp(world, Date.now(), catchUpOpts(opts));
      ensureHomeCountryId(caught);
      let dirty = advancedTicks > 0 || settledFlights > 0;
      if (ensureSeedMarketFormed(caught)) dirty = true;
      if (await economyNeedsPgTableBackfill(this.pool, caught, LOCAL_WORLD_ID)) {
        dirty = true;
      }
      if (isPgEconomyMiscEmpty(meta?.misc_json)) {
        // Schema bump: persist leftover fields into misc_json once.
        dirty = true;
      }
      this.ram = caught;
      if (dirty) await this.saveEconomy(caught);
      return { world: caught, advancedTicks, settledFlights, dirty };
    }

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
    ensureHomeCountryId(toSave);
    this.ram = toSave;
    await persistEconomyTablesToPg(this.pool, toSave, LOCAL_WORLD_ID);
  }

  async persistDemandOrder(order: DemandOrder): Promise<void> {
    await this.ready;
    if (this.ram?.demandOrders) {
      const i = this.ram.demandOrders.findIndex((o) => o.id === order.id);
      if (i >= 0) this.ram.demandOrders[i] = order;
      else this.ram.demandOrders.push(order);
    }
    await persistDemandOrderToPg(this.pool, order, LOCAL_WORLD_ID);
  }
  async persistPortListing(listing: PortListing): Promise<void> {
    await this.ready;
    if (this.ram?.portListings) {
      const i = this.ram.portListings.findIndex((l) => l.id === listing.id);
      if (i >= 0) this.ram.portListings[i] = listing;
      else this.ram.portListings.push(listing);
    }
    await persistPortListingToPg(this.pool, listing, LOCAL_WORLD_ID);
  }
  async persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void> {
    await this.ready;
    if (this.ram) this.ram.portConcessions = rows;
    await persistPortConcessionsToPg(this.pool, rows, LOCAL_WORLD_ID);
  }
  async persistPortMarketTables(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    if (this.ram) {
      this.ram = {
        ...this.ram,
        portListings: toSave.portListings ?? [],
        portInventories: toSave.portInventories ?? [],
      };
    } else {
      this.ram = toSave;
    }
    await persistPortMarketToPg(this.pool, toSave, LOCAL_WORLD_ID);
  }
  async persistDemandBoardTables(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    if (this.ram) {
      this.ram = {
        ...this.ram,
        demandOrders: toSave.demandOrders ?? [],
      };
    } else {
      this.ram = toSave;
    }
    await persistDemandBoardToPg(this.pool, toSave, LOCAL_WORLD_ID);
  }
  async persistInboundPending(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    if (this.ram) {
      this.ram = {
        ...this.ram,
        inboundPending: toSave.inboundPending ?? [],
      };
    } else {
      this.ram = toSave;
    }
    await persistInboundPendingToPg(this.pool, toSave, LOCAL_WORLD_ID);
  }
  async persistNpcLiveWorld(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    this.ram = toSave;
    await persistNpcLiveToPg(this.pool, toSave, LOCAL_WORLD_ID);
  }
  async persistAircraftPool(world: CareerEconomyWorld): Promise<void> {
    await this.ready;
    const toSave = migrateEconomyWorld(world);
    if (this.ram) {
      this.ram = {
        ...this.ram,
        aircraftInstances: toSave.aircraftInstances ?? [],
      };
    } else {
      this.ram = toSave;
    }
    await persistAircraftPoolToPg(this.pool, toSave, LOCAL_WORLD_ID);
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

  readHubEconomySamples(_opts: {
    icao: string;
    sinceDay?: number;
  }): HubEconomySample[] {
    return [];
  }

  readHubEconomySamplesSince(_opts?: {
    sinceDay?: number;
    untilDay?: number;
  }): HubEconomySample[] {
    return [];
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
    void this.pool.end();
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
