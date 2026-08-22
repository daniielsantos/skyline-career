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
  MAX_LOAD_CATCH_UP_TICKS,
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
  persistLotsIncremental,
  persistInboundIncremental,
  lotPersistSignature,
  inboundPersistSignature,
  readLotsByIds,
  readInboundPendingForMission,
  replaceInboundPendingForMission,
  upsertLotRows,
  readLedgerRowsV3,
  replaceLedgerV3,
  replaceNpcFlights,
  replaceEconomyEvents,
  stripEconomyHotArrays,
} from './career-store-v3.js';
import {
  countAirportRows,
  economyBlobHasAirports,
  ensureLocalWorld,
  ensureV4Ddl,
  hydrateAirportsFromTables,
  migrateV3toV4IfNeeded,
  overlayEconomyMeta,
  persistWorldAirports,
  persistAirportsPatch,
  readEconomyMeta,
  airportPersistSignature,
  airportSignaturesFromList,
  readAirportBoard,
  readAirportInventory,
  readAirportsByIcaos,
  stampCompanyWorldId,
  stripEconomyAirports,
  LOCAL_WORLD_ID,
  type AirportBoardSnapshot,
  type AirportInventorySnapshot,
} from './career-store-v4.js';
import {
  economyBlobHasWorldOps,
  ensureV5Ddl,
  hydrateWorldOpsFromTables,
  migrateV4toV5IfNeeded,
  persistWorldOpsTables,
  stripEconomyWorldOps,
  replacePortConcessions,
  upsertDemandOrder,
  upsertPortListing,
} from './career-store-v5.js';
import type {
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerMissionsState,
  DemandOrder,
  PortConcessionIndexRow,
  PortListing,
} from './types/career-economy.js';

export type CareerStoreKind = 'json' | 'sqlite';

/** Bumped when DDL changes; existing DBs upgrade via ensureSqliteSchema. */
export const CAREER_STORE_SCHEMA_VERSION = '5';
export { LOCAL_WORLD_ID };
export type { AirportBoardSnapshot, AirportInventorySnapshot };

export type EconomyLoadResult = {
  world: CareerEconomyWorld;
  /** Hours advanced by wall-clock catch-up during this load. */
  advancedTicks: number;
  settledFlights: number;
  /** True when migrate/catch-up changed the world and it should be persisted. */
  dirty: boolean;
};

export type CommandWorldSliceOpts = {
  icaos: string[];
  lotIds: string[];
  missionId: string;
};

export type PersistCommandWorldSliceOpts = {
  missionId: string;
  lotIds: string[];
  icaos: string[];
};

