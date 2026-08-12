/**
 * Career save facade — JSON or embedded SQLite (default).
 * Simulation still runs on in-memory CareerEconomyWorld; this is I/O only.
 */

import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createSeedEconomyWorld,
  ensureEconomyCaughtUp,
  ensureSeedMarketFormed,
  migrateEconomyWorld,
} from './career-economy.js';
import {
  clHubIdentRemapsForPlayer,
  rewriteCareerIcaoFields,
} from './career-cl-hubs.js';
import { emptyMissionsStateV2, normalizeMissionsState } from './career-fleet.js';
import { normalizeMissionIntent } from './career-mission.js';
import { readJsonFile, renameJsonAside, writeJsonFileAtomic } from './career-json-io.js';
import {
  summarizeCareerLedger,
  type CareerLedgerSummary,
} from './career-ledger.js';
import { ensureHomeCountryId } from './career-partition.js';
import {
  assembleMissionsFromTables,
  companyTablesPopulated,
  countLotsRows,
  economyBlobHasHotArrays,
  ensureLocalCompany,
  ensureV3Ddl,
  hydrateWorldFromTables,
  migrateV2toV3IfNeeded,
  missionsBlobStub,
  persistCompanyTables,
  persistWorldLiveTables,
  readLedgerRowsV3,
  replaceLedgerV3,
  stripEconomyHotArrays,
} from './career-store-v3.js';
import type {
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerMissionsState,
} from './types/career-economy.js';

export type CareerStoreKind = 'json' | 'sqlite';

/** Bumped when DDL changes; existing DBs upgrade via ensureSqliteSchema. */
export const CAREER_STORE_SCHEMA_VERSION = '3';

export type EconomyLoadResult = {
  world: CareerEconomyWorld;
  /** Hours advanced by wall-clock catch-up during this load. */
  advancedTicks: number;
  settledFlights: number;
  /** True when migrate/catch-up changed the world and it should be persisted. */
  dirty: boolean;
};

export interface CareerStore {
  readonly kind: CareerStoreKind;
  readonly sqlitePath?: string;
  loadEconomy(): Promise<EconomyLoadResult>;
  saveEconomy(world: CareerEconomyWorld): Promise<void>;
  loadMissions(): Promise<CareerMissionsState>;
  saveMissions(state: CareerMissionsState): Promise<void>;
  /** Ledger rows (materialized in SQLite; from missions blob for JSON). */
  loadLedger(): Promise<CareerLedgerEntry[]>;
  summarizeCashflow(atTick: number): Promise<{
    week: CareerLedgerSummary;
    month: CareerLedgerSummary;
    allTime: CareerLedgerSummary;
    recent: CareerLedgerEntry[];
  }>;
  close(): void;
}

export type OpenCareerStoreOpts = {
  careerDir: string;
  /** Force backend. Default: sqlite (migrate from JSON when present). */
  backend?: CareerStoreKind | 'auto';
  economyFileName?: string;
  missionsFileName?: string;
  sqliteFileName?: string;
};

function economyNeedsRewrite(
  existing: Record<string, unknown>,
  caught: CareerEconomyWorld,
  advancedTicks: number,
  settledFlights: number,
): boolean {
  const npcCountBefore = Array.isArray(existing.npcs) ? existing.npcs.length : 0;
  const trucksBefore = Array.isArray(existing.fuelTrucks)
    ? existing.fuelTrucks.length
    : 0;
  const airportsBefore = Array.isArray(existing.airports) ? existing.airports.length : 0;
  const hubLevelSigBefore = Array.isArray(existing.airports)
    ? (existing.airports as Array<{ level?: number; levelXp?: number; levelCurveVersion?: number }>)
        .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
        .join('|')
    : '';
  const npcRegionsBefore = Array.isArray(existing.npcs)
    ? (existing.npcs as Array<{ homeRegion?: string }>)
        .map((npc) => npc.homeRegion ?? '')
        .join('|')
    : '';
  const missingHubTiers = Array.isArray(existing.airports)
    ? (existing.airports as Array<{ hubTier?: string }>).some((ap) => !ap.hubTier)
    : false;
  const missingHomeCountry = !(existing as { homeCountryId?: string }).homeCountryId;
  const version = (existing as { version?: number }).version;

  const hubLevelSigAfter = (caught.airports ?? [])
    .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
    .join('|');
  const npcRegionsAfter = (caught.npcs ?? []).map((npc) => npc.homeRegion ?? '').join('|');

  return (
    advancedTicks > 0 ||
    settledFlights > 0 ||
    version !== 3 ||
    caught.npcs.length !== npcCountBefore ||
    (caught.fuelTrucks?.length ?? 0) !== trucksBefore ||
    caught.airports.length !== airportsBefore ||
    npcRegionsAfter !== npcRegionsBefore ||
    hubLevelSigAfter !== hubLevelSigBefore ||
    missingHubTiers ||
    missingHomeCountry ||
    economyBlobHasHotArrays(existing)
  );
}

