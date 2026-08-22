/**
 * Career store schema v4 — world tables as SoT (hubs + stock), keyed for MP.
 *
 * SP uses one world (`LOCAL_WORLD_ID`) and one company (`LOCAL_COMPANY_ID`).
 * MP later: many companies share a world_id; airport stock / lots stay world-owned.
 * Tick still in-memory; this file is I/O + DDL only.
 */

import type { DatabaseSync } from 'node:sqlite';
import { countryIdFromRegion } from './career-partition.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityId,
  HubTier,
  ShipmentLot,
  ShipmentLotStatus,
  StockPile,
} from './types/career-economy.js';

export const LOCAL_WORLD_ID = 'local';

export const CAREER_STORE_SCHEMA_V4 = '4';

export type SqliteDb = DatabaseSync;

export type EconomyMetaRow = {
  worldId: string;
  seed: string;
  tick: number;
  lastBatchAtMs: number;
  homeCountryId: string;
};

export type AirportBoardSnapshot = {
  worldId: string;
  meta: EconomyMetaRow;
  airport: AirportTerminal;
  lots: ShipmentLot[];
  /** Origin/dest partners needed for distance + fuel quotes. */
  relatedAirports: AirportTerminal[];
};

/** Hub + stock + clock only — no lots / NPC. Fast terminal Inventory paint. */
export type AirportInventorySnapshot = {
  worldId: string;
  meta: EconomyMetaRow;
  airport: AirportTerminal;
};

const HUB_TIERS = new Set<HubTier>(['major', 'regional', 'spoke']);

const COMMODITY_IDS: readonly CommodityId[] = [
  'electronics',
  'perishables',
  'machinery',
  'general',
  'supplies',
  'fuel',
  'mro_parts',
];

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function withSqliteTransaction(db: SqliteDb, fn: () => void): void {
  let started = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    started = true;
  } catch {
    started = false;
  }
  try {
    fn();
    if (started) db.exec('COMMIT');
  } catch (error) {
    if (started) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}