export interface CareerStore {
  readonly kind: CareerStoreKind;
  readonly sqlitePath?: string;
  loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult>;
  saveEconomy(
    world: CareerEconomyWorld,
    opts?: { liveTables?: boolean },
  ): Promise<void>;
  persistDemandOrder(order: DemandOrder): Promise<void>;
  persistPortListing(listing: PortListing): Promise<void>;
  persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void>;
  /**
   * Origin/dest + listed lots + inbound for one mission. Does not set RAM.
   * JSON store returns null (caller loads the full world).
   */
  loadCommandWorldSlice(opts: CommandWorldSliceOpts): CareerEconomyWorld | null;
  /** Patch those hubs/lots/inbound only — never prune the planet. */
  persistCommandWorldSlice(
    world: CareerEconomyWorld,
    opts: PersistCommandWorldSliceOpts,
  ): Promise<void>;
  loadMissions(): Promise<CareerMissionsState>;
  saveMissions(state: CareerMissionsState): Promise<void>;
  /** In-process world after last load/save — skip blob parse on hot reads. */
  peekEconomyWorld(): CareerEconomyWorld | null;
  /** Schema v4: hub + stock + lots by ICAO. JSON store uses RAM if present. */
  readAirportBoard(icao: string): AirportBoardSnapshot | null;
  /** Hub + stock + clock only (no lots). SQL, no economy blob. */
  readAirportInventory(icao: string): AirportInventorySnapshot | null;
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

function catchUpOpts(opts?: { maxCatchUpTicks?: number }) {
  return { maxTicks: opts?.maxCatchUpTicks ?? MAX_LOAD_CATCH_UP_TICKS };
}

function economyNeedsRewrite(
  existing: Record<string, unknown>,
  caught: CareerEconomyWorld,
  advancedTicks: number,
  settledFlights: number,
): boolean {
  const blobNpcs = Array.isArray(existing.npcs) ? existing.npcs : [];
  const blobHasNpcs = blobNpcs.length > 0;
  const npcCountBefore = blobHasNpcs ? blobNpcs.length : caught.npcs.length;
  const blobTrucks = Array.isArray(existing.fuelTrucks) ? existing.fuelTrucks : [];
  const blobHasTrucks = blobTrucks.length > 0;
  const trucksBefore = blobHasTrucks
    ? blobTrucks.length
    : (caught.fuelTrucks?.length ?? 0);
  const blobAirports = Array.isArray(existing.airports) ? existing.airports : [];
  const blobHasAirports = blobAirports.length > 0;
  const airportsBefore = blobHasAirports ? blobAirports.length : caught.airports.length;
  const hubLevelSigBefore = blobHasAirports
    ? (blobAirports as Array<{ level?: number; levelXp?: number; levelCurveVersion?: number }>)
        .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
        .join('|')
    : '';
  const npcRegionsBefore = blobHasNpcs
    ? (blobNpcs as Array<{ homeRegion?: string }>)
        .map((npc) => npc.homeRegion ?? '')
        .join('|')
    : '';
  const missingHubTiers = blobHasAirports
    ? (blobAirports as Array<{ hubTier?: string }>).some((ap) => !ap.hubTier)
    : false;
  const missingHomeCountry = !(existing as { homeCountryId?: string }).homeCountryId;
  const version = (existing as { version?: number }).version;

  const hubLevelSigAfter = blobHasAirports
    ? (caught.airports ?? [])
        .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
        .join('|')
    : '';
  const npcRegionsAfter = (caught.npcs ?? []).map((npc) => npc.homeRegion ?? '').join('|');

  return (
    advancedTicks > 0 ||
    settledFlights > 0 ||
    version !== 3 ||
    (blobHasNpcs && caught.npcs.length !== npcCountBefore) ||
    (blobHasTrucks && (caught.fuelTrucks?.length ?? 0) !== trucksBefore) ||
    (blobHasAirports && caught.airports.length !== airportsBefore) ||
    (blobHasNpcs && npcRegionsAfter !== npcRegionsBefore) ||
    (blobHasAirports && hubLevelSigAfter !== hubLevelSigBefore) ||
    missingHubTiers ||
    missingHomeCountry ||
    economyBlobHasHotArrays(existing) ||
    economyBlobHasAirports(existing) ||
    economyBlobHasWorldOps(existing)
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
  private ram: CareerEconomyWorld | null = null;
  constructor(
    private readonly economyPath: string,
    private readonly missionsPath: string,
  ) {}

  peekEconomyWorld(): CareerEconomyWorld | null {
    return this.ram;
  }

  loadCommandWorldSlice(_opts: CommandWorldSliceOpts): CareerEconomyWorld | null {
    return null;
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
    const relatedAirports = world.airports.filter((a) => partnerIcaos.includes(a.icao));
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
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      return {
        world: this.ram,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    const existing = await readJsonFile<Record<string, unknown>>(this.economyPath);
    if (existing && Array.isArray(existing.airports)) {
      const beforeIcaos = airportIcaoList(existing);
      const world = migrateEconomyWorld(existing);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
        world,
        Date.now(),
        catchUpOpts(opts),
      );
      ensureHomeCountryId(caught);
      const afterIcaos = airportIcaoList(caught);
      let dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
      if (ensureSeedMarketFormed(caught)) dirty = true;
      if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
      await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
      this.ram = caught;
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
    this.ram = fresh;
    return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
  }

  async saveEconomy(
    world: CareerEconomyWorld,
    _opts?: { liveTables?: boolean },
  ): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    this.ram = toSave;
    await writeJsonFileAtomic(this.economyPath, toSave);
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
    this.ram = null;
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
  ensureV4Ddl(db);
  ensureV5Ddl(db);

  const ver = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  if (!ver) {
    ensureLocalWorld(db);
    ensureLocalCompany(db);
    stampCompanyWorldId(db);
    db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(
      CAREER_STORE_SCHEMA_VERSION,
    );
    return;
  }

  const current = Number.parseInt(ver.value, 10);
  if (!Number.isFinite(current) || current < 3) {
    migrateV2toV3IfNeeded(db, metaSet, '3');
  }
  const afterV3 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV3 = Number.parseInt(afterV3?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV3) || verAfterV3 < 4) {
    migrateV3toV4IfNeeded(db, metaSet, '4');
  }
  const afterV4 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verNow = Number.parseInt(afterV4?.value ?? ver.value, 10);
  if (!Number.isFinite(verNow) || verNow < 5) {
    migrateV4toV5IfNeeded(db, metaSet, CAREER_STORE_SCHEMA_VERSION);
  }
  ensureLocalWorld(db);
  ensureLocalCompany(db);
  stampCompanyWorldId(db);
}

function metaSet(db: SqliteDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function lotsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(
    (world.lots ?? []).map((lot) => [
      lot.id,
      lot.quantityKg,
      lot.reservedKg,
      lot.status,
      lot.payUsd,
      lot.expiresAtTick,
    ]),
  );
}

function inboundPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.inboundPending ?? []);
}

function npcFlightsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.npcFlights ?? []);
}

function eventsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.events ?? []);
}

function lotSignatureMap(world: CareerEconomyWorld): Map<string, string> {
  const m = new Map<string, string>();
  for (const lot of world.lots ?? []) {
    m.set(lot.id, lotPersistSignature(lot));
  }
  return m;
}

function inboundSignatureMap(world: CareerEconomyWorld): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of world.inboundPending ?? []) {
    m.set(row.id, inboundPersistSignature(row));
  }
  return m;
}

function worldOpsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify({
    npcs: world.npcs ?? [],
    fuelTrucks: world.fuelTrucks ?? [],
    fuelHauls: world.fuelHauls ?? [],
    demandOrders: world.demandOrders ?? [],
    portListings: world.portListings ?? [],
    portInventories: world.portInventories ?? [],
    portConcessions: world.portConcessions ?? [],
  });
}

class SqliteCareerStore implements CareerStore {
  readonly kind = 'sqlite' as const;
  readonly sqlitePath: string;
  private readonly db: SqliteDb;
  private ram: CareerEconomyWorld | null = null;
  /** Signatures from the last successful airport table write (not in-RAM mutations). */
  private lastAirportSignatures: Map<string, string> | null = null;
  private lastLotSignatures: Map<string, string> | null = null;
  private lastInboundSignatures: Map<string, string> | null = null;
  private lastLotsKey: string | null = null;
  private lastInboundKey: string | null = null;
  private lastNpcFlightsKey: string | null = null;
  private lastEventsKey: string | null = null;
  private lastOpsKey: string | null = null;
  private lastEconomyBlobJson: string | null = null;

  constructor(sqlitePath: string) {
    this.sqlitePath = sqlitePath;
    this.db = openSqliteDb(sqlitePath);
  }

  peekEconomyWorld(): CareerEconomyWorld | null {
    return this.ram;
  }

  loadCommandWorldSlice(opts: CommandWorldSliceOpts): CareerEconomyWorld | null {
    const meta = readEconomyMeta(this.db);
    if (!meta) return null;
    const lots = readLotsByIds(this.db, opts.lotIds);
    const icaos = [
      ...new Set([
        ...opts.icaos.map((c) => c.trim().toUpperCase()).filter(Boolean),
        ...lots.flatMap((lot) => [lot.originIcao, lot.destIcao]),
      ]),
    ];
    const airports = readAirportsByIcaos(this.db, icaos);
    if (airports.length === 0) return null;
    const inboundPending = readInboundPendingForMission(this.db, opts.missionId);
    return {
      version: 3,
      seed: meta.seed,
      tick: meta.tick,
      lastBatchAtMs: meta.lastBatchAtMs,
      lastSyncedAtMs: meta.lastBatchAtMs,
      homeCountryId: meta.homeCountryId || undefined,
      airports,
      lots,
      inboundPending,
      events: [],
      npcs: [],
      npcFlights: [],
    };
  }

