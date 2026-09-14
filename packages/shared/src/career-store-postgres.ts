/**
 * MP Postgres career store (lab / hosted world).
 * Auth + companies relational; economy hot slices in tables (see career-store-pg-world);
 * economy_json is a thin stub after stripPgEconomyBlob.
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
  ensurePgWorldDdl,
  economyNeedsPgTableBackfill,
  hydrateEconomyFromPg,
  hydrateMissionsFromPg,
  persistEconomyTablesToPg,
  persistMissionsTablesToPg,
  stripPgEconomyBlob,
} from './career-store-pg-world.js';

const CAREER_PG_SCHEMA_VERSION = '12';
const { Pool } = pg;

export const DEFAULT_CAREER_DATABASE_URL =
  'postgres://skyline:skyline@127.0.0.1:5432/skyline';

export function careerDatabaseUrlFromEnv(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): string | null {
  const url = (env.CAREER_DATABASE_URL ?? '').trim();
  if (url) return url;
  const flag = (env.CAREER_PG ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') {
    return DEFAULT_CAREER_DATABASE_URL;
  }
  return null;
}

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

const PG_DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS economy_json (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS company_missions (
  company_id TEXT PRIMARY KEY NOT NULL,
  payload JSONB NOT NULL
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
    const { rows } = await this.pool.query(
      `SELECT payload FROM economy_json WHERE id = 1`,
    );
    const existing = rows[0]?.payload as Record<string, unknown> | undefined;
    if (existing) {
      const world = migrateEconomyWorld(existing);
      // Prefer relational tables when present; fall back to fat blob (phase-1).
      await hydrateEconomyFromPg(this.pool, world, LOCAL_WORLD_ID);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
        world,
        Date.now(),
        catchUpOpts(opts),
      );
      ensureHomeCountryId(caught);
      let dirty = advancedTicks > 0 || settledFlights > 0;
      if (ensureSeedMarketFormed(caught)) dirty = true;
      // One-shot: fat blob still has airports[] → rewrite as tables + thin stub.
      const fatBlob =
        Array.isArray(existing.airports) && existing.airports.length > 0;
      if (fatBlob) dirty = true;
      // Schema upgrade / thin stub: RAM has ops/pool but tables never filled.
      if (await economyNeedsPgTableBackfill(this.pool, caught, LOCAL_WORLD_ID)) {
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
    const thin = stripPgEconomyBlob(toSave);
    await this.pool.query(
      `INSERT INTO economy_json (id, payload) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
      [JSON.stringify(thin)],
    );
  }

  async persistDemandOrder(_order: DemandOrder): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistPortListing(_listing: PortListing): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistPortConcessionIndex(_rows: PortConcessionIndexRow[]): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistPortMarketTables(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistDemandBoardTables(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistInboundPending(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistNpcLiveWorld(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }
  async persistAircraftPool(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
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
    const { rows } = await this.pool.query(
      `SELECT payload FROM company_missions WHERE company_id = $1`,
      [companyId],
    );
    const existing = rows[0]?.payload as Record<string, unknown> | undefined;
    const blobFallback =
      existing && Array.isArray(existing.missions)
        ? normalizeMissions(existing)
        : emptyMissionsStateV2();
    const fromTables = await hydrateMissionsFromPg(
      this.pool,
      companyId,
      blobFallback,
    );
    // One-shot migrate fat company_missions → tables.
    if (
      existing &&
      ((Array.isArray(existing.missions) && existing.missions.length > 0) ||
        (Array.isArray(existing.fleet) && existing.fleet.length > 0))
    ) {
      const stateCount = await this.pool.query(
        `SELECT 1 AS ok FROM company_state WHERE company_id = $1`,
        [companyId],
      );
      if (!stateCount.rows[0]) {
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
    // Thin stub only (missions/fleet/ledger empty) for legacy readers.
    const stub = {
      ...payload,
      missions: [],
      fleet: [],
      ledger: [],
    };
    await this.pool.query(
      `INSERT INTO company_missions (company_id, payload) VALUES ($1, $2::jsonb)
       ON CONFLICT (company_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [companyId, JSON.stringify(stub)],
    );
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