function asHubTier(raw: string | null | undefined): HubTier | undefined {
  const t = String(raw ?? '').trim();
  return HUB_TIERS.has(t as HubTier) ? (t as HubTier) : undefined;
}

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function ensureV4Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS economy_meta (
      world_id TEXT PRIMARY KEY NOT NULL,
      seed TEXT NOT NULL,
      tick INTEGER NOT NULL,
      last_batch_at_ms INTEGER NOT NULL,
      home_country_id TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (world_id) REFERENCES worlds(id)
    );

    CREATE TABLE IF NOT EXISTS airports (
      world_id TEXT NOT NULL,
      icao TEXT NOT NULL,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      country_id TEXT NOT NULL,
      hub_tier TEXT NOT NULL DEFAULT '',
      bush INTEGER NOT NULL DEFAULT 0,
      bush_trip_only INTEGER NOT NULL DEFAULT 0,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      level INTEGER NOT NULL,
      level_xp REAL NOT NULL DEFAULT 0,
      level_curve_version INTEGER NOT NULL DEFAULT 0,
      activity_score REAL NOT NULL DEFAULT 0,
      last_activity_tick INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (world_id, icao),
      FOREIGN KEY (world_id) REFERENCES worlds(id)
    );
    CREATE INDEX IF NOT EXISTS airports_region_idx ON airports(world_id, region);
    CREATE INDEX IF NOT EXISTS airports_country_idx ON airports(world_id, country_id);

    CREATE TABLE IF NOT EXISTS airport_stock (
      world_id TEXT NOT NULL,
      icao TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      stock_kg REAL NOT NULL,
      capacity_kg REAL NOT NULL,
      base_production_per_tick_kg REAL NOT NULL DEFAULT 0,
      base_consumption_per_tick_kg REAL NOT NULL DEFAULT 0,
      production_per_tick_kg REAL NOT NULL DEFAULT 0,
      consumption_per_tick_kg REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (world_id, icao, commodity_id),
      FOREIGN KEY (world_id, icao) REFERENCES airports(world_id, icao)
    );
    CREATE INDEX IF NOT EXISTS airport_stock_icao_idx ON airport_stock(world_id, icao);
  `);

  if (!columnExists(db, 'companies', 'world_id')) {
    db.exec(
      `ALTER TABLE companies ADD COLUMN world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}'`,
    );
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS companies_world_idx ON companies(world_id);
  `);

  for (const table of [
    'lots',
    'inbound_pending',
    'npc_flights',
    'economy_events',
  ] as const) {
    if (!columnExists(db, table, 'world_id')) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}'`,
      );
    }
  }
  if (!columnExists(db, 'lots', 'claimed_by_company_id')) {
    db.exec(`ALTER TABLE lots ADD COLUMN claimed_by_company_id TEXT`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS lots_world_origin_idx ON lots(world_id, origin_icao);
    CREATE INDEX IF NOT EXISTS lots_world_dest_idx ON lots(world_id, dest_icao);
    CREATE INDEX IF NOT EXISTS lots_world_claimed_idx ON lots(world_id, claimed_by_company_id);
    CREATE INDEX IF NOT EXISTS inbound_world_dest_idx ON inbound_pending(world_id, dest_icao);
    CREATE INDEX IF NOT EXISTS npc_flights_world_status_idx ON npc_flights(world_id, status);
    CREATE INDEX IF NOT EXISTS economy_events_world_ends_idx ON economy_events(world_id, ends_at_tick);
  `);
}

export function ensureLocalWorld(db: SqliteDb): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO worlds (id, display_name, created_at_ms) VALUES (?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(LOCAL_WORLD_ID, 'Local world', now);
}

export function countAirportRows(db: SqliteDb, worldId = LOCAL_WORLD_ID): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM airports WHERE world_id = ?`)
    .get(worldId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export function readEconomyMeta(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): EconomyMetaRow | null {
  const row = db
    .prepare(
      `SELECT world_id, seed, tick, last_batch_at_ms, home_country_id
       FROM economy_meta WHERE world_id = ?`,
    )
    .get(worldId) as
    | {
        world_id: string;
        seed: string;
        tick: number;
        last_batch_at_ms: number;
        home_country_id: string;
      }
    | undefined;
  if (!row) return null;
  return {
    worldId: row.world_id,
    seed: row.seed,
    tick: row.tick,
    lastBatchAtMs: row.last_batch_at_ms,
    homeCountryId: row.home_country_id,
  };
}

export function persistEconomyMeta(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  ensureLocalWorld(db);
  db.prepare(
    `INSERT INTO economy_meta (world_id, seed, tick, last_batch_at_ms, home_country_id)
     VALUES (@world_id, @seed, @tick, @last_batch_at_ms, @home_country_id)
     ON CONFLICT(world_id) DO UPDATE SET
       seed = excluded.seed,
       tick = excluded.tick,
       last_batch_at_ms = excluded.last_batch_at_ms,
       home_country_id = excluded.home_country_id`,
  ).run({
    world_id: worldId,
    seed: world.seed,
    tick: world.tick,
    last_batch_at_ms: world.lastBatchAtMs,
    home_country_id: world.homeCountryId ?? '',
  });
}

function stockRowToPile(stockKg: number, capacityKg: number): StockPile {
  return { stockKg, capacityKg };
}

function terminalFromAirportRow(
  row: {
    icao: string;
    name: string;
    region: string;
    hub_tier: string;
    bush: number;
    bush_trip_only: number;
    lat: number;
    lon: number;
    level: number;
    level_xp: number;
    level_curve_version: number;
    activity_score: number;
    last_activity_tick: number;
  },
  stockRows: Array<{
    commodity_id: string;
    stock_kg: number;
    capacity_kg: number;
    base_production_per_tick_kg: number;
    base_consumption_per_tick_kg: number;
    production_per_tick_kg: number;
    consumption_per_tick_kg: number;
  }>,
): AirportTerminal {
  const inventory: AirportTerminal['inventory'] = {};
  const production: AirportTerminal['production'] = {};
  const consumption: AirportTerminal['consumption'] = {};
  const baseProduction: NonNullable<AirportTerminal['baseProduction']> = {};
  const baseConsumption: NonNullable<AirportTerminal['baseConsumption']> = {};
  for (const s of stockRows) {
    const id = s.commodity_id as CommodityId;
    inventory[id] = stockRowToPile(s.stock_kg, s.capacity_kg);
    production[id] = s.production_per_tick_kg;
    consumption[id] = s.consumption_per_tick_kg;
    baseProduction[id] = s.base_production_per_tick_kg;
    baseConsumption[id] = s.base_consumption_per_tick_kg;
  }
  const terminal: AirportTerminal = {
    icao: row.icao,
    name: row.name,
    region: row.region,
    lat: row.lat,
    lon: row.lon,
    level: row.level,
    inventory,
    production,
    consumption,
    baseProduction,
    baseConsumption,
  };
  const tier = asHubTier(row.hub_tier);
  if (tier) terminal.hubTier = tier;
  if (row.bush) terminal.bush = true;
  if (row.bush_trip_only) terminal.bushTripOnly = true;
  if (row.level_xp) terminal.levelXp = row.level_xp;
  if (row.level_curve_version) terminal.levelCurveVersion = row.level_curve_version;
  if (row.activity_score) terminal.activityScore = row.activity_score;
  if (row.last_activity_tick) terminal.lastActivityTick = row.last_activity_tick;
  return terminal;
}

export function readAirportsFromTables(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): AirportTerminal[] {
  const hubs = db
    .prepare(
      `SELECT icao, name, region, hub_tier, bush, bush_trip_only, lat, lon,
              level, level_xp, level_curve_version, activity_score, last_activity_tick
       FROM airports WHERE world_id = ? ORDER BY icao ASC`,
    )
    .all(worldId) as Array<{
    icao: string;
    name: string;
    region: string;
    hub_tier: string;
    bush: number;
    bush_trip_only: number;
    lat: number;
    lon: number;
    level: number;
    level_xp: number;
    level_curve_version: number;
    activity_score: number;
    last_activity_tick: number;
  }>;
  if (hubs.length === 0) return [];

  const stock = db
    .prepare(
      `SELECT icao, commodity_id, stock_kg, capacity_kg,
              base_production_per_tick_kg, base_consumption_per_tick_kg,
              production_per_tick_kg, consumption_per_tick_kg
       FROM airport_stock WHERE world_id = ? ORDER BY icao ASC, commodity_id ASC`,
    )
    .all(worldId) as Array<{
    icao: string;
    commodity_id: string;
    stock_kg: number;
    capacity_kg: number;
    base_production_per_tick_kg: number;
    base_consumption_per_tick_kg: number;
    production_per_tick_kg: number;
    consumption_per_tick_kg: number;
  }>;
  const byIcao = new Map<string, typeof stock>();
  for (const row of stock) {
    const list = byIcao.get(row.icao);
    if (list) list.push(row);
    else byIcao.set(row.icao, [row]);
  }
  return hubs.map((hub) => terminalFromAirportRow(hub, byIcao.get(hub.icao) ?? []));
}

export function readAirportsByIcaos(
  db: SqliteDb,
  icaos: string[],
  worldId = LOCAL_WORLD_ID,
): AirportTerminal[] {
  const unique = [
    ...new Set(icaos.map((c) => c.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  const hubs = db
    .prepare(
      `SELECT icao, name, region, hub_tier, bush, bush_trip_only, lat, lon,
              level, level_xp, level_curve_version, activity_score, last_activity_tick
       FROM airports WHERE world_id = ? AND icao IN (${placeholders}) ORDER BY icao ASC`,
    )
    .all(worldId, ...unique) as Array<{
    icao: string;
    name: string;
    region: string;
    hub_tier: string;
    bush: number;
    bush_trip_only: number;
    lat: number;
    lon: number;
    level: number;
    level_xp: number;
    level_curve_version: number;
    activity_score: number;
    last_activity_tick: number;
  }>;
  if (hubs.length === 0) return [];
  const stock = db
    .prepare(
      `SELECT icao, commodity_id, stock_kg, capacity_kg,
              base_production_per_tick_kg, base_consumption_per_tick_kg,
              production_per_tick_kg, consumption_per_tick_kg
       FROM airport_stock WHERE world_id = ? AND icao IN (${placeholders})
       ORDER BY icao ASC, commodity_id ASC`,
    )
    .all(worldId, ...unique) as Array<{
    icao: string;
    commodity_id: string;
    stock_kg: number;
    capacity_kg: number;
    base_production_per_tick_kg: number;
    base_consumption_per_tick_kg: number;
    production_per_tick_kg: number;
    consumption_per_tick_kg: number;
  }>;
  const byIcao = new Map<string, typeof stock>();
  for (const row of stock) {
    const list = byIcao.get(row.icao);
    if (list) list.push(row);
    else byIcao.set(row.icao, [row]);
  }
  return hubs.map((hub) => terminalFromAirportRow(hub, byIcao.get(hub.icao) ?? []));
}

function insertRowBatches(
  db: SqliteDb,
  tableSql: string,
  colCount: number,
  rows: Array<Array<string | number>>,
  batchSize: number,
): void {
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const placeholders = slice
      .map(() => `(${Array.from({ length: colCount }, () => '?').join(',')})`)
      .join(',');
    const flat: Array<string | number> = [];
    for (const row of slice) flat.push(...row);
    db.prepare(`${tableSql} VALUES ${placeholders}`).run(...flat);
  }
}

/** Hub + stock fields that live in `airports` / `airport_stock` (not RAM-only). */
export function airportPersistSignature(ap: AirportTerminal): string {
  const icao = String(ap.icao ?? '')
    .trim()
    .toUpperCase();
  const piles = COMMODITY_IDS.map((id) => {
    const pile = ap.inventory[id];
    return [
      id,
      sqlNum(pile?.stockKg),
      sqlNum(pile?.capacityKg),
      sqlNum(ap.baseProduction?.[id]),
      sqlNum(ap.baseConsumption?.[id]),
      sqlNum(ap.production?.[id]),
      sqlNum(ap.consumption?.[id]),
    ].join(':');
  }).join(',');
  return [
    icao,
    ap.name ?? '',
    ap.region ?? '',
    ap.hubTier ?? '',
    ap.bush ? 1 : 0,
    ap.bushTripOnly ? 1 : 0,
    sqlNum(ap.lat),
    sqlNum(ap.lon),
    sqlNum(ap.level, 1),
    sqlNum(ap.levelXp),
    sqlNum(ap.levelCurveVersion),
    sqlNum(ap.activityScore),
    sqlNum(ap.lastActivityTick),
    piles,
  ].join('|');
}

export type AirportPersistDiff = {
  mode: 'full' | 'skip' | 'patch';
  upsert: AirportTerminal[];
  removeIcaos: string[];
};

/** Full rewrite is cheaper than hundreds of per-hub DELETE+INSERT (hourly tick). */
const AIRPORT_PATCH_FULL_THRESHOLD = 80;

export function airportSignaturesFromList(
  airports: AirportTerminal[] | undefined,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const [icao, ap] of airportsByIcao(airports ?? [])) {
    m.set(icao, airportPersistSignature(ap));
  }
  return m;
}

export function diffAirportsForPersist(
  previous: AirportTerminal[] | undefined,
  next: AirportTerminal[],
): AirportPersistDiff {
  return diffAirportsBySignature(
    previous && previous.length > 0 ? airportSignaturesFromList(previous) : null,
    next,
  );
}

export function diffAirportsBySignature(
  previous: Map<string, string> | null | undefined,
  next: AirportTerminal[],
): AirportPersistDiff {
  if (!previous || previous.size === 0) {
    return { mode: 'full', upsert: next, removeIcaos: [] };
  }
  const nextMap = airportsByIcao(next);
  const upsert: AirportTerminal[] = [];
  for (const [icao, ap] of nextMap) {
    if (previous.get(icao) !== airportPersistSignature(ap)) {
      upsert.push(ap);
    }
  }
  const removeIcaos: string[] = [];
  for (const icao of previous.keys()) {
    if (!nextMap.has(icao)) removeIcaos.push(icao);
  }
  if (upsert.length === 0 && removeIcaos.length === 0) {
    return { mode: 'skip', upsert: [], removeIcaos: [] };
  }
  const touched = upsert.length + removeIcaos.length;
  if (touched >= AIRPORT_PATCH_FULL_THRESHOLD) {
    return { mode: 'full', upsert: next, removeIcaos: [] };
  }
  return { mode: 'patch', upsert, removeIcaos };
}

function airportsByIcao(airports: AirportTerminal[]): Map<string, AirportTerminal> {
  const byIcao = new Map<string, AirportTerminal>();
  for (const ap of airports) {
    const icao = String(ap.icao ?? '')
      .trim()
      .toUpperCase();
    if (!icao) continue;
    byIcao.set(icao, ap);
  }
  return byIcao;
}

function airportTableRows(
  worldId: string,
  byIcao: Map<string, AirportTerminal>,
): {
  hubRows: Array<Array<string | number>>;
  stockRows: Array<Array<string | number>>;
} {
  const hubRows: Array<Array<string | number>> = [];
  const stockRows: Array<Array<string | number>> = [];
  for (const [icao, ap] of byIcao) {
    hubRows.push([
      worldId,
      icao,
      ap.name ?? icao,
      ap.region ?? '',
      countryIdFromRegion(ap.region ?? '') || '',
      ap.hubTier ?? '',
      ap.bush ? 1 : 0,
      ap.bushTripOnly ? 1 : 0,
      sqlNum(ap.lat),
      sqlNum(ap.lon),
      sqlNum(ap.level, 1),
      sqlNum(ap.levelXp),
      sqlNum(ap.levelCurveVersion),
      sqlNum(ap.activityScore),
      sqlNum(ap.lastActivityTick),
    ]);
    for (const id of COMMODITY_IDS) {
      const pile = ap.inventory[id];
      stockRows.push([
        worldId,
        icao,
        id,
        sqlNum(pile?.stockKg),
        sqlNum(pile?.capacityKg),
        sqlNum(ap.baseProduction?.[id]),
        sqlNum(ap.baseConsumption?.[id]),
        sqlNum(ap.production?.[id]),
        sqlNum(ap.consumption?.[id]),
      ]);
    }
  }
  return { hubRows, stockRows };
}

function insertAirportTableRows(
  db: SqliteDb,
  worldId: string,
  byIcao: Map<string, AirportTerminal>,
): void {
  const { hubRows, stockRows } = airportTableRows(worldId, byIcao);
  insertRowBatches(
    db,
    `INSERT INTO airports (
       world_id, icao, name, region, country_id, hub_tier, bush, bush_trip_only,
       lat, lon, level, level_xp, level_curve_version, activity_score, last_activity_tick
     )`,
    15,
    hubRows,
    120,
  );
  insertRowBatches(
    db,
    `INSERT INTO airport_stock (
       world_id, icao, commodity_id, stock_kg, capacity_kg,
       base_production_per_tick_kg, base_consumption_per_tick_kg,
       production_per_tick_kg, consumption_per_tick_kg
     )`,
    9,
    stockRows,
    200,
  );
}

export function persistAirportsToTables(
  db: SqliteDb,
  airports: AirportTerminal[],
  worldId = LOCAL_WORLD_ID,
): void {
  ensureLocalWorld(db);
  db.prepare(`DELETE FROM airport_stock WHERE world_id = ?`).run(worldId);
  db.prepare(`DELETE FROM airports WHERE world_id = ?`).run(worldId);
  insertAirportTableRows(db, worldId, airportsByIcao(airports));
}

export function persistAirportsPatch(
  db: SqliteDb,
  upsert: AirportTerminal[],
  removeIcaos: string[],
  worldId = LOCAL_WORLD_ID,
): void {
  ensureLocalWorld(db);
  const delStock = db.prepare(
    `DELETE FROM airport_stock WHERE world_id = ? AND icao = ?`,
  );
  const delHub = db.prepare(`DELETE FROM airports WHERE world_id = ? AND icao = ?`);
  for (const raw of removeIcaos) {
    const icao = raw.trim().toUpperCase();
    if (!icao) continue;
    delStock.run(worldId, icao);
    delHub.run(worldId, icao);
  }
  const byIcao = airportsByIcao(upsert);
  for (const icao of byIcao.keys()) {
    delStock.run(worldId, icao);
    delHub.run(worldId, icao);
  }
  insertAirportTableRows(db, worldId, byIcao);
}

export function hydrateAirportsFromTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  const fromTable = readAirportsFromTables(db, worldId);
  if (fromTable.length > 0) world.airports = fromTable;
}

export function overlayEconomyMeta(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  const meta = readEconomyMeta(db, worldId);
  if (!meta) return;
  if (meta.seed) world.seed = meta.seed;
  world.tick = meta.tick;
  world.lastBatchAtMs = meta.lastBatchAtMs;
  world.lastSyncedAtMs = meta.lastBatchAtMs;
  if (meta.homeCountryId) world.homeCountryId = meta.homeCountryId;
}

export function persistWorldAirports(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
  previousSignatures?: Map<string, string> | null,
): void {
  persistEconomyMeta(db, world, worldId);
  const diff = diffAirportsBySignature(previousSignatures, world.airports ?? []);
  if (diff.mode === 'skip') return;
  if (diff.mode === 'patch') {
    persistAirportsPatch(db, diff.upsert, diff.removeIcaos, worldId);
    return;
  }
  persistAirportsToTables(db, world.airports ?? [], worldId);
}

function lotFromRow(r: {
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
}): ShipmentLot {
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
}

function readAirportRow(
  db: SqliteDb,
  icao: string,
  worldId: string,
): AirportTerminal | null {
  const hub = db
    .prepare(
      `SELECT icao, name, region, hub_tier, bush, bush_trip_only, lat, lon,
              level, level_xp, level_curve_version, activity_score, last_activity_tick
       FROM airports WHERE world_id = ? AND icao = ?`,
    )
    .get(worldId, icao) as
    | {
        icao: string;
        name: string;
        region: string;
        hub_tier: string;
        bush: number;
        bush_trip_only: number;
        lat: number;
        lon: number;
        level: number;
        level_xp: number;
        level_curve_version: number;
        activity_score: number;
        last_activity_tick: number;
      }
    | undefined;
  if (!hub) return null;
  const stock = db
    .prepare(
      `SELECT commodity_id, stock_kg, capacity_kg,
              base_production_per_tick_kg, base_consumption_per_tick_kg,
              production_per_tick_kg, consumption_per_tick_kg
       FROM airport_stock WHERE world_id = ? AND icao = ?`,
    )
    .all(worldId, icao) as Array<{
    commodity_id: string;
    stock_kg: number;
    capacity_kg: number;
    base_production_per_tick_kg: number;
    base_consumption_per_tick_kg: number;
    production_per_tick_kg: number;
    consumption_per_tick_kg: number;
  }>;
  return terminalFromAirportRow(hub, stock);
}

function emptyEconomyMeta(worldId: string): EconomyMetaRow {
  return {
    worldId,
    seed: '',
    tick: 0,
    lastBatchAtMs: 0,
    homeCountryId: '',
  };
}

/** Hub row + stock piles + clock meta. Skips lots (Inventory tab). */
export function readAirportInventory(
  db: SqliteDb,
  icaoRaw: string,
  worldId = LOCAL_WORLD_ID,
): AirportInventorySnapshot | null {
  const icao = icaoRaw.trim().toUpperCase();
  if (!icao) return null;
  const airport = readAirportRow(db, icao, worldId);
  if (!airport) return null;
  return {
    worldId,
    meta: readEconomyMeta(db, worldId) ?? emptyEconomyMeta(worldId),
    airport,
  };
}

function readAirportsByIcao(
  db: SqliteDb,
  icaos: string[],
  worldId: string,
): AirportTerminal[] {
  const unique = [...new Set(icaos.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const out: AirportTerminal[] = [];
  for (const icao of unique) {
    const ap = readAirportRow(db, icao, worldId);
    if (ap) out.push(ap);
  }
  return out;
}

export function readAirportBoard(
  db: SqliteDb,
  icaoRaw: string,
  worldId = LOCAL_WORLD_ID,
): AirportBoardSnapshot | null {
  const icao = icaoRaw.trim().toUpperCase();
  if (!icao) return null;
  const airport = readAirportRow(db, icao, worldId);
  if (!airport) return null;
  const meta = readEconomyMeta(db, worldId) ?? emptyEconomyMeta(worldId);
  const lotRows = db
    .prepare(
      `SELECT id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
              created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status
       FROM lots
       WHERE world_id = ?
         AND (origin_icao = ? OR dest_icao = ?)
         AND status IN ('available', 'reserved', 'in_transit')
       ORDER BY created_at_tick ASC, id ASC`,
    )
    .all(worldId, icao, icao) as Array<{
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
  const lots = lotRows.map(lotFromRow);
  const partnerIcaos = lots.flatMap((l) => [l.originIcao, l.destIcao]).filter((c) => c !== icao);
  const relatedAirports = readAirportsByIcao(db, partnerIcaos, worldId);
  return { worldId, meta, airport, lots, relatedAirports };
}

/** Drop airports from the economy blob remainder once tables are SoT. */
export function stripEconomyAirports(
  blob: Record<string, unknown>,
): Record<string, unknown> {
  return { ...blob, airports: [] };
}

export function economyBlobHasAirports(raw: Record<string, unknown>): boolean {
  return Array.isArray(raw.airports) && raw.airports.length > 0;
}

/**
 * Copy blob airports → tables when the v4 tables are empty, then strip the blob.
 */
export function migrateV3toV4IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV4Ddl(db);
  ensureLocalWorld(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 4) {
    db.prepare(`UPDATE companies SET world_id = ? WHERE world_id IS NULL OR world_id = ''`).run(
      LOCAL_WORLD_ID,
    );
    return;
  }

  const econRow = db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as
    | { json: string }
    | undefined;
  let economy: CareerEconomyWorld | null = null;
  if (econRow) {
    try {
      economy = JSON.parse(econRow.json) as CareerEconomyWorld;
    } catch {
      economy = null;
    }
  }

  withSqliteTransaction(db, () => {
    if (economy) {
      if ((economy.airports?.length ?? 0) > 0) {
        persistWorldAirports(db, economy, LOCAL_WORLD_ID);
      } else {
        persistEconomyMeta(db, economy, LOCAL_WORLD_ID);
      }
      const stripped = stripEconomyAirports(economy as unknown as Record<string, unknown>);
      db.prepare(`UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`).run(
        JSON.stringify(stripped),
        Date.now(),
      );
    }

    db.prepare(`UPDATE companies SET world_id = ? WHERE world_id IS NULL OR world_id = ''`).run(
      LOCAL_WORLD_ID,
    );
    db.prepare(
      `UPDATE lots SET world_id = ? WHERE world_id IS NULL OR world_id = ''`,
    ).run(LOCAL_WORLD_ID);

    metaSet(db, 'schema_version', schemaVersion);
  });
}

export function stampCompanyWorldId(
  db: SqliteDb,
  companyId = LOCAL_COMPANY_ID,
  worldId = LOCAL_WORLD_ID,
): void {
  if (!columnExists(db, 'companies', 'world_id')) return;
  db.prepare(`UPDATE companies SET world_id = COALESCE(NULLIF(world_id, ''), ?) WHERE id = ?`).run(
    worldId,
    companyId,
  );
}