function normalizeMissions(raw: Record<string, unknown>): CareerMissionsState {
  const normalized = normalizeMissionsState(raw);
  normalized.missions = normalized.missions.map((m) => normalizeMissionIntent(m));
  return normalized;
}

function missionsPayloadForBlob(state: CareerMissionsState): CareerMissionsState {
  return normalizeMissions(state as unknown as Record<string, unknown>);
}

function airportIcaoList(raw: { airports?: Array<{ icao?: string }> }): string[] {
  return (raw.airports ?? [])
    .map((airport) => String(airport.icao ?? '').trim().toUpperCase())
    .filter(Boolean);
}

async function persistClHubIdentRemaps(
  store: {
    loadMissions(): Promise<CareerMissionsState>;
    saveMissions(state: CareerMissionsState): Promise<void>;
  },
  beforeIcaos: string[],
  afterIcaos: string[],
): Promise<void> {
  const remaps = clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos);
  if (remaps.length === 0) return;
  try {
    const missions = await store.loadMissions();
    for (const [from, to] of remaps) rewriteCareerIcaoFields(missions, from, to);
    await store.saveMissions(missions);
  } catch {
    /* missions file may not exist yet on a fresh economy */
  }
}

// ─── JSON store ─────────────────────────────────────────────────────────────

class JsonCareerStore implements CareerStore {
  readonly kind = 'json' as const;
  constructor(
    private readonly economyPath: string,
    private readonly missionsPath: string,
  ) {}

  async loadEconomy(): Promise<EconomyLoadResult> {
    const existing = await readJsonFile<Record<string, unknown>>(this.economyPath);
    if (existing && Array.isArray(existing.airports)) {
      const beforeIcaos = airportIcaoList(existing);
      const world = migrateEconomyWorld(existing);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
      ensureHomeCountryId(caught);
      const afterIcaos = airportIcaoList(caught);
      let dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
      if (ensureSeedMarketFormed(caught)) dirty = true;
      if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
      await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
      return { world: caught, advancedTicks, settledFlights, dirty };
    }
    if (existing) {
      throw new Error(
        `Save at ${this.economyPath} has no airports[]; refusing to overwrite it with a fresh world`,
      );
    }
    const fresh = createSeedEconomyWorld();
    ensureSeedMarketFormed(fresh);
    await this.saveEconomy(fresh);
    return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
  }

  async saveEconomy(world: CareerEconomyWorld): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    await writeJsonFileAtomic(this.economyPath, toSave);
  }

  async loadMissions(): Promise<CareerMissionsState> {
    const existing = await readJsonFile<Record<string, unknown>>(this.missionsPath);
    if (existing && Array.isArray(existing.missions)) {
      const normalized = normalizeMissions(existing);
      if (
        existing.version !== 2 ||
        !Array.isArray((existing as { fleet?: unknown }).fleet)
      ) {
        await this.saveMissions(normalized);
      }
      return normalized;
    }
    if (existing) {
      throw new Error(
        `Save at ${this.missionsPath} has no missions[]; refusing to overwrite it with an empty career`,
      );
    }
    const fresh = emptyMissionsStateV2();
    await this.saveMissions(fresh);
    return fresh;
  }

  async saveMissions(state: CareerMissionsState): Promise<void> {
    await writeJsonFileAtomic(this.missionsPath, missionsPayloadForBlob(state));
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const missions = await this.loadMissions();
    return missions.ledger ?? [];
  }

  async summarizeCashflow(atTick: number) {
    const missions = await this.loadMissions();
    return summarizeCareerLedger(missions, atTick);
  }

  close(): void {
    /* no-op */
  }
}

// ─── SQLite store ───────────────────────────────────────────────────────────

type SqliteDb = DatabaseSync;