  async persistCommandWorldSlice(
    world: CareerEconomyWorld,
    opts: PersistCommandWorldSliceOpts,
  ): Promise<void> {
    const icaoSet = new Set(
      opts.icaos.map((c) => c.trim().toUpperCase()).filter(Boolean),
    );
    const lotIdSet = new Set(opts.lotIds.map((id) => id.trim()).filter(Boolean));
    const airports = (world.airports ?? []).filter((ap) =>
      icaoSet.has(String(ap.icao ?? '').trim().toUpperCase()),
    );
    const lots = (world.lots ?? []).filter((lot) => lotIdSet.has(lot.id));
    const remainingLotIds = new Set(lots.map((lot) => lot.id));
    const inbound = (world.inboundPending ?? []).filter(
      (row) => row.missionId === opts.missionId,
    );
    runInTransaction(this.db, () => {
      persistAirportsPatch(this.db, airports, []);
      if (lots.length > 0) upsertLotRows(this.db, lots, airports);
      const del = this.db.prepare(`DELETE FROM lots WHERE id = ?`);
      for (const id of lotIdSet) {
        if (!remainingLotIds.has(id)) del.run(id);
      }
      replaceInboundPendingForMission(this.db, opts.missionId, inbound, airports);
    });
    if (this.ram && this.lastAirportSignatures) {
      for (const ap of airports) {
        const icao = String(ap.icao ?? '').trim().toUpperCase();
        if (icao) this.lastAirportSignatures.set(icao, airportPersistSignature(ap));
      }
    }
    if (this.ram && this.lastLotSignatures) {
      for (const lot of lots) {
        this.lastLotSignatures.set(lot.id, lotPersistSignature(lot));
      }
      for (const id of lotIdSet) {
        if (!remainingLotIds.has(id)) this.lastLotSignatures.delete(id);
      }
      this.lastLotsKey = lotsPersistKey(this.ram);
    }
    if (this.ram && this.lastInboundSignatures) {
      this.lastInboundSignatures = inboundSignatureMap(this.ram);
      this.lastInboundKey = inboundPersistKey(this.ram);
    }
  }

