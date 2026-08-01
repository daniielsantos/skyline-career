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
  migrateEconomyWorld,
} from './career-economy.js';
import { emptyMissionsStateV2, normalizeMissionsState } from './career-fleet.js';
import { normalizeMissionIntent } from './career-mission.js';
import { readJsonFile, renameJsonAside, writeJsonFileAtomic } from './career-json-io.js';
import {
  normalizeCareerLedger,
  summarizeCareerLedger,
  type CareerLedgerSummary,
} from './career-ledger.js';
import { ensureHomeCountryId } from './career-partition.js';
import type {
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerLedgerKind,
  CareerMissionsState,
  CommodityId,
  ShipmentLot,
  ShipmentLotStatus,
} from './types/career-economy.js';

export type CareerStoreKind = 'json' | 'sqlite';

/** Bumped when DDL changes; existing DBs upgrade via ensureSqliteSchema. */
export const CAREER_STORE_SCHEMA_VERSION = '2';

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
  const lotsBefore = Array.isArray(existing.lots) ? existing.lots.length : 0;
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
    caught.lots.length !== lotsBefore ||
    caught.airports.length !== airportsBefore ||
    npcRegionsAfter !== npcRegionsBefore ||
    hubLevelSigAfter !== hubLevelSigBefore ||
    missingHubTiers ||
    missingHomeCountry
  );
}

function normalizeMissions(raw: Record<string, unknown>): CareerMissionsState {
  const normalized = normalizeMissionsState(raw);
  normalized.missions = normalized.missions.map((m) => normalizeMissionIntent(m));
  return normalized;
}

function missionsPayloadForBlob(state: CareerMissionsState): CareerMissionsState {
  // Ledger is also materialized in SQLite; keep a copy in the blob for JSON export / fallback.
  return normalizeMissions(state as unknown as Record<string, unknown>);
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
      const world = migrateEconomyWorld(existing);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
      ensureHomeCountryId(caught);
      const dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
      return { world: caught, advancedTicks, settledFlights, dirty };
    }
    if (existing) {
      throw new Error(
        `Save at ${this.economyPath} has no airports[]; refusing to overwrite it with a fresh world`,
      );
    }
    const fresh = createSeedEconomyWorld();
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

  const ver = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  if (!ver) {
    db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(
      CAREER_STORE_SCHEMA_VERSION,
    );
    return;
  }
  const current = Number.parseInt(ver.value, 10);
  if (!Number.isFinite(current) || current < 2) {
    // v1 → v2: lots table + indexes already ensured by CREATE IF NOT EXISTS above.
    metaSet(db, 'schema_version', CAREER_STORE_SCHEMA_VERSION);
  } else if (ver.value !== CAREER_STORE_SCHEMA_VERSION) {
    metaSet(db, 'schema_version', CAREER_STORE_SCHEMA_VERSION);
  }
}