function runInTransaction(db: SqliteDb, fn: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function openSqliteDb(path: string): SqliteDb {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  ensureSqliteSchema(db);
  return db;
}

/** Create/upgrade DDL. Idempotent; bumps meta.schema_version to current. */
function ensureSqliteSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS economy_json (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS missions_json (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY NOT NULL,
      at_tick INTEGER NOT NULL,
      day_index INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      kind TEXT NOT NULL,
      note TEXT,
      aircraft_id TEXT,
      mission_id TEXT,
      icao TEXT
    );
    CREATE INDEX IF NOT EXISTS ledger_day_idx ON ledger(day_index);
    CREATE INDEX IF NOT EXISTS ledger_tick_idx ON ledger(at_tick);
    CREATE TABLE IF NOT EXISTS lots (
      id TEXT PRIMARY KEY NOT NULL,
      commodity_id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      quantity_kg INTEGER NOT NULL,
      reserved_kg INTEGER NOT NULL,
      created_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      pay_usd INTEGER NOT NULL,
      base_pay_usd INTEGER,
      urgency TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lots_status_idx ON lots(status);
    CREATE INDEX IF NOT EXISTS lots_od_idx ON lots(origin_icao, dest_icao);
    CREATE INDEX IF NOT EXISTS lots_expires_idx ON lots(expires_at_tick);
  `);

  ensureV3Ddl(db);

  const ver = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  if (!ver) {
    ensureLocalCompany(db);
    db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(
      CAREER_STORE_SCHEMA_VERSION,
    );
    return;
  }

  const current = Number.parseInt(ver.value, 10);
  if (!Number.isFinite(current) || current < 3) {
    migrateV2toV3IfNeeded(db, metaSet, CAREER_STORE_SCHEMA_VERSION);
  } else if (ver.value !== CAREER_STORE_SCHEMA_VERSION) {
    metaSet(db, 'schema_version', CAREER_STORE_SCHEMA_VERSION);
  } else {
    ensureLocalCompany(db);
  }
}

function metaSet(db: SqliteDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

class SqliteCareerStore implements CareerStore {
  readonly kind = 'sqlite' as const;
  readonly sqlitePath: string;
  private readonly db: SqliteDb;

  constructor(sqlitePath: string) {
    this.sqlitePath = sqlitePath;
    this.db = openSqliteDb(sqlitePath);
  }

  hasEconomyRow(): boolean {
    const row = this.db.prepare(`SELECT 1 AS ok FROM economy_json WHERE id = 1`).get() as
      | { ok: number }
      | undefined;
    return Boolean(row);
  }

  markMigratedFromJson(): void {
    metaSet(this.db, 'migrated_from_json', new Date().toISOString());
  }

  async loadEconomy(): Promise<EconomyLoadResult> {
    const row = this.db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as
      | { json: string }
      | undefined;
    if (!row) {
      const fresh = createSeedEconomyWorld();
      ensureSeedMarketFormed(fresh);
      await this.saveEconomy(fresh);
      return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
    }
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(row.json) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `SQLite economy_json is corrupt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!Array.isArray(existing.airports)) {
      throw new Error('SQLite economy_json has no airports[]; refusing to reseed');
    }
    const beforeIcaos = airportIcaoList(existing);
    // Hydrate lots before CL ident remap so SCCD/SCIE rewrite sees airports + lots.
    hydrateWorldFromTables(this.db, existing as unknown as CareerEconomyWorld);
    const world = migrateEconomyWorld(existing);
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
    ensureHomeCountryId(caught);
    const afterIcaos = airportIcaoList(caught);
    let dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
    if (ensureSeedMarketFormed(caught)) dirty = true;
    if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
    await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
    return { world: caught, advancedTicks, settledFlights, dirty };
  }

  async saveEconomy(world: CareerEconomyWorld): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    const blob = stripEconomyHotArrays(toSave);
    const json = JSON.stringify(blob);
    const now = Date.now();
    runInTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
        )
        .run(json, now);
      persistWorldLiveTables(this.db, toSave);
      metaSet(this.db, 'country_id', toSave.homeCountryId ?? 'BR');
      metaSet(this.db, 'economy_tick', String(toSave.tick));
    });
  }

  async loadMissions(): Promise<CareerMissionsState> {
    const row = this.db.prepare(`SELECT json FROM missions_json WHERE id = 1`).get() as
      | { json: string }
      | undefined;
    if (!row) {
      const fresh = emptyMissionsStateV2();
      await this.saveMissions(fresh);
      return fresh;
    }
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(row.json) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `SQLite missions_json is corrupt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // After v3 migrate, missions[] may be empty stub — tables are SoT.
    const hasMissionArray = Array.isArray(existing.missions);
    if (!hasMissionArray && !companyTablesPopulated(this.db)) {
      throw new Error('SQLite missions_json has no missions[]; refusing to wipe career');
    }
    const blobNormalized = normalizeMissions(
      hasMissionArray ? existing : { ...existing, missions: [] },
    );
    const assembled = assembleMissionsFromTables(this.db, blobNormalized);
    return normalizeMissions(assembled as unknown as Record<string, unknown>);
  }

  async saveMissions(state: CareerMissionsState): Promise<void> {
    const normalized = missionsPayloadForBlob(state);
    const ledger = normalized.ledger ?? [];
    normalized.ledger = ledger;
    const stub = missionsBlobStub(normalized);
    const json = JSON.stringify(stub);
    const now = Date.now();
    runInTransaction(this.db, () => {
      ensureLocalCompany(this.db, {
        displayName: normalized.pilotName || '',
        homeHubIcao: normalized.homeHubIcao || '',
      });
      this.db
        .prepare(
          `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
        )
        .run(json, now);
      persistCompanyTables(this.db, normalized);
      replaceLedgerV3(this.db, ledger);
    });
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const fromTable = readLedgerRowsV3(this.db);
    if (fromTable.length > 0) return fromTable;
    const missions = await this.loadMissions();
    return missions.ledger ?? [];
  }

  async summarizeCashflow(atTick: number) {
    const ledger = await this.loadLedger();
    return summarizeCareerLedger({ ledger }, atTick);
  }

  close(): void {
    this.db.close();
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Import legacy JSON files into an empty SQLite DB, then rename JSON aside.
 */
async function migrateJsonIntoSqlite(
  store: SqliteCareerStore,
  economyPath: string,
  missionsPath: string,
): Promise<void> {
  const economyRaw = await readJsonFile<Record<string, unknown>>(economyPath);
  if (economyRaw && Array.isArray(economyRaw.airports)) {
    const world = migrateEconomyWorld(economyRaw);
    ensureHomeCountryId(world);
    ensureSeedMarketFormed(world);
    await store.saveEconomy(world);
  } else if (!economyRaw) {
    const fresh = createSeedEconomyWorld();
    ensureSeedMarketFormed(fresh);
    await store.saveEconomy(fresh);
  } else {
    throw new Error(
      `Cannot migrate ${economyPath}: missing airports[]; leaving JSON in place`,
    );
  }

  const missionsRaw = await readJsonFile<Record<string, unknown>>(missionsPath);
  if (missionsRaw && Array.isArray(missionsRaw.missions)) {
    await store.saveMissions(normalizeMissions(missionsRaw));
  } else if (!missionsRaw) {
    await store.saveMissions(emptyMissionsStateV2());
  } else {
    throw new Error(
      `Cannot migrate ${missionsPath}: missing missions[]; leaving JSON in place`,
    );
  }

  store.markMigratedFromJson();
  await renameJsonAside(economyPath, '.migrated.bak');
  await renameJsonAside(missionsPath, '.migrated.bak');
}

/**
 * Open the career store. Default backend is SQLite under `careerDir/skyline.sqlite`,
 * with one-shot import from local-economy.json / local-missions.json when present.
 */
export async function openCareerStore(opts: OpenCareerStoreOpts): Promise<CareerStore> {
  const careerDir = opts.careerDir;
  await mkdir(careerDir, { recursive: true });
  const economyPath = join(careerDir, opts.economyFileName ?? 'local-economy.json');
  const missionsPath = join(careerDir, opts.missionsFileName ?? 'local-missions.json');
  const sqlitePath = join(careerDir, opts.sqliteFileName ?? 'skyline.sqlite');

  const envBackend = process.env.CAREER_STORE?.trim().toLowerCase();
  const backend: CareerStoreKind | 'auto' =
    opts.backend ??
    (envBackend === 'json' || envBackend === 'sqlite' ? envBackend : 'auto');

  if (backend === 'json') {
    return new JsonCareerStore(economyPath, missionsPath);
  }

  const sqliteExists = await pathExists(sqlitePath);
  const store = new SqliteCareerStore(sqlitePath);

  if (!sqliteExists) {
    const hasEconomyJson = await pathExists(economyPath);
    const hasMissionsJson = await pathExists(missionsPath);
    if (hasEconomyJson || hasMissionsJson) {
      await migrateJsonIntoSqlite(store, economyPath, missionsPath);
    }
  } else {
    // DB exists but economy row missing and JSON still around → import once.
    if (!store.hasEconomyRow() && (await pathExists(economyPath))) {
      await migrateJsonIntoSqlite(store, economyPath, missionsPath);
    }
  }

  return store;
}

export function createJsonCareerStore(opts: {
  economyPath: string;
  missionsPath: string;
}): CareerStore {
  return new JsonCareerStore(opts.economyPath, opts.missionsPath);
}

/** @internal test helper */
export { countLotsRows };