  async persistDemandOrder(order: DemandOrder): Promise<void> {
    upsertDemandOrder(this.db, order);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistPortListing(listing: PortListing): Promise<void> {
    upsertPortListing(this.db, listing);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void> {
    replacePortConcessions(this.db, rows);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  readAirportInventory(icao: string): AirportInventorySnapshot | null {
    return readAirportInventory(this.db, icao, LOCAL_WORLD_ID);
  }

  readAirportBoard(icao: string): AirportBoardSnapshot | null {
    return readAirportBoard(this.db, icao, LOCAL_WORLD_ID);
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

  async loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult> {
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      return {
        world: this.ram,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    if (this.ram) {
      const world = migrateEconomyWorld(this.ram);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
        world,
        Date.now(),
        catchUpOpts(opts),
      );
      ensureHomeCountryId(caught);
      let dirty = advancedTicks > 0 || settledFlights > 0;
      if (ensureSeedMarketFormed(caught)) dirty = true;
      this.ram = caught;
      return { world: caught, advancedTicks, settledFlights, dirty };
    }

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
    const blobForDirty: Record<string, unknown> = {
      version: existing.version,
      homeCountryId: existing.homeCountryId,
      npcs: existing.npcs,
      fuelTrucks: existing.fuelTrucks,
      fuelHauls: existing.fuelHauls,
      demandOrders: existing.demandOrders,
      portListings: existing.portListings,
      portInventories: existing.portInventories,
      portConcessions: existing.portConcessions,
      airports: existing.airports,
      lots: existing.lots,
      inboundPending: existing.inboundPending,
      npcFlights: existing.npcFlights,
      events: existing.events,
    };
    hydrateWorldFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateAirportsFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateWorldOpsFromTables(this.db, existing as unknown as CareerEconomyWorld);
    overlayEconomyMeta(this.db, existing as unknown as CareerEconomyWorld);
    const tableAirports = countAirportRows(this.db);
    const blobAirports = Array.isArray(existing.airports) ? existing.airports.length : 0;
    if (tableAirports === 0 && blobAirports === 0) {
      throw new Error('SQLite world has no airports (tables or blob); refusing to reseed');
    }
    const beforeIcaos = airportIcaoList(existing as { airports?: Array<{ icao?: string }> });
    const world = migrateEconomyWorld(existing);
    if (opts?.maxCatchUpTicks === 0) {
      ensureHomeCountryId(world);
      this.ram = world;
      const blob = stripEconomyWorldOps(
        stripEconomyAirports(stripEconomyHotArrays(world)),
      );
      this.rememberPersistedWorld(world, JSON.stringify(blob));
      return {
        world,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
      world,
      Date.now(),
      catchUpOpts(opts),
    );
    ensureHomeCountryId(caught);
    const afterIcaos = airportIcaoList(caught);
    let dirty = economyNeedsRewrite(blobForDirty, caught, advancedTicks, settledFlights);
    if (ensureSeedMarketFormed(caught)) dirty = true;
    if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
    await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
    this.ram = caught;
    if (!dirty) {
      const blob = stripEconomyWorldOps(
        stripEconomyAirports(stripEconomyHotArrays(caught)),
      );
      this.rememberPersistedWorld(caught, JSON.stringify(blob));
    }
    return { world: caught, advancedTicks, settledFlights, dirty };
  }

  async saveEconomy(
    world: CareerEconomyWorld,
    opts?: { liveTables?: boolean },
  ): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    const blob = stripEconomyWorldOps(
      stripEconomyAirports(stripEconomyHotArrays(toSave)),
    );
    const json = JSON.stringify(blob);
    const now = Date.now();
    if (opts?.liveTables === false) {
      runInTransaction(this.db, () => {
        if (json !== this.lastEconomyBlobJson) {
          this.db
            .prepare(
              `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
            )
            .run(json, now);
        }
      });
      this.ram = toSave;
      this.lastEconomyBlobJson = json;
      return;
    }
    const lotsKey = lotsPersistKey(toSave);
    const inboundKey = inboundPersistKey(toSave);
    const npcKey = npcFlightsPersistKey(toSave);
    const eventsKey = eventsPersistKey(toSave);
    const opsKey = worldOpsPersistKey(toSave);
    const prevAirportSignatures = this.lastAirportSignatures;
    const prevLotSignatures = this.lastLotSignatures;
    const prevInboundSignatures = this.lastInboundSignatures;
    runInTransaction(this.db, () => {
      if (json !== this.lastEconomyBlobJson) {
        this.db
          .prepare(
            `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
          )
          .run(json, now);
      }
      if (this.lastLotsKey !== lotsKey) {
        persistLotsIncremental(
          this.db,
          toSave.lots ?? [],
          toSave.airports,
          prevLotSignatures,
        );
      }
      if (this.lastInboundKey !== inboundKey) {
        persistInboundIncremental(
          this.db,
          toSave.inboundPending ?? [],
          toSave.airports,
          prevInboundSignatures,
        );
      }
      if (this.lastNpcFlightsKey !== npcKey) {
        replaceNpcFlights(this.db, toSave.npcFlights ?? [], toSave.airports);
      }
      if (this.lastEventsKey !== eventsKey) {
        replaceEconomyEvents(this.db, toSave.events ?? []);
      }
      persistWorldAirports(this.db, toSave, LOCAL_WORLD_ID, prevAirportSignatures);
      if (this.lastOpsKey !== opsKey) {
        persistWorldOpsTables(this.db, toSave);
      }
      stampCompanyWorldId(this.db);
      metaSet(this.db, 'country_id', toSave.homeCountryId ?? 'BR');
      metaSet(this.db, 'economy_tick', String(toSave.tick));
    });
    this.ram = toSave;
    this.rememberPersistedWorld(toSave, json);
  }

  private rememberPersistedWorld(world: CareerEconomyWorld, blobJson: string): void {
    this.lastAirportSignatures = airportSignaturesFromList(world.airports);
    this.lastLotSignatures = lotSignatureMap(world);
    this.lastInboundSignatures = inboundSignatureMap(world);
    this.lastLotsKey = lotsPersistKey(world);
    this.lastInboundKey = inboundPersistKey(world);
    this.lastNpcFlightsKey = npcFlightsPersistKey(world);
    this.lastEventsKey = eventsPersistKey(world);
    this.lastOpsKey = worldOpsPersistKey(world);
    this.lastEconomyBlobJson = blobJson;
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
    this.ram = null;
    this.lastAirportSignatures = null;
    this.lastLotSignatures = null;
    this.lastInboundSignatures = null;
    this.lastLotsKey = null;
    this.lastInboundKey = null;
    this.lastNpcFlightsKey = null;
    this.lastEventsKey = null;
    this.lastOpsKey = null;
    this.lastEconomyBlobJson = null;
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
export { countLotsRows, countAirportRows };