function metaSet(db: SqliteDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function readLedgerRows(db: SqliteDb): CareerLedgerEntry[] {
  const rows = db
    .prepare(
      `SELECT id, at_tick, day_index, amount_usd, kind, note, aircraft_id, mission_id, icao
       FROM ledger ORDER BY at_tick ASC, id ASC`,
    )
    .all() as Array<{
    id: string;
    at_tick: number;
    day_index: number;
    amount_usd: number;
    kind: string;
    note: string | null;
    aircraft_id: string | null;
    mission_id: string | null;
    icao: string | null;
  }>;
  return normalizeCareerLedger(
    rows.map((r) => ({
      id: r.id,
      atTick: r.at_tick,
      dayIndex: r.day_index,
      amountUsd: r.amount_usd,
      kind: r.kind as CareerLedgerKind,
      note: r.note ?? undefined,
      aircraftId: r.aircraft_id ?? undefined,
      missionId: r.mission_id ?? undefined,
      icao: r.icao ?? undefined,
    })),
  );
}

/** Caller should wrap in a transaction when combining with other writes. */
function replaceLedger(db: SqliteDb, entries: CareerLedgerEntry[]): void {
  const del = db.prepare(`DELETE FROM ledger`);
  const ins = db.prepare(
    `INSERT INTO ledger (id, at_tick, day_index, amount_usd, kind, note, aircraft_id, mission_id, icao)
     VALUES (@id, @at_tick, @day_index, @amount_usd, @kind, @note, @aircraft_id, @mission_id, @icao)`,
  );
  del.run();
  for (const e of entries) {
    ins.run({
      id: e.id,
      at_tick: e.atTick,
      day_index: e.dayIndex,
      amount_usd: e.amountUsd,
      kind: e.kind,
      note: e.note ?? null,
      aircraft_id: e.aircraftId ?? null,
      mission_id: e.missionId ?? null,
      icao: e.icao ?? null,
    });
  }
}

function countLotsRows(db: SqliteDb): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM lots`).get() as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function readLotsRows(db: SqliteDb): ShipmentLot[] {
  const rows = db
    .prepare(
      `SELECT id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
              created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status
       FROM lots ORDER BY created_at_tick ASC, id ASC`,
    )
    .all() as Array<{
    id: string;
    commodity_id: string;
    origin_icao: string;
    dest_icao: string;
    quantity_kg: number;
    reserved_kg: number;
    created_at_tick: number;
    expires_at_tick: number;
    pay_usd: number;
    base_pay_usd: number | null;
    urgency: string;
    reason: string;
    status: string;
  }>;
  return rows.map((r) => {
    const lot: ShipmentLot = {
      id: r.id,
      commodityId: r.commodity_id as CommodityId,
      originIcao: r.origin_icao,
      destIcao: r.dest_icao,
      quantityKg: r.quantity_kg,
      reservedKg: r.reserved_kg,
      createdAtTick: r.created_at_tick,
      expiresAtTick: r.expires_at_tick,
      payUsd: r.pay_usd,
      urgency: r.urgency === 'urgent' ? 'urgent' : 'normal',
      reason: r.reason,
      status: r.status as ShipmentLotStatus,
    };
    if (typeof r.base_pay_usd === 'number' && Number.isFinite(r.base_pay_usd)) {
      lot.basePayUsd = r.base_pay_usd;
    }
    return lot;
  });
}

/** Caller should wrap in a transaction when combining with other writes. */
function replaceLots(db: SqliteDb, lots: ShipmentLot[]): void {
  const del = db.prepare(`DELETE FROM lots`);
  const ins = db.prepare(
    `INSERT INTO lots (
       id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
       created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status
     ) VALUES (
       @id, @commodity_id, @origin_icao, @dest_icao, @quantity_kg, @reserved_kg,
       @created_at_tick, @expires_at_tick, @pay_usd, @base_pay_usd, @urgency, @reason, @status
     )`,
  );
  del.run();
  for (const lot of lots) {
    ins.run({
      id: lot.id,
      commodity_id: lot.commodityId,
      origin_icao: lot.originIcao,
      dest_icao: lot.destIcao,
      quantity_kg: lot.quantityKg,
      reserved_kg: lot.reservedKg,
      created_at_tick: lot.createdAtTick,
      expires_at_tick: lot.expiresAtTick,
      pay_usd: lot.payUsd,
      base_pay_usd:
        typeof lot.basePayUsd === 'number' && Number.isFinite(lot.basePayUsd)
          ? lot.basePayUsd
          : null,
      urgency: lot.urgency,
      reason: lot.reason,
      status: lot.status,
    });
  }
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
    const world = migrateEconomyWorld(existing);
    // Materialized lots table is source of truth when non-empty (dual-write with blob).
    if (countLotsRows(this.db) > 0) {
      world.lots = readLotsRows(this.db);
    }
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
    ensureHomeCountryId(caught);
    let dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
    // Schema v2 backfill: blob has lots but table empty → persist on this load.
    if (countLotsRows(this.db) === 0 && caught.lots.length > 0) {
      dirty = true;
    }
    return { world: caught, advancedTicks, settledFlights, dirty };
  }

  async saveEconomy(world: CareerEconomyWorld): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    const json = JSON.stringify(toSave);
    const now = Date.now();
    runInTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
        )
        .run(json, now);
      replaceLots(this.db, toSave.lots ?? []);
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
    if (!Array.isArray(existing.missions)) {
      throw new Error('SQLite missions_json has no missions[]; refusing to wipe career');
    }
    const normalized = normalizeMissions(existing);
    const tableLedger = readLedgerRows(this.db);
    if (tableLedger.length > 0) {
      normalized.ledger = tableLedger;
    } else if (!normalized.ledger) {
      normalized.ledger = [];
    }
    return normalized;
  }

  async saveMissions(state: CareerMissionsState): Promise<void> {
    const normalized = missionsPayloadForBlob(state);
    const ledger = normalizeCareerLedger(normalized.ledger ?? []);
    normalized.ledger = ledger;
    const json = JSON.stringify(normalized);
    const now = Date.now();
    runInTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
        )
        .run(json, now);
      replaceLedger(this.db, ledger);
    });
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const fromTable = readLedgerRows(this.db);
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
    await store.saveEconomy(world);
  } else if (!economyRaw) {
    await store.saveEconomy(createSeedEconomyWorld());
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
