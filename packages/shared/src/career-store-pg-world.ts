/**
 * Postgres relational tables for career MP world (phase 2).
 * Hot economy slices (lots / airports / stock / inbound) + world-ops
 * (npc / fuel / demand / ports) + aircraft dealer pool + charter + company
 * tables are the economy SoT. Leftover scalars/arrays live in
 * economy_meta.misc_json. Schema v16 promotes fleet_aircraft payload fields
 * to columns (registration / hours / MX / config). v15 drops PG stubs
 * economy_json / company_missions (see career-store-postgres.ts). SP SQLite
 * mirrors fleet columns via ensureV3Ddl ALTERs. Meta/auth stay in
 * career-store-postgres.ts.
 */

import type pg from 'pg';
import { CAREER_COMMODITIES } from './career-economy.js';
import { countryIdFromRegion } from './career-partition.js';
import { normalizeCareerLedger } from './career-ledger.js';
import {
  assertCompanyPersistSafe,
  companyProgressFromState,
} from './career-store-company-guard.js';
import {
  assembleFleetAircraftFromRow,
  splitFleetAircraftForPersist,
} from './career-store-fleet-columns.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type {
  AircraftInstance,
  AircraftInstanceStatus,
  AircraftListingKind,
  AirframeCondition,
  AirportTerminal,
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerLedgerKind,
  CareerMissionsState,
  CharterDemand,
  CharterHubState,
  CharterOffer,
  CharterOfferStatus,
  CharterTier,
  CharterUrgency,
  CommodityId,
  DemandOrder,
  DemandOrderStatus,
  EconomyEvent,
  FreighterClassId,
  FuelHaul,
  FuelTruck,
  FuelTruckClassId,
  HubTier,
  InboundPending,
  MissionIntent,
  MissionStatus,
  NpcFlight,
  NpcFreighter,
  PlayerAircraft,
  PlayerFboState,
  PortConcessionIndexRow,
  PortInventoryRow,
  PortListing,
  PortListingStatus,
  ShipmentLot,
  ShipmentLotStatus,
  StockPile,
} from './types/career-economy.js';

const BATCH_SIZE = 200;
const HUB_TIERS = new Set<HubTier>(['major', 'regional', 'spoke']);
const NPC_STATUSES = new Set<NpcFreighter['status']>([
  'idle',
  'busy',
  'resting',
  'maintenance',
]);
const FUEL_TRUCK_CLASSES = new Set<FuelTruckClassId>([
  'rigid_tanker',
  'semi_tanker',
  'btrain_tanker',
]);
const FUEL_TRUCK_STATUSES = new Set<FuelTruck['status']>([
  'idle',
  'enroute',
  'turnaround',
]);
const FUEL_HAUL_STATUSES = new Set<FuelHaul['status']>(['enroute', 'completed']);
const DEMAND_STATUSES = new Set<DemandOrderStatus>(['open', 'filled', 'expired']);
const PORT_LISTING_STATUSES = new Set<PortListingStatus>([
  'open',
  'sold_out',
  'expired',
]);
const INSTANCE_STATUSES = new Set<AircraftInstanceStatus>(['available', 'sold']);
const LISTING_KINDS = new Set<AircraftListingKind>(['new', 'used', 'lease']);
const CONDITIONS = new Set<AirframeCondition>([
  'excellent',
  'good',
  'fair',
  'tired',
]);

/** Full terminal stock ids (cargo + fuel + MRO) — same set as SQLite v4. */
const STOCK_COMMODITY_IDS: readonly CommodityId[] = CAREER_COMMODITIES.map(
  (c) => c.id,
);

export const PG_WORLD_DDL = `
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS economy_meta (
  world_id TEXT PRIMARY KEY NOT NULL REFERENCES worlds(id),
  seed TEXT NOT NULL,
  tick INTEGER NOT NULL,
  last_batch_at_ms BIGINT NOT NULL,
  home_country_id TEXT NOT NULL DEFAULT '',
  misc_json JSONB,
  revision BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS airports (
  world_id TEXT NOT NULL REFERENCES worlds(id),
  icao TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  country_id TEXT NOT NULL,
  hub_tier TEXT NOT NULL DEFAULT '',
  bush BOOLEAN NOT NULL DEFAULT FALSE,
  bush_trip_only BOOLEAN NOT NULL DEFAULT FALSE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  level INTEGER NOT NULL,
  level_xp DOUBLE PRECISION NOT NULL DEFAULT 0,
  level_curve_version INTEGER NOT NULL DEFAULT 0,
  activity_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_activity_tick INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, icao)
);
CREATE INDEX IF NOT EXISTS airports_region_idx ON airports(world_id, region);
CREATE INDEX IF NOT EXISTS airports_country_idx ON airports(world_id, country_id);

CREATE TABLE IF NOT EXISTS airport_stock (
  world_id TEXT NOT NULL,
  icao TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  stock_kg DOUBLE PRECISION NOT NULL,
  capacity_kg DOUBLE PRECISION NOT NULL,
  base_production_per_tick_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_consumption_per_tick_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  production_per_tick_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumption_per_tick_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, icao, commodity_id),
  FOREIGN KEY (world_id, icao) REFERENCES airports(world_id, icao)
);
CREATE INDEX IF NOT EXISTS airport_stock_icao_idx ON airport_stock(world_id, icao);

CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY NOT NULL,
  commodity_id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  quantity_kg DOUBLE PRECISION NOT NULL,
  reserved_kg DOUBLE PRECISION NOT NULL,
  created_at_tick INTEGER NOT NULL,
  expires_at_tick INTEGER NOT NULL,
  pay_usd DOUBLE PRECISION NOT NULL,
  base_pay_usd DOUBLE PRECISION,
  urgency TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  origin_country_id TEXT,
  dest_country_id TEXT,
  world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}',
  claimed_by_company_id TEXT
);
CREATE INDEX IF NOT EXISTS lots_world_origin_idx ON lots(world_id, origin_icao);
CREATE INDEX IF NOT EXISTS lots_world_dest_idx ON lots(world_id, dest_icao);
CREATE INDEX IF NOT EXISTS lots_world_claimed_idx ON lots(world_id, claimed_by_company_id);
CREATE INDEX IF NOT EXISTS lots_status_idx ON lots(status);
CREATE INDEX IF NOT EXISTS lots_expires_idx ON lots(expires_at_tick);

CREATE TABLE IF NOT EXISTS inbound_pending (
  id TEXT PRIMARY KEY NOT NULL,
  mission_id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  cargo_kg DOUBLE PRECISION NOT NULL,
  expires_at_tick INTEGER NOT NULL,
  source TEXT NOT NULL,
  payload_json JSONB,
  world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}'
);
CREATE INDEX IF NOT EXISTS inbound_world_dest_idx ON inbound_pending(world_id, dest_icao);

CREATE TABLE IF NOT EXISTS company_state (
  company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id),
  wallet_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  pilot_name TEXT NOT NULL DEFAULT '',
  pilot_icao TEXT NOT NULL DEFAULT '',
  hub_selected BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_tick INTEGER NOT NULL DEFAULT 0,
  company_credit_json JSONB,
  cargo_ops_json JSONB,
  class_ops_json JSONB,
  aircraft_market_json JSONB,
  aircraft_market_day INTEGER,
  aircraft_market_demand_day INTEGER,
  airframe_perf_json JSONB,
  player_fbos_json JSONB,
  company_crew_json JSONB,
  ground_staff_json JSONB,
  active_bush_trip_json JSONB,
  port_pickups_json JSONB,
  player_warehouses_json JSONB,
  player_port_concessions_json JSONB,
  port_auto_buy_orders_json JSONB,
  updated_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS fleet_aircraft (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  aircraft_class_id TEXT NOT NULL,
  airframe_type_id TEXT,
  label TEXT NOT NULL,
  location_icao TEXT NOT NULL,
  fuel_kg DOUBLE PRECISION NOT NULL,
  fuel_capacity_kg DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  assigned_mission_id TEXT,
  ownership TEXT,
  registration TEXT,
  condition TEXT,
  hours_airframe DOUBLE PRECISION,
  hours_engine DOUBLE PRECISION,
  airframe_condition_pct DOUBLE PRECISION,
  engine_condition_pct DOUBLE PRECISION,
  hours_since_inspection DOUBLE PRECISION,
  maintenance_due_at_hours DOUBLE PRECISION,
  airframe_configuration_id TEXT,
  roles_pack_rel_path TEXT,
  lease_overdue BOOLEAN,
  listed_listing_id TEXT,
  lease_json JSONB,
  lease_out_json JSONB,
  payload_json JSONB
);
CREATE INDEX IF NOT EXISTS fleet_company_status_idx ON fleet_aircraft(company_id, status);
CREATE INDEX IF NOT EXISTS fleet_location_idx ON fleet_aircraft(location_icao);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  aircraft_id TEXT,
  mission_type TEXT NOT NULL DEFAULT 'freight',
  charter_offer_id TEXT,
  pax INTEGER NOT NULL DEFAULT 0,
  baggage_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  commodity_id TEXT NOT NULL,
  cargo_kg DOUBLE PRECISION NOT NULL,
  pay_usd DOUBLE PRECISION NOT NULL,
  accepted_at_tick INTEGER NOT NULL,
  deadline_tick INTEGER NOT NULL,
  departed_at_tick INTEGER,
  settled_at_tick INTEGER,
  urgency TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json JSONB
);
CREATE INDEX IF NOT EXISTS missions_company_status_idx ON missions(company_id, status);
CREATE INDEX IF NOT EXISTS missions_od_idx ON missions(origin_icao, dest_icao);
CREATE INDEX IF NOT EXISTS missions_company_type_status_idx
  ON missions(company_id, mission_type, status);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  at_tick INTEGER NOT NULL,
  day_index INTEGER NOT NULL,
  amount_usd DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  aircraft_id TEXT,
  mission_id TEXT,
  icao TEXT
);
CREATE INDEX IF NOT EXISTS ledger_company_tick_idx ON ledger(company_id, at_tick);
CREATE INDEX IF NOT EXISTS ledger_day_idx ON ledger(day_index);

CREATE TABLE IF NOT EXISTS npc_flights (
  id TEXT PRIMARY KEY NOT NULL,
  npc_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  cargo_kg DOUBLE PRECISION NOT NULL,
  pay_usd DOUBLE PRECISION NOT NULL,
  aircraft_class_id TEXT NOT NULL,
  departed_at_tick INTEGER NOT NULL,
  arrives_at_tick INTEGER NOT NULL,
  departed_at_ms BIGINT NOT NULL,
  arrives_at_ms BIGINT NOT NULL,
  status TEXT NOT NULL,
  origin_country_id TEXT,
  dest_country_id TEXT,
  payload_json JSONB,
  world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}'
);
CREATE INDEX IF NOT EXISTS npc_flights_world_status_idx ON npc_flights(world_id, status);

CREATE TABLE IF NOT EXISTS economy_events (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  region TEXT NOT NULL,
  commodity_id TEXT,
  starts_at_tick INTEGER NOT NULL,
  ends_at_tick INTEGER NOT NULL,
  label TEXT NOT NULL,
  country_id TEXT,
  payload_json JSONB,
  world_id TEXT NOT NULL DEFAULT '${LOCAL_WORLD_ID}'
);
CREATE INDEX IF NOT EXISTS economy_events_world_ends_idx ON economy_events(world_id, ends_at_tick);

CREATE TABLE IF NOT EXISTS npcs (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  aircraft_class_id TEXT NOT NULL,
  airframe_type_id TEXT,
  max_cargo_kg DOUBLE PRECISION,
  home_region TEXT NOT NULL,
  home_country_id TEXT NOT NULL DEFAULT '',
  reliability DOUBLE PRECISION NOT NULL,
  aggressiveness DOUBLE PRECISION NOT NULL,
  fee_bias DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  busy_until_tick INTEGER,
  busy_until_ms BIGINT,
  duty_hours_accum DOUBLE PRECISION,
  last_leg_duty_hours DOUBLE PRECISION,
  rest_until_tick INTEGER,
  rest_until_ms BIGINT,
  hours_since_mx DOUBLE PRECISION,
  location_icao TEXT,
  mx_until_ms BIGINT,
  mx_until_tick INTEGER,
  leased_player_aircraft_id TEXT,
  current_flight_id TEXT,
  payload_json JSONB,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS npcs_status_idx ON npcs(world_id, status);
CREATE INDEX IF NOT EXISTS npcs_region_idx ON npcs(world_id, home_region);

CREATE TABLE IF NOT EXISTS fuel_trucks (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  truck_class_id TEXT NOT NULL,
  home_region TEXT NOT NULL,
  status TEXT NOT NULL,
  current_haul_id TEXT,
  busy_until_ms BIGINT,
  payload_json JSONB,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS fuel_trucks_status_idx ON fuel_trucks(world_id, status);

CREATE TABLE IF NOT EXISTS fuel_hauls (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  truck_id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  cargo_kg DOUBLE PRECISION NOT NULL,
  departed_at_ms BIGINT NOT NULL,
  arrives_at_ms BIGINT NOT NULL,
  status TEXT NOT NULL,
  payload_json JSONB,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS fuel_hauls_status_idx ON fuel_hauls(world_id, status);
CREATE INDEX IF NOT EXISTS fuel_hauls_dest_idx ON fuel_hauls(world_id, dest_icao);

CREATE TABLE IF NOT EXISTS demand_orders (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  wanted_kg DOUBLE PRECISION NOT NULL,
  remaining_kg DOUBLE PRECISION NOT NULL,
  max_unit_price_usd DOUBLE PRECISION NOT NULL,
  arrived_at_tick INTEGER NOT NULL,
  expires_at_tick INTEGER NOT NULL,
  status TEXT NOT NULL,
  port_id TEXT,
  payload_json JSONB,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS demand_orders_status_idx ON demand_orders(world_id, status);
CREATE INDEX IF NOT EXISTS demand_orders_dest_idx ON demand_orders(world_id, dest_icao);
CREATE INDEX IF NOT EXISTS demand_orders_port_idx ON demand_orders(world_id, port_id);

CREATE TABLE IF NOT EXISTS port_listings (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  port_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  available_kg DOUBLE PRECISION NOT NULL,
  unit_price_usd DOUBLE PRECISION NOT NULL,
  allocated_hub_icao TEXT NOT NULL,
  arrived_at_tick INTEGER NOT NULL,
  expires_at_tick INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json JSONB,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS port_listings_port_idx ON port_listings(world_id, port_id, status);

CREATE TABLE IF NOT EXISTS port_inventories (
  world_id TEXT NOT NULL,
  port_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  stock_kg DOUBLE PRECISION NOT NULL,
  last_restock_tick INTEGER NOT NULL,
  PRIMARY KEY (world_id, port_id, commodity_id)
);

CREATE TABLE IF NOT EXISTS port_concessions (
  world_id TEXT NOT NULL,
  port_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  lease_paid_through_tick INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (world_id, port_id)
);

CREATE TABLE IF NOT EXISTS aircraft_instances (
  world_id TEXT NOT NULL REFERENCES worlds(id),
  id TEXT NOT NULL,
  airframe_type_id TEXT NOT NULL,
  aircraft_class_id TEXT NOT NULL,
  country_id TEXT NOT NULL,
  based_icao TEXT NOT NULL,
  registration TEXT NOT NULL,
  kind TEXT NOT NULL,
  condition TEXT NOT NULL,
  hours_airframe DOUBLE PRECISION NOT NULL,
  hours_engine DOUBLE PRECISION NOT NULL,
  airframe_condition_pct DOUBLE PRECISION,
  engine_condition_pct DOUBLE PRECISION,
  status TEXT NOT NULL,
  seeded_at_tick INTEGER NOT NULL,
  available_at_tick INTEGER,
  PRIMARY KEY (world_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS aircraft_instances_reg_idx
  ON aircraft_instances(world_id, registration);
CREATE INDEX IF NOT EXISTS aircraft_instances_country_idx
  ON aircraft_instances(world_id, country_id, status);

CREATE TABLE IF NOT EXISTS charter_demand (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  pressure DOUBLE PRECISION NOT NULL,
  international BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_tick INTEGER NOT NULL,
  updated_at_tick INTEGER NOT NULL,
  last_offered_day INTEGER NOT NULL,
  fulfilled_groups INTEGER NOT NULL DEFAULT 0,
  expired_groups INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS charter_demand_od_idx
  ON charter_demand(world_id, origin_icao, dest_icao);
CREATE INDEX IF NOT EXISTS charter_demand_pressure_idx
  ON charter_demand(world_id, pressure);

CREATE TABLE IF NOT EXISTS charter_hubs (
  world_id TEXT NOT NULL,
  icao TEXT NOT NULL,
  waiting_pax DOUBLE PRECISION NOT NULL DEFAULT 0,
  attract_pax DOUBLE PRECISION NOT NULL DEFAULT 0,
  capacity_pax INTEGER NOT NULL DEFAULT 24,
  updated_at_tick INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, icao)
);
CREATE INDEX IF NOT EXISTS charter_hubs_waiting_idx
  ON charter_hubs(world_id, waiting_pax);

CREATE TABLE IF NOT EXISTS charter_offers (
  world_id TEXT NOT NULL,
  id TEXT NOT NULL,
  demand_id TEXT NOT NULL,
  origin_icao TEXT NOT NULL,
  dest_icao TEXT NOT NULL,
  group_size INTEGER NOT NULL CHECK (group_size BETWEEN 1 AND 12),
  baggage_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_nm DOUBLE PRECISION NOT NULL,
  tier TEXT NOT NULL,
  urgency TEXT NOT NULL,
  international BOOLEAN NOT NULL DEFAULT FALSE,
  pay_usd DOUBLE PRECISION NOT NULL,
  created_at_tick INTEGER NOT NULL,
  expires_at_tick INTEGER NOT NULL,
  status TEXT NOT NULL,
  mission_id TEXT,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS charter_offers_status_expiry_idx
  ON charter_offers(world_id, status, expires_at_tick);
CREATE INDEX IF NOT EXISTS charter_offers_od_idx
  ON charter_offers(world_id, origin_icao, dest_icao);
`;

function asHubTier(raw: string | null | undefined): HubTier | undefined {
  const t = String(raw ?? '').trim();
  return HUB_TIERS.has(t as HubTier) ? (t as HubTier) : undefined;
}

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Truncate for Postgres BIGINT columns (wall-clock ms must be integers). */
function sqlBigint(v: unknown, fallback = 0): number {
  return Math.trunc(sqlNum(v, fallback));
}

function sqlOptBigint(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function revisionBigInt(value: unknown): bigint {
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

function optNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function optText(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
}

function rowId(row: { id?: unknown }): string {
  return typeof row.id === 'string' ? row.id.trim() : '';
}

/** Last row wins — mirrors SQLite uniqueByKey for colliding blob ids. */
function uniqueByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

function jsonParam(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function stockRowToPile(stockKg: number, capacityKg: number): StockPile {
  return { stockKg, capacityKg };
}

function icaoCountryMap(
  airports: Array<{ icao?: string; region?: string }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ap of airports ?? []) {
    const icao = String(ap.icao ?? '')
      .trim()
      .toUpperCase();
    if (!icao) continue;
    map.set(icao, countryIdFromRegion(ap.region ?? ''));
  }
  return map;
}

function countryForIcao(map: Map<string, string>, icao: string): string {
  return map.get(icao.trim().toUpperCase()) ?? '';
}

function placeholders(rowCount: number, colCount: number): string {
  const parts: string[] = [];
  let n = 1;
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < colCount; c++) cols.push(`$${n++}`);
    parts.push(`(${cols.join(',')})`);
  }
  return parts.join(',');
}

async function insertChunks(
  client: pg.PoolClient,
  sqlPrefix: string,
  colCount: number,
  rows: unknown[][],
  chunkSize = BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const flat = chunk.flat();
    await client.query(
      `${sqlPrefix} VALUES ${placeholders(chunk.length, colCount)}`,
      flat,
    );
  }
}

async function withTx<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export class PgEconomyRevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: bigint,
    readonly actualRevision: bigint,
  ) {
    super(
      `Postgres economy revision conflict: expected ${expectedRevision}, actual ${actualRevision}`,
    );
    this.name = 'PgEconomyRevisionConflictError';
  }
}

async function lockEconomyRevision(
  client: pg.PoolClient,
  worldId: string,
  expectedRevision?: bigint,
): Promise<bigint> {
  const result = await client.query(
    `SELECT revision FROM economy_meta WHERE world_id = $1 FOR UPDATE`,
    [worldId],
  );
  const actual = revisionBigInt(result.rows[0]?.revision);
  if (
    expectedRevision !== undefined &&
    actual !== expectedRevision
  ) {
    throw new PgEconomyRevisionConflictError(expectedRevision, actual);
  }
  return actual;
}

async function bumpEconomyRevision(
  client: pg.PoolClient,
  worldId: string,
): Promise<bigint> {
  const result = await client.query(
    `UPDATE economy_meta
     SET revision = revision + 1
     WHERE world_id = $1
     RETURNING revision`,
    [worldId],
  );
  if (result.rows.length === 0) {
    throw new Error(`Missing economy_meta for world ${worldId}`);
  }
  return revisionBigInt(result.rows[0]?.revision);
}

async function withRevisionedTx(
  pool: pg.Pool,
  worldId: string,
  expectedRevision: bigint | undefined,
  fn: (client: pg.PoolClient) => Promise<void>,
): Promise<bigint> {
  return withTx(pool, async (client) => {
    await ensureWorldRow(client, worldId);
    await lockEconomyRevision(client, worldId, expectedRevision);
    await fn(client);
    return bumpEconomyRevision(client, worldId);
  });
}

export async function ensurePgWorldDdl(pool: pg.Pool): Promise<void> {
  await pool.query(PG_WORLD_DDL);
  await pool.query(
    `ALTER TABLE economy_meta ADD COLUMN IF NOT EXISTS misc_json JSONB`,
  );
  // Schema v17 — cross-process API/worker cache coherence + stale-write guard.
  await pool.query(
    `ALTER TABLE economy_meta ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0`,
  );
  // Schema v16 — promote fleet payload fields (idempotent on existing worlds).
  const fleetAlters = [
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS registration TEXT`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS condition TEXT`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS hours_airframe DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS hours_engine DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS airframe_condition_pct DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS engine_condition_pct DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS hours_since_inspection DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS maintenance_due_at_hours DOUBLE PRECISION`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS airframe_configuration_id TEXT`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS roles_pack_rel_path TEXT`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS lease_overdue BOOLEAN`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS listed_listing_id TEXT`,
    `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS lease_out_json JSONB`,
  ];
  for (const sql of fleetAlters) {
    await pool.query(sql);
  }
  await pool.query(
    `CREATE INDEX IF NOT EXISTS fleet_registration_idx ON fleet_aircraft(registration)`,
  );
  // One-shot backfill from legacy payload_json (only fill NULL columns).
  await pool.query(`
    UPDATE fleet_aircraft SET
      registration = COALESCE(registration, NULLIF(payload_json->>'registration', '')),
      condition = COALESCE(condition, NULLIF(payload_json->>'condition', '')),
      hours_airframe = COALESCE(
        hours_airframe,
        NULLIF(payload_json->>'hoursAirframe', '')::double precision
      ),
      hours_engine = COALESCE(
        hours_engine,
        NULLIF(payload_json->>'hoursEngine', '')::double precision
      ),
      airframe_condition_pct = COALESCE(
        airframe_condition_pct,
        NULLIF(payload_json->>'airframeConditionPct', '')::double precision
      ),
      engine_condition_pct = COALESCE(
        engine_condition_pct,
        NULLIF(payload_json->>'engineConditionPct', '')::double precision
      ),
      hours_since_inspection = COALESCE(
        hours_since_inspection,
        NULLIF(payload_json->>'hoursSinceInspection', '')::double precision
      ),
      maintenance_due_at_hours = COALESCE(
        maintenance_due_at_hours,
        NULLIF(payload_json->>'maintenanceDueAtHours', '')::double precision
      ),
      airframe_configuration_id = COALESCE(
        airframe_configuration_id,
        NULLIF(payload_json->>'airframeConfigurationId', '')
      ),
      roles_pack_rel_path = COALESCE(
        roles_pack_rel_path,
        NULLIF(payload_json->>'rolesPackRelPath', '')
      ),
      lease_overdue = COALESCE(
        lease_overdue,
        CASE
          WHEN payload_json->>'leaseOverdue' = 'true' THEN TRUE
          WHEN payload_json->>'leaseOverdue' = 'false' THEN FALSE
          ELSE NULL
        END
      ),
      listed_listing_id = COALESCE(
        listed_listing_id,
        NULLIF(payload_json->>'listedListingId', '')
      ),
      lease_out_json = COALESCE(
        lease_out_json,
        CASE
          WHEN jsonb_typeof(payload_json->'leaseOut') = 'object'
            THEN payload_json->'leaseOut'
          ELSE NULL
        END
      )
    WHERE payload_json IS NOT NULL
  `);
}

/** Leftover economy fields that are not yet relational tables. */
const PG_ECONOMY_MISC_KEYS = [
  'internationalLanes',
  'flow',
  'portInboundShips',
  'tourLotSoftHolds',
  'aircraftPoolCatalogHash',
  'regionalRecovery',
  'version',
] as const;

export function pickPgEconomyMisc(
  world: CareerEconomyWorld,
): Record<string, unknown> {
  const src = world as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PG_ECONOMY_MISC_KEYS) {
    const v = src[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function applyPgEconomyMisc(
  world: CareerEconomyWorld,
  misc: unknown,
): void {
  if (misc == null || typeof misc !== 'object' || Array.isArray(misc)) return;
  const src = misc as Record<string, unknown>;
  const dst = world as unknown as Record<string, unknown>;
  for (const key of PG_ECONOMY_MISC_KEYS) {
    if (src[key] !== undefined) dst[key] = src[key];
  }
}

/**
 * Empty CareerEconomyWorld shell for PG hydrate (tables fill slices).
 * Does not call createSeedEconomyWorld / migrateEconomyWorld (those seed hubs).
 */
export function emptyPgEconomyShell(meta: {
  seed: string;
  tick: number;
  lastBatchAtMs: number;
  homeCountryId: string;
}): CareerEconomyWorld {
  const home = meta.homeCountryId.trim();
  return {
    version: 3,
    seed: meta.seed || 'skyline-career-br-v1',
    tick: Number.isFinite(meta.tick) ? meta.tick : 0,
    lastBatchAtMs: Number.isFinite(meta.lastBatchAtMs)
      ? meta.lastBatchAtMs
      : Date.now(),
    lastSyncedAtMs: Number.isFinite(meta.lastBatchAtMs)
      ? meta.lastBatchAtMs
      : Date.now(),
    ...(home ? { homeCountryId: home } : {}),
    airports: [],
    lots: [],
    events: [],
    npcs: [],
    npcFlights: [],
    inboundPending: [],
    fuelTrucks: [],
    fuelHauls: [],
    demandOrders: [],
    portListings: [],
    portInventories: [],
    portConcessions: [],
    aircraftInstances: [],
    charterDemand: [],
    charterOffers: [],
    charterHubs: [],
    internationalLanes: [],
  };
}

export function isPgEconomyMiscEmpty(misc: unknown): boolean {
  if (misc == null) return true;
  if (typeof misc !== 'object' || Array.isArray(misc)) return true;
  return Object.keys(misc as object).length === 0;
}

async function ensureWorldRow(
  client: pg.PoolClient,
  worldId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO worlds (id, display_name, created_at_ms)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [worldId, worldId === LOCAL_WORLD_ID ? 'Local world' : worldId, Date.now()],
  );
}

function terminalFromAirportRow(
  row: {
    icao: string;
    name: string;
    region: string;
    hub_tier: string;
    bush: boolean;
    bush_trip_only: boolean;
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
    inventory[id] = stockRowToPile(num(s.stock_kg), num(s.capacity_kg));
    production[id] = num(s.production_per_tick_kg);
    consumption[id] = num(s.consumption_per_tick_kg);
    baseProduction[id] = num(s.base_production_per_tick_kg);
    baseConsumption[id] = num(s.base_consumption_per_tick_kg);
  }
  const terminal: AirportTerminal = {
    icao: row.icao,
    name: row.name,
    region: row.region,
    lat: num(row.lat),
    lon: num(row.lon),
    level: num(row.level, 1),
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
  if (num(row.level_xp)) terminal.levelXp = num(row.level_xp);
  if (num(row.level_curve_version)) {
    terminal.levelCurveVersion = num(row.level_curve_version);
  }
  if (num(row.activity_score)) terminal.activityScore = num(row.activity_score);
  if (num(row.last_activity_tick)) {
    terminal.lastActivityTick = num(row.last_activity_tick);
  }
  return terminal;
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
  claimed_by_company_id?: string | null;
}): ShipmentLot {
  const lot: ShipmentLot = {
    id: r.id,
    commodityId: r.commodity_id as CommodityId,
    originIcao: r.origin_icao,
    destIcao: r.dest_icao,
    quantityKg: num(r.quantity_kg),
    reservedKg: num(r.reserved_kg),
    createdAtTick: num(r.created_at_tick),
    expiresAtTick: num(r.expires_at_tick),
    payUsd: num(r.pay_usd),
    urgency: r.urgency === 'urgent' ? 'urgent' : 'normal',
    reason: r.reason,
    status: r.status as ShipmentLotStatus,
  };
  if (r.base_pay_usd != null && Number.isFinite(Number(r.base_pay_usd))) {
    lot.basePayUsd = num(r.base_pay_usd);
  }
  const claim = r.claimed_by_company_id?.trim();
  if (claim) lot.claimedByCompanyId = claim;
  return lot;
}

function inboundFromRow(r: {
  id: string;
  mission_id: string;
  origin_icao: string;
  dest_icao: string;
  commodity_id: string;
  cargo_kg: number;
  expires_at_tick: number;
  source: string;
  payload_json: unknown;
}): InboundPending {
  const base: InboundPending = {
    id: r.id,
    missionId: r.mission_id,
    originIcao: r.origin_icao,
    destIcao: r.dest_icao,
    commodityId: r.commodity_id as CommodityId,
    cargoKg: num(r.cargo_kg),
    expiresAtTick: num(r.expires_at_tick),
    source: 'player',
  };
  const extra = parseJson<Partial<InboundPending>>(r.payload_json);
  return extra ? ({ ...extra, ...base } as InboundPending) : base;
}

function npcFromRow(r: Record<string, unknown>): NpcFreighter {
  const extra = parseJson<Record<string, unknown>>(r.payload_json) ?? {};
  const statusRaw = String(r.status ?? '');
  const status = NPC_STATUSES.has(statusRaw as NpcFreighter['status'])
    ? (statusRaw as NpcFreighter['status'])
    : 'idle';
  const npc: NpcFreighter = {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    aircraftClassId: String(r.aircraft_class_id ?? '') as FreighterClassId,
    homeRegion: String(r.home_region ?? ''),
    reliability: num(r.reliability),
    aggressiveness: num(r.aggressiveness),
    feeBias: num(r.fee_bias),
    status,
  };
  const airframe = optText(r.airframe_type_id);
  if (airframe) npc.airframeTypeId = airframe;
  const maxCargo = optNum(r.max_cargo_kg);
  if (maxCargo != null) npc.maxCargoKg = maxCargo;
  const busyTick = optNum(r.busy_until_tick);
  if (busyTick != null) npc.busyUntilTick = busyTick;
  const busyMs = optNum(r.busy_until_ms);
  if (busyMs != null) npc.busyUntilMs = busyMs;
  const duty = optNum(r.duty_hours_accum);
  if (duty != null) npc.dutyHoursAccum = duty;
  const lastLeg = optNum(r.last_leg_duty_hours);
  if (lastLeg != null) npc.lastLegDutyHours = lastLeg;
  const restTick = optNum(r.rest_until_tick);
  if (restTick != null) npc.restUntilTick = restTick;
  const restMs = optNum(r.rest_until_ms);
  if (restMs != null) npc.restUntilMs = restMs;
  const hoursMx = optNum(r.hours_since_mx);
  if (hoursMx != null) npc.hoursSinceMx = hoursMx;
  const loc = optText(r.location_icao);
  if (loc) npc.locationIcao = loc;
  const mxMs = optNum(r.mx_until_ms);
  if (mxMs != null) npc.mxUntilMs = mxMs;
  const mxTick = optNum(r.mx_until_tick);
  if (mxTick != null) npc.mxUntilTick = mxTick;
  const leased = optText(r.leased_player_aircraft_id);
  if (leased) npc.leasedPlayerAircraftId = leased;
  const flight = optText(r.current_flight_id);
  if (flight) npc.currentFlightId = flight;
  return { ...extra, ...npc } as NpcFreighter;
}

function fuelTruckFromRow(r: Record<string, unknown>): FuelTruck {
  const extra = parseJson<Record<string, unknown>>(r.payload_json) ?? {};
  const classRaw = String(r.truck_class_id ?? '');
  const truckClassId = FUEL_TRUCK_CLASSES.has(classRaw as FuelTruckClassId)
    ? (classRaw as FuelTruckClassId)
    : 'rigid_tanker';
  const statusRaw = String(r.status ?? '');
  const status = FUEL_TRUCK_STATUSES.has(statusRaw as FuelTruck['status'])
    ? (statusRaw as FuelTruck['status'])
    : 'idle';
  const truck: FuelTruck = {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    truckClassId,
    homeRegion: String(r.home_region ?? ''),
    status,
  };
  const haul = optText(r.current_haul_id);
  if (haul) truck.currentHaulId = haul;
  const busy = optNum(r.busy_until_ms);
  if (busy != null) truck.busyUntilMs = busy;
  return { ...extra, ...truck } as FuelTruck;
}

function fuelHaulFromRow(r: Record<string, unknown>): FuelHaul {
  const extra = parseJson<Record<string, unknown>>(r.payload_json) ?? {};
  const statusRaw = String(r.status ?? '');
  const status = FUEL_HAUL_STATUSES.has(statusRaw as FuelHaul['status'])
    ? (statusRaw as FuelHaul['status'])
    : 'enroute';
  const haul: FuelHaul = {
    id: String(r.id ?? ''),
    truckId: String(r.truck_id ?? ''),
    originIcao: String(r.origin_icao ?? ''),
    destIcao: String(r.dest_icao ?? ''),
    commodityId: 'fuel',
    cargoKg: num(r.cargo_kg),
    departedAtMs: num(r.departed_at_ms),
    arrivesAtMs: num(r.arrives_at_ms),
    status,
  };
  return { ...extra, ...haul } as FuelHaul;
}

function demandOrderFromRow(r: Record<string, unknown>): DemandOrder {
  const extra = parseJson<Record<string, unknown>>(r.payload_json) ?? {};
  const statusRaw = String(r.status ?? '');
  const status = DEMAND_STATUSES.has(statusRaw as DemandOrderStatus)
    ? (statusRaw as DemandOrderStatus)
    : 'open';
  const order: DemandOrder = {
    id: String(r.id ?? ''),
    destIcao: String(r.dest_icao ?? ''),
    commodityId: String(r.commodity_id ?? '') as CommodityId,
    wantedKg: num(r.wanted_kg),
    remainingKg: num(r.remaining_kg),
    maxUnitPriceUsd: num(r.max_unit_price_usd),
    arrivedAtTick: num(r.arrived_at_tick),
    expiresAtTick: num(r.expires_at_tick),
    status,
  };
  const portIdCol = optText(r.port_id);
  if (portIdCol) order.portId = portIdCol;
  const merged = { ...extra, ...order } as DemandOrder;
  if (!merged.portId && typeof extra.portId === 'string') {
    merged.portId = extra.portId;
  }
  return merged;
}

function portListingFromRow(r: Record<string, unknown>): PortListing {
  const extra = parseJson<Record<string, unknown>>(r.payload_json) ?? {};
  const statusRaw = String(r.status ?? '');
  const status = PORT_LISTING_STATUSES.has(statusRaw as PortListingStatus)
    ? (statusRaw as PortListingStatus)
    : 'open';
  const listing: PortListing = {
    id: String(r.id ?? ''),
    portId: String(r.port_id ?? ''),
    commodityId: String(r.commodity_id ?? '') as CommodityId,
    availableKg: num(r.available_kg),
    unitPriceUsd: num(r.unit_price_usd),
    allocatedHubIcao: String(r.allocated_hub_icao ?? ''),
    arrivedAtTick: num(r.arrived_at_tick),
    expiresAtTick: num(r.expires_at_tick),
    status,
  };
  return { ...extra, ...listing } as PortListing;
}

function npcFlightFromRow(r: Record<string, unknown>): NpcFlight {
  const statusRaw = String(r.status ?? '');
  const status: NpcFlight['status'] =
    statusRaw === 'completed'
      ? 'completed'
      : statusRaw === 'awaiting_pilot'
        ? 'awaiting_pilot'
        : 'in_flight';
  const base: NpcFlight = {
    id: String(r.id ?? ''),
    npcId: String(r.npc_id ?? ''),
    lotId: String(r.lot_id ?? ''),
    originIcao: String(r.origin_icao ?? ''),
    destIcao: String(r.dest_icao ?? ''),
    commodityId: String(r.commodity_id ?? '') as CommodityId,
    cargoKg: num(r.cargo_kg),
    payUsd: num(r.pay_usd),
    aircraftClassId: String(r.aircraft_class_id ?? '') as FreighterClassId,
    departedAtTick: num(r.departed_at_tick),
    arrivesAtTick: num(r.arrives_at_tick),
    departedAtMs: num(r.departed_at_ms),
    arrivesAtMs: num(r.arrives_at_ms),
    status,
  };
  const extra = parseJson<Partial<NpcFlight>>(r.payload_json);
  if (extra) {
    const { status: _ignored, ...payloadRest } = extra;
    return { ...base, ...payloadRest, status };
  }
  return base;
}

function economyEventFromRow(r: Record<string, unknown>): EconomyEvent {
  const base: EconomyEvent = {
    id: String(r.id ?? ''),
    kind: String(r.kind ?? '') as EconomyEvent['kind'],
    region: String(r.region ?? ''),
    startsAtTick: num(r.starts_at_tick),
    endsAtTick: num(r.ends_at_tick),
    label: String(r.label ?? ''),
  };
  const commodity = optText(r.commodity_id);
  if (commodity) base.commodityId = commodity as CommodityId;
  const extra = parseJson<Partial<EconomyEvent>>(r.payload_json);
  return extra ? ({ ...extra, ...base } as EconomyEvent) : base;
}

function instanceFromRow(r: {
  id: string;
  airframe_type_id: string;
  aircraft_class_id: string;
  country_id: string;
  based_icao: string;
  registration: string;
  kind: string;
  condition: string;
  hours_airframe: number;
  hours_engine: number;
  airframe_condition_pct: number | null;
  engine_condition_pct: number | null;
  status: string;
  seeded_at_tick: number;
  available_at_tick: number | null;
}): AircraftInstance {
  const status = INSTANCE_STATUSES.has(r.status as AircraftInstanceStatus)
    ? (r.status as AircraftInstanceStatus)
    : 'available';
  const kind = LISTING_KINDS.has(r.kind as AircraftListingKind)
    ? (r.kind as AircraftListingKind)
    : 'used';
  const condition = CONDITIONS.has(r.condition as AirframeCondition)
    ? (r.condition as AirframeCondition)
    : 'good';
  const inst: AircraftInstance = {
    id: r.id,
    airframeTypeId: r.airframe_type_id,
    aircraftClassId: r.aircraft_class_id as FreighterClassId,
    countryId: r.country_id,
    basedIcao: r.based_icao,
    registration: r.registration,
    kind,
    condition,
    hoursAirframe: num(r.hours_airframe),
    hoursEngine: num(r.hours_engine),
    status,
    seededAtTick: num(r.seeded_at_tick),
  };
  const afPct = optNum(r.airframe_condition_pct);
  if (afPct !== undefined) inst.airframeConditionPct = afPct;
  const engPct = optNum(r.engine_condition_pct);
  if (engPct !== undefined) inst.engineConditionPct = engPct;
  const avail = optNum(r.available_at_tick);
  if (avail !== undefined) inst.availableAtTick = avail;
  return inst;
}

/**
 * Meta scalars + leftover misc for legacy migration / tests.
 * Table-backed arrays are omitted (live in relational tables).
 */
export function stripPgEconomyBlob(
  world: CareerEconomyWorld,
): Record<string, unknown> {
  return {
    seed: world.seed,
    tick: world.tick,
    lastBatchAtMs: world.lastBatchAtMs,
    lastSyncedAtMs: world.lastSyncedAtMs ?? world.lastBatchAtMs,
    ...(world.homeCountryId ? { homeCountryId: world.homeCountryId } : {}),
    ...pickPgEconomyMisc(world),
  };
}

/**
 * True when RAM has hot/ops/pool slices but the matching PG tables are empty
 * (legacy thin stub / schema upgrade). Caller should persist once.
 */
export async function economyNeedsPgTableBackfill(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
): Promise<boolean> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const checks: Array<{ table: string; ram: number }> = [
    { table: 'airports', ram: world.airports?.length ?? 0 },
    { table: 'lots', ram: world.lots?.length ?? 0 },
    { table: 'npcs', ram: world.npcs?.length ?? 0 },
    { table: 'aircraft_instances', ram: world.aircraftInstances?.length ?? 0 },
    { table: 'demand_orders', ram: world.demandOrders?.length ?? 0 },
    { table: 'fuel_trucks', ram: world.fuelTrucks?.length ?? 0 },
    { table: 'port_listings', ram: world.portListings?.length ?? 0 },
    { table: 'charter_offers', ram: world.charterOffers?.length ?? 0 },
    { table: 'charter_demand', ram: world.charterDemand?.length ?? 0 },
  ];
  for (const { table, ram } of checks) {
    if (ram <= 0) continue;
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE world_id = $1`,
      [wid],
    );
    const n = num(res.rows[0]?.n);
    if (n === 0) return true;
  }
  return false;
}

export async function hydrateEconomyFromPg(
  pool: pg.Pool | pg.PoolClient,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
): Promise<void> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;

  const metaRes = await pool.query(
    `SELECT seed, tick, last_batch_at_ms, home_country_id, misc_json
     FROM economy_meta WHERE world_id = $1`,
    [wid],
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
  if (meta) {
    if (meta.seed) world.seed = meta.seed;
    world.tick = num(meta.tick);
    world.lastBatchAtMs = num(meta.last_batch_at_ms);
    world.lastSyncedAtMs = world.lastBatchAtMs;
    if (meta.home_country_id) world.homeCountryId = meta.home_country_id;
    applyPgEconomyMisc(world, meta.misc_json);
  }

  const hubRes = await pool.query(
    `SELECT icao, name, region, hub_tier, bush, bush_trip_only, lat, lon,
            level, level_xp, level_curve_version, activity_score, last_activity_tick
     FROM airports WHERE world_id = $1 ORDER BY icao ASC`,
    [wid],
  );
  if (hubRes.rows.length > 0) {
    const stockRes = await pool.query(
      `SELECT icao, commodity_id, stock_kg, capacity_kg,
              base_production_per_tick_kg, base_consumption_per_tick_kg,
              production_per_tick_kg, consumption_per_tick_kg
       FROM airport_stock WHERE world_id = $1
       ORDER BY icao ASC, commodity_id ASC`,
      [wid],
    );
    const byIcao = new Map<string, typeof stockRes.rows>();
    for (const row of stockRes.rows) {
      const list = byIcao.get(row.icao as string);
      if (list) list.push(row);
      else byIcao.set(row.icao as string, [row]);
    }
    world.airports = hubRes.rows.map((hub) =>
      terminalFromAirportRow(
        {
          icao: hub.icao as string,
          name: hub.name as string,
          region: hub.region as string,
          hub_tier: hub.hub_tier as string,
          bush: Boolean(hub.bush),
          bush_trip_only: Boolean(hub.bush_trip_only),
          lat: num(hub.lat),
          lon: num(hub.lon),
          level: num(hub.level, 1),
          level_xp: num(hub.level_xp),
          level_curve_version: num(hub.level_curve_version),
          activity_score: num(hub.activity_score),
          last_activity_tick: num(hub.last_activity_tick),
        },
        (byIcao.get(hub.icao as string) ?? []) as Array<{
          commodity_id: string;
          stock_kg: number;
          capacity_kg: number;
          base_production_per_tick_kg: number;
          base_consumption_per_tick_kg: number;
          production_per_tick_kg: number;
          consumption_per_tick_kg: number;
        }>,
      ),
    );
  }

  const lotRes = await pool.query(
    `SELECT id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
            created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status,
            claimed_by_company_id
     FROM lots WHERE world_id = $1 ORDER BY created_at_tick ASC, id ASC`,
    [wid],
  );
  if (lotRes.rows.length > 0) {
    world.lots = lotRes.rows.map((r) =>
      lotFromRow(
        r as {
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
          claimed_by_company_id?: string | null;
        },
      ),
    );
  }

  const inboundRes = await pool.query(
    `SELECT id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
            expires_at_tick, source, payload_json
     FROM inbound_pending WHERE world_id = $1
     ORDER BY expires_at_tick ASC, id ASC`,
    [wid],
  );
  if (inboundRes.rows.length > 0) {
    world.inboundPending = inboundRes.rows.map((r) =>
      inboundFromRow(
        r as {
          id: string;
          mission_id: string;
          origin_icao: string;
          dest_icao: string;
          commodity_id: string;
          cargo_kg: number;
          expires_at_tick: number;
          source: string;
          payload_json: unknown;
        },
      ),
    );
  }

  const npcFlightRes = await pool.query(
    `SELECT id, npc_id, lot_id, origin_icao, dest_icao, commodity_id, cargo_kg,
            pay_usd, aircraft_class_id, departed_at_tick, arrives_at_tick,
            departed_at_ms, arrives_at_ms, status, payload_json
     FROM npc_flights WHERE world_id = $1
     ORDER BY departed_at_tick ASC, id ASC`,
    [wid],
  );
  if (npcFlightRes.rows.length > 0) {
    world.npcFlights = npcFlightRes.rows.map((r) =>
      npcFlightFromRow(r as Record<string, unknown>),
    );
  }

  const eventRes = await pool.query(
    `SELECT id, kind, region, commodity_id, starts_at_tick, ends_at_tick, label, payload_json
     FROM economy_events WHERE world_id = $1
     ORDER BY starts_at_tick ASC, id ASC`,
    [wid],
  );
  if (eventRes.rows.length > 0) {
    world.events = eventRes.rows.map((r) =>
      economyEventFromRow(r as Record<string, unknown>),
    );
  }

  const npcRes = await pool.query(
    `SELECT id, name, aircraft_class_id, airframe_type_id, max_cargo_kg, home_region,
            reliability, aggressiveness, fee_bias, status, busy_until_tick, busy_until_ms,
            duty_hours_accum, last_leg_duty_hours, rest_until_tick, rest_until_ms,
            hours_since_mx, location_icao, mx_until_ms, mx_until_tick,
            leased_player_aircraft_id, current_flight_id, payload_json
     FROM npcs WHERE world_id = $1 ORDER BY id ASC`,
    [wid],
  );
  if (npcRes.rows.length > 0) {
    world.npcs = npcRes.rows.map((r) => npcFromRow(r as Record<string, unknown>));
  }

  const truckRes = await pool.query(
    `SELECT id, name, truck_class_id, home_region, status, current_haul_id,
            busy_until_ms, payload_json
     FROM fuel_trucks WHERE world_id = $1 ORDER BY id ASC`,
    [wid],
  );
  if (truckRes.rows.length > 0) {
    world.fuelTrucks = truckRes.rows.map((r) =>
      fuelTruckFromRow(r as Record<string, unknown>),
    );
  }

  const haulRes = await pool.query(
    `SELECT id, truck_id, origin_icao, dest_icao, commodity_id, cargo_kg,
            departed_at_ms, arrives_at_ms, status, payload_json
     FROM fuel_hauls WHERE world_id = $1 ORDER BY departed_at_ms ASC, id ASC`,
    [wid],
  );
  if (haulRes.rows.length > 0) {
    world.fuelHauls = haulRes.rows.map((r) =>
      fuelHaulFromRow(r as Record<string, unknown>),
    );
  }

  const demandRes = await pool.query(
    `SELECT id, dest_icao, commodity_id, wanted_kg, remaining_kg, max_unit_price_usd,
            arrived_at_tick, expires_at_tick, status, port_id, payload_json
     FROM demand_orders WHERE world_id = $1 ORDER BY expires_at_tick ASC, id ASC`,
    [wid],
  );
  if (demandRes.rows.length > 0) {
    world.demandOrders = demandRes.rows.map((r) =>
      demandOrderFromRow(r as Record<string, unknown>),
    );
  }

  const listingRes = await pool.query(
    `SELECT id, port_id, commodity_id, available_kg, unit_price_usd, allocated_hub_icao,
            arrived_at_tick, expires_at_tick, status, payload_json
     FROM port_listings WHERE world_id = $1 ORDER BY expires_at_tick ASC, id ASC`,
    [wid],
  );
  if (listingRes.rows.length > 0) {
    world.portListings = listingRes.rows.map((r) =>
      portListingFromRow(r as Record<string, unknown>),
    );
  }

  const invRes = await pool.query(
    `SELECT port_id, commodity_id, stock_kg, last_restock_tick
     FROM port_inventories WHERE world_id = $1
     ORDER BY port_id ASC, commodity_id ASC`,
    [wid],
  );
  if (invRes.rows.length > 0) {
    world.portInventories = invRes.rows.map((r) => ({
      portId: String(r.port_id ?? ''),
      commodityId: String(r.commodity_id ?? '') as CommodityId,
      stockKg: num(r.stock_kg),
      lastRestockTick: num(r.last_restock_tick),
    }));
  }

  const concessionRes = await pool.query(
    `SELECT port_id, company_id, lease_paid_through_tick, level
     FROM port_concessions WHERE world_id = $1 ORDER BY port_id ASC`,
    [wid],
  );
  if (concessionRes.rows.length > 0) {
    world.portConcessions = concessionRes.rows.map((r) => {
      const levelNum = Math.floor(num(r.level, 1));
      const level = levelNum === 2 || levelNum === 3 ? levelNum : 1;
      return {
        portId: String(r.port_id ?? ''),
        companyId: String(r.company_id ?? ''),
        leasePaidThroughTick: num(r.lease_paid_through_tick),
        level,
      } satisfies PortConcessionIndexRow;
    });
  }

  const instanceRes = await pool.query(
    `SELECT id, airframe_type_id, aircraft_class_id, country_id, based_icao,
            registration, kind, condition, hours_airframe, hours_engine,
            airframe_condition_pct, engine_condition_pct, status,
            seeded_at_tick, available_at_tick
     FROM aircraft_instances WHERE world_id = $1 ORDER BY id ASC`,
    [wid],
  );
  if (instanceRes.rows.length > 0) {
    world.aircraftInstances = instanceRes.rows.map((r) =>
      instanceFromRow(
        r as {
          id: string;
          airframe_type_id: string;
          aircraft_class_id: string;
          country_id: string;
          based_icao: string;
          registration: string;
          kind: string;
          condition: string;
          hours_airframe: number;
          hours_engine: number;
          airframe_condition_pct: number | null;
          engine_condition_pct: number | null;
          status: string;
          seeded_at_tick: number;
          available_at_tick: number | null;
        },
      ),
    );
  }

  const charterDemandRes = await pool.query(
    `SELECT id, origin_icao, dest_icao, pressure, international,
            created_at_tick, updated_at_tick, last_offered_day,
            fulfilled_groups, expired_groups
     FROM charter_demand WHERE world_id = $1 ORDER BY id`,
    [wid],
  );
  if (charterDemandRes.rows.length > 0) {
    world.charterDemand = charterDemandRes.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        originIcao: String(row.origin_icao),
        destIcao: String(row.dest_icao),
        pressure: num(row.pressure),
        international: Boolean(row.international),
        createdAtTick: num(row.created_at_tick),
        updatedAtTick: num(row.updated_at_tick),
        lastOfferedDay: num(row.last_offered_day),
        fulfilledGroups: num(row.fulfilled_groups),
        expiredGroups: num(row.expired_groups),
      } satisfies CharterDemand;
    });
  }

  const charterOfferRes = await pool.query(
    `SELECT id, demand_id, origin_icao, dest_icao, group_size, baggage_kg, distance_nm,
            tier, urgency, international, pay_usd, created_at_tick,
            expires_at_tick, status, mission_id
     FROM charter_offers WHERE world_id = $1 ORDER BY created_at_tick, id`,
    [wid],
  );
  if (charterOfferRes.rows.length > 0) {
    world.charterOffers = charterOfferRes.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        demandId: String(row.demand_id),
        originIcao: String(row.origin_icao),
        destIcao: String(row.dest_icao),
        groupSize: num(row.group_size),
        baggageKg: num(row.baggage_kg),
        distanceNm: num(row.distance_nm),
        tier: String(row.tier) as CharterTier,
        urgency: String(row.urgency) as CharterUrgency,
        international: Boolean(row.international),
        payUsd: num(row.pay_usd),
        createdAtTick: num(row.created_at_tick),
        expiresAtTick: num(row.expires_at_tick),
        status: String(row.status) as CharterOfferStatus,
        ...(row.mission_id ? { missionId: String(row.mission_id) } : {}),
      } satisfies CharterOffer;
    });
  }

  const charterHubRes = await pool.query(
    `SELECT icao, waiting_pax, attract_pax, capacity_pax, updated_at_tick
     FROM charter_hubs WHERE world_id = $1 ORDER BY icao`,
    [wid],
  );
  if (charterHubRes.rows.length > 0) {
    world.charterHubs = charterHubRes.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        icao: String(row.icao),
        waitingPax: num(row.waiting_pax),
        attractPax: num(row.attract_pax),
        capacityPax: num(row.capacity_pax),
        updatedAtTick: num(row.updated_at_tick),
      } satisfies CharterHubState;
    });
  }
}

function airportTableRows(
  worldId: string,
  airports: AirportTerminal[],
): { hubRows: unknown[][]; stockRows: unknown[][] } {
  const hubRows: unknown[][] = [];
  const stockRows: unknown[][] = [];
  for (const ap of airports) {
    const icao = String(ap.icao ?? '')
      .trim()
      .toUpperCase();
    if (!icao) continue;
    hubRows.push([
      worldId,
      icao,
      ap.name ?? icao,
      ap.region ?? '',
      countryIdFromRegion(ap.region ?? '') || '',
      ap.hubTier ?? '',
      Boolean(ap.bush),
      Boolean(ap.bushTripOnly),
      sqlNum(ap.lat),
      sqlNum(ap.lon),
      sqlNum(ap.level, 1),
      sqlNum(ap.levelXp),
      sqlNum(ap.levelCurveVersion),
      sqlNum(ap.activityScore),
      sqlNum(ap.lastActivityTick),
    ]);
    for (const id of STOCK_COMMODITY_IDS) {
      const pile = ap.inventory?.[id];
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

function lotTableRows(
  worldId: string,
  lots: ShipmentLot[],
  airports: CareerEconomyWorld['airports'],
): unknown[][] {
  const countries = icaoCountryMap(airports);
  return lots.map((lot) => [
    lot.id,
    lot.commodityId,
    lot.originIcao,
    lot.destIcao,
    sqlNum(lot.quantityKg),
    sqlNum(lot.reservedKg),
    sqlNum(lot.createdAtTick),
    sqlNum(lot.expiresAtTick),
    sqlNum(lot.payUsd),
    typeof lot.basePayUsd === 'number' && Number.isFinite(lot.basePayUsd)
      ? lot.basePayUsd
      : null,
    lot.urgency,
    lot.reason,
    lot.status,
    countryForIcao(countries, lot.originIcao) || null,
    countryForIcao(countries, lot.destIcao) || null,
    worldId,
    lot.claimedByCompanyId?.trim() || null,
  ]);
}

function inboundTableRows(
  worldId: string,
  rows: InboundPending[],
): unknown[][] {
  return rows.map((row) => {
    const {
      id,
      missionId,
      originIcao,
      destIcao,
      commodityId,
      cargoKg,
      expiresAtTick,
      source,
      ...rest
    } = row;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      id,
      missionId,
      originIcao,
      destIcao,
      commodityId,
      sqlNum(cargoKg),
      sqlNum(expiresAtTick),
      source,
      jsonParam(extra),
      worldId,
    ];
  });
}

function npcTableRows(worldId: string, npcs: NpcFreighter[]): unknown[][] {
  return uniqueByKey(npcs, rowId).map((npc) => {
    const {
      id,
      name,
      aircraftClassId,
      airframeTypeId,
      maxCargoKg,
      homeRegion,
      reliability,
      aggressiveness,
      feeBias,
      status,
      busyUntilTick,
      busyUntilMs,
      dutyHoursAccum,
      lastLegDutyHours,
      restUntilTick,
      restUntilMs,
      hoursSinceMx,
      locationIcao,
      mxUntilMs,
      mxUntilTick,
      leasedPlayerAircraftId,
      currentFlightId,
      ...rest
    } = npc;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      worldId,
      id,
      name,
      aircraftClassId,
      airframeTypeId ?? null,
      maxCargoKg ?? null,
      homeRegion,
      countryIdFromRegion(homeRegion) || '',
      sqlNum(reliability),
      sqlNum(aggressiveness),
      sqlNum(feeBias),
      status,
      busyUntilTick ?? null,
      sqlOptBigint(busyUntilMs),
      dutyHoursAccum ?? null,
      lastLegDutyHours ?? null,
      restUntilTick ?? null,
      sqlOptBigint(restUntilMs),
      hoursSinceMx ?? null,
      locationIcao ?? null,
      sqlOptBigint(mxUntilMs),
      mxUntilTick ?? null,
      leasedPlayerAircraftId ?? null,
      currentFlightId ?? null,
      jsonParam(extra),
    ];
  });
}

function fuelTruckTableRows(
  worldId: string,
  trucks: FuelTruck[],
): unknown[][] {
  return uniqueByKey(trucks, rowId).map((t) => {
    const {
      id,
      name,
      truckClassId,
      homeRegion,
      status,
      currentHaulId,
      busyUntilMs,
      ...rest
    } = t;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      worldId,
      id,
      name,
      truckClassId,
      homeRegion,
      status,
      currentHaulId ?? null,
      sqlOptBigint(busyUntilMs),
      jsonParam(extra),
    ];
  });
}

function fuelHaulTableRows(worldId: string, hauls: FuelHaul[]): unknown[][] {
  return uniqueByKey(hauls, rowId).map((h) => {
    const {
      id,
      truckId,
      originIcao,
      destIcao,
      commodityId,
      cargoKg,
      departedAtMs,
      arrivesAtMs,
      status,
      ...rest
    } = h;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      worldId,
      id,
      truckId,
      originIcao,
      destIcao,
      commodityId,
      sqlNum(cargoKg),
      sqlBigint(departedAtMs),
      sqlBigint(arrivesAtMs),
      status,
      jsonParam(extra),
    ];
  });
}

function demandOrderTableRows(
  worldId: string,
  orders: DemandOrder[],
): unknown[][] {
  return uniqueByKey(orders, rowId).map((o) => {
    const {
      id,
      destIcao,
      commodityId,
      wantedKg,
      remainingKg,
      maxUnitPriceUsd,
      arrivedAtTick,
      expiresAtTick,
      status,
      portId,
      ...rest
    } = o;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      worldId,
      id,
      destIcao,
      commodityId,
      sqlNum(wantedKg),
      sqlNum(remainingKg),
      sqlNum(maxUnitPriceUsd),
      sqlNum(arrivedAtTick),
      sqlNum(expiresAtTick),
      status,
      portId?.trim() ? portId.trim().toUpperCase() : null,
      jsonParam(extra),
    ];
  });
}

function portListingTableRows(
  worldId: string,
  listings: PortListing[],
): unknown[][] {
  return uniqueByKey(listings, rowId).map((l) => {
    const {
      id,
      portId,
      commodityId,
      availableKg,
      unitPriceUsd,
      allocatedHubIcao,
      arrivedAtTick,
      expiresAtTick,
      status,
      ...rest
    } = l;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      worldId,
      id,
      portId,
      commodityId,
      sqlNum(availableKg),
      sqlNum(unitPriceUsd),
      allocatedHubIcao,
      sqlNum(arrivedAtTick),
      sqlNum(expiresAtTick),
      status,
      jsonParam(extra),
    ];
  });
}

function portInventoryTableRows(
  worldId: string,
  rows: PortInventoryRow[],
): unknown[][] {
  return uniqueByKey(
    rows,
    (r) =>
      `${String(r.portId ?? '').trim().toUpperCase()}\0${String(r.commodityId ?? '')}`,
  ).map((r) => [
    worldId,
    r.portId,
    r.commodityId,
    sqlNum(r.stockKg),
    sqlNum(r.lastRestockTick),
  ]);
}

function portConcessionTableRows(
  worldId: string,
  rows: PortConcessionIndexRow[],
): unknown[][] {
  return uniqueByKey(rows, (r) =>
    String(r.portId ?? '')
      .trim()
      .toUpperCase(),
  ).map((r) => {
    const level = r.level === 2 || r.level === 3 ? r.level : 1;
    return [
      worldId,
      r.portId,
      r.companyId,
      sqlNum(r.leasePaidThroughTick),
      level,
    ];
  });
}

function aircraftInstanceTableRows(
  worldId: string,
  instances: AircraftInstance[],
): unknown[][] {
  const rows: unknown[][] = [];
  for (const inst of instances) {
    const id = String(inst.id ?? '').trim();
    const registration = String(inst.registration ?? '')
      .trim()
      .toUpperCase();
    if (!id || !registration) continue;
    rows.push([
      worldId,
      id,
      inst.airframeTypeId,
      inst.aircraftClassId,
      inst.countryId,
      String(inst.basedIcao ?? '')
        .trim()
        .toUpperCase(),
      registration,
      inst.kind,
      inst.condition,
      sqlNum(inst.hoursAirframe),
      sqlNum(inst.hoursEngine),
      inst.airframeConditionPct ?? null,
      inst.engineConditionPct ?? null,
      inst.status,
      sqlNum(inst.seededAtTick),
      inst.availableAtTick ?? null,
    ]);
  }
  return rows;
}

function npcFlightTableRows(
  worldId: string,
  flights: NpcFlight[],
  airports: CareerEconomyWorld['airports'],
): unknown[][] {
  const countries = icaoCountryMap(airports);
  return flights.map((f) => {
    const {
      id,
      npcId,
      lotId,
      originIcao,
      destIcao,
      commodityId,
      cargoKg,
      payUsd,
      aircraftClassId,
      departedAtTick,
      arrivesAtTick,
      departedAtMs,
      arrivesAtMs,
      status,
      ...rest
    } = f;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      id,
      npcId,
      lotId,
      originIcao,
      destIcao,
      commodityId,
      sqlNum(cargoKg),
      sqlNum(payUsd),
      aircraftClassId,
      sqlNum(departedAtTick),
      sqlNum(arrivesAtTick),
      sqlBigint(departedAtMs),
      sqlBigint(arrivesAtMs),
      status,
      countryForIcao(countries, originIcao) || null,
      countryForIcao(countries, destIcao) || null,
      jsonParam(extra),
      worldId,
    ];
  });
}

function economyEventTableRows(
  worldId: string,
  events: EconomyEvent[],
): unknown[][] {
  return events.map((e) => {
    const { id, kind, region, commodityId, startsAtTick, endsAtTick, label, ...rest } =
      e;
    const extra = Object.keys(rest).length > 0 ? rest : null;
    return [
      id,
      kind,
      region,
      commodityId ?? null,
      sqlNum(startsAtTick),
      sqlNum(endsAtTick),
      label,
      countryIdFromRegion(region) || null,
      jsonParam(extra),
      worldId,
    ];
  });
}

function charterDemandTableRows(
  worldId: string,
  rows: CharterDemand[],
): unknown[][] {
  return rows.map((row) => [
    worldId,
    row.id,
    row.originIcao,
    row.destIcao,
    sqlNum(row.pressure),
    Boolean(row.international),
    sqlNum(row.createdAtTick),
    sqlNum(row.updatedAtTick),
    sqlNum(row.lastOfferedDay),
    sqlNum(row.fulfilledGroups),
    sqlNum(row.expiredGroups),
  ]);
}

function charterHubTableRows(
  worldId: string,
  rows: CharterHubState[],
): unknown[][] {
  const out: unknown[][] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const icao = row.icao.trim().toUpperCase();
    if (!icao || seen.has(icao)) continue;
    seen.add(icao);
    out.push([
      worldId,
      icao,
      sqlNum(row.waitingPax),
      sqlNum(row.attractPax),
      sqlNum(row.capacityPax, 24),
      sqlNum(row.updatedAtTick),
    ]);
  }
  return out;
}

function charterOfferTableRows(
  worldId: string,
  rows: CharterOffer[],
): unknown[][] {
  return rows.map((row) => [
    worldId,
    row.id,
    row.demandId,
    row.originIcao,
    row.destIcao,
    sqlNum(row.groupSize),
    sqlNum(row.baggageKg),
    sqlNum(row.distanceNm),
    row.tier,
    row.urgency,
    Boolean(row.international),
    sqlNum(row.payUsd),
    sqlNum(row.createdAtTick),
    sqlNum(row.expiresAtTick),
    row.status,
    row.missionId ?? null,
  ]);
}

export async function persistEconomyTablesToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const airports = world.airports ?? [];
  const lots = world.lots ?? [];
  const inbound = world.inboundPending ?? [];
  const { hubRows, stockRows } = airportTableRows(wid, airports);
  const lotRows = lotTableRows(wid, lots, airports);
  const inboundRows = inboundTableRows(wid, inbound);
  const npcFlightRows = npcFlightTableRows(wid, world.npcFlights ?? [], airports);
  const eventRows = economyEventTableRows(wid, world.events ?? []);
  const npcRows = npcTableRows(wid, world.npcs ?? []);
  const truckRows = fuelTruckTableRows(wid, world.fuelTrucks ?? []);
  const haulRows = fuelHaulTableRows(wid, world.fuelHauls ?? []);
  const demandRows = demandOrderTableRows(wid, world.demandOrders ?? []);
  const listingRows = portListingTableRows(wid, world.portListings ?? []);
  const invRows = portInventoryTableRows(wid, world.portInventories ?? []);
  const concessionRows = portConcessionTableRows(
    wid,
    world.portConcessions ?? [],
  );
  const instanceRows = aircraftInstanceTableRows(
    wid,
    world.aircraftInstances ?? [],
  );
  const charterDemandRows = charterDemandTableRows(
    wid,
    world.charterDemand ?? [],
  );
  const charterHubRows = charterHubTableRows(wid, world.charterHubs ?? []);
  const charterOfferRows = charterOfferTableRows(
    wid,
    world.charterOffers ?? [],
  );

  return withTx(pool, async (client) => {
    await ensureWorldRow(client, wid);
    await lockEconomyRevision(client, wid, expectedRevision);

    await client.query(
      `INSERT INTO economy_meta (
         world_id, seed, tick, last_batch_at_ms, home_country_id, misc_json, revision
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1)
       ON CONFLICT (world_id) DO UPDATE SET
         seed = EXCLUDED.seed,
         tick = EXCLUDED.tick,
         last_batch_at_ms = EXCLUDED.last_batch_at_ms,
         home_country_id = EXCLUDED.home_country_id,
         misc_json = EXCLUDED.misc_json,
         revision = economy_meta.revision + 1`,
      [
        wid,
        world.seed,
        sqlNum(world.tick),
        sqlBigint(world.lastBatchAtMs),
        world.homeCountryId ?? '',
        jsonParam(pickPgEconomyMisc(world)),
      ],
    );

    await client.query(`DELETE FROM airport_stock WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM airports WHERE world_id = $1`, [wid]);
    if (hubRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO airports (
           world_id, icao, name, region, country_id, hub_tier, bush, bush_trip_only,
           lat, lon, level, level_xp, level_curve_version, activity_score, last_activity_tick
         )`,
        15,
        hubRows,
      );
    }
    if (stockRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO airport_stock (
           world_id, icao, commodity_id, stock_kg, capacity_kg,
           base_production_per_tick_kg, base_consumption_per_tick_kg,
           production_per_tick_kg, consumption_per_tick_kg
         )`,
        9,
        stockRows,
      );
    }

    await client.query(`DELETE FROM lots WHERE world_id = $1`, [wid]);
    if (lotRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO lots (
           id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
           created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status,
           origin_country_id, dest_country_id, world_id, claimed_by_company_id
         )`,
        17,
        lotRows,
      );
    }

    await client.query(`DELETE FROM inbound_pending WHERE world_id = $1`, [wid]);
    if (inboundRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO inbound_pending (
           id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
           expires_at_tick, source, payload_json, world_id
         )`,
        10,
        inboundRows,
      );
    }

    await client.query(`DELETE FROM npc_flights WHERE world_id = $1`, [wid]);
    if (npcFlightRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO npc_flights (
           id, npc_id, lot_id, origin_icao, dest_icao, commodity_id, cargo_kg, pay_usd,
           aircraft_class_id, departed_at_tick, arrives_at_tick, departed_at_ms, arrives_at_ms,
           status, origin_country_id, dest_country_id, payload_json, world_id
         )`,
        18,
        npcFlightRows,
      );
    }

    await client.query(`DELETE FROM economy_events WHERE world_id = $1`, [wid]);
    if (eventRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO economy_events (
           id, kind, region, commodity_id, starts_at_tick, ends_at_tick, label,
           country_id, payload_json, world_id
         )`,
        10,
        eventRows,
      );
    }

    await client.query(`DELETE FROM npcs WHERE world_id = $1`, [wid]);
    if (npcRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO npcs (
           world_id, id, name, aircraft_class_id, airframe_type_id, max_cargo_kg,
           home_region, home_country_id, reliability, aggressiveness, fee_bias, status,
           busy_until_tick, busy_until_ms, duty_hours_accum, last_leg_duty_hours,
           rest_until_tick, rest_until_ms, hours_since_mx, location_icao, mx_until_ms,
           mx_until_tick, leased_player_aircraft_id, current_flight_id, payload_json
         )`,
        25,
        npcRows,
      );
    }

    await client.query(`DELETE FROM fuel_trucks WHERE world_id = $1`, [wid]);
    if (truckRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO fuel_trucks (
           world_id, id, name, truck_class_id, home_region, status, current_haul_id,
           busy_until_ms, payload_json
         )`,
        9,
        truckRows,
      );
    }

    await client.query(`DELETE FROM fuel_hauls WHERE world_id = $1`, [wid]);
    if (haulRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO fuel_hauls (
           world_id, id, truck_id, origin_icao, dest_icao, commodity_id, cargo_kg,
           departed_at_ms, arrives_at_ms, status, payload_json
         )`,
        11,
        haulRows,
      );
    }

    await client.query(`DELETE FROM demand_orders WHERE world_id = $1`, [wid]);
    if (demandRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO demand_orders (
           world_id, id, dest_icao, commodity_id, wanted_kg, remaining_kg,
           max_unit_price_usd, arrived_at_tick, expires_at_tick, status, port_id, payload_json
         )`,
        12,
        demandRows,
      );
    }

    await client.query(`DELETE FROM port_listings WHERE world_id = $1`, [wid]);
    if (listingRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_listings (
           world_id, id, port_id, commodity_id, available_kg, unit_price_usd,
           allocated_hub_icao, arrived_at_tick, expires_at_tick, status, payload_json
         )`,
        11,
        listingRows,
      );
    }

    await client.query(`DELETE FROM port_inventories WHERE world_id = $1`, [wid]);
    if (invRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_inventories (
           world_id, port_id, commodity_id, stock_kg, last_restock_tick
         )`,
        5,
        invRows,
      );
    }

    await client.query(`DELETE FROM port_concessions WHERE world_id = $1`, [wid]);
    if (concessionRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_concessions (
           world_id, port_id, company_id, lease_paid_through_tick, level
         )`,
        5,
        concessionRows,
      );
    }

    await client.query(`DELETE FROM aircraft_instances WHERE world_id = $1`, [
      wid,
    ]);
    if (instanceRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO aircraft_instances (
           world_id, id, airframe_type_id, aircraft_class_id, country_id, based_icao,
           registration, kind, condition, hours_airframe, hours_engine,
           airframe_condition_pct, engine_condition_pct, status, seeded_at_tick,
           available_at_tick
         )`,
        16,
        instanceRows,
      );
    }

    // No FK from offers→demand: delete offers first (matches SQLite full-replace order).
    await client.query(`DELETE FROM charter_offers WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM charter_demand WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM charter_hubs WHERE world_id = $1`, [wid]);
    if (charterDemandRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO charter_demand (
           world_id, id, origin_icao, dest_icao, pressure, international,
           created_at_tick, updated_at_tick, last_offered_day,
           fulfilled_groups, expired_groups
         )`,
        11,
        charterDemandRows,
      );
    }
    if (charterHubRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO charter_hubs (
           world_id, icao, waiting_pax, attract_pax, capacity_pax, updated_at_tick
         )`,
        6,
        charterHubRows,
      );
    }
    if (charterOfferRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO charter_offers (
           world_id, id, demand_id, origin_icao, dest_icao, group_size, baggage_kg,
           distance_nm, tier, urgency, international, pay_usd, created_at_tick,
           expires_at_tick, status, mission_id
         )`,
        16,
        charterOfferRows,
      );
    }
    const revision = await client.query(
      `SELECT revision FROM economy_meta WHERE world_id = $1`,
      [wid],
    );
    return revisionBigInt(revision.rows[0]?.revision);
  });
}

/** Dealer pool only — buy/lease/sell must not rewrite lots/airports/NPC. */
export async function persistAircraftPoolToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const instanceRows = aircraftInstanceTableRows(
    wid,
    world.aircraftInstances ?? [],
  );
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(`DELETE FROM aircraft_instances WHERE world_id = $1`, [
      wid,
    ]);
    if (instanceRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO aircraft_instances (
           world_id, id, airframe_type_id, aircraft_class_id, country_id, based_icao,
           registration, kind, condition, hours_airframe, hours_engine,
           airframe_condition_pct, engine_condition_pct, status, seeded_at_tick,
           available_at_tick
         )`,
        16,
        instanceRows,
      );
    }
  });
}

/** Inbound board only — Accept/settle cargo arrival, not full economy. */
export async function persistInboundPendingToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const inboundRows = inboundTableRows(wid, world.inboundPending ?? []);
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(`DELETE FROM inbound_pending WHERE world_id = $1`, [wid]);
    if (inboundRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO inbound_pending (
           id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
           expires_at_tick, source, payload_json, world_id
         )`,
        10,
        inboundRows,
      );
    }
  });
}

/** Demand board only. */
export async function persistDemandBoardToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const demandRows = demandOrderTableRows(wid, world.demandOrders ?? []);
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(`DELETE FROM demand_orders WHERE world_id = $1`, [wid]);
    if (demandRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO demand_orders (
           world_id, id, dest_icao, commodity_id, wanted_kg, remaining_kg,
           max_unit_price_usd, arrived_at_tick, expires_at_tick, status, port_id,
           payload_json
         )`,
        12,
        demandRows,
      );
    }
  });
}

/** Single demand order upsert. */
export async function persistDemandOrderToPg(
  pool: pg.Pool,
  order: DemandOrder,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const rows = demandOrderTableRows(wid, [order]);
  if (rows.length === 0) return expectedRevision ?? 0n;
  const row = rows[0]!;
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(
      `INSERT INTO demand_orders (
       world_id, id, dest_icao, commodity_id, wanted_kg, remaining_kg,
       max_unit_price_usd, arrived_at_tick, expires_at_tick, status, port_id,
       payload_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (world_id, id) DO UPDATE SET
       dest_icao = EXCLUDED.dest_icao,
       commodity_id = EXCLUDED.commodity_id,
       wanted_kg = EXCLUDED.wanted_kg,
       remaining_kg = EXCLUDED.remaining_kg,
       max_unit_price_usd = EXCLUDED.max_unit_price_usd,
       arrived_at_tick = EXCLUDED.arrived_at_tick,
       expires_at_tick = EXCLUDED.expires_at_tick,
       status = EXCLUDED.status,
       port_id = EXCLUDED.port_id,
       payload_json = EXCLUDED.payload_json`,
      row,
    );
  });
}

/** Port listings + inventories (Port FBO desk). */
export async function persistPortMarketToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const listingRows = portListingTableRows(wid, world.portListings ?? []);
  const invRows = portInventoryTableRows(wid, world.portInventories ?? []);
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(`DELETE FROM port_listings WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM port_inventories WHERE world_id = $1`, [wid]);
    if (listingRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_listings (
           world_id, id, port_id, commodity_id, available_kg, unit_price_usd,
           allocated_hub_icao, arrived_at_tick, expires_at_tick, status, payload_json
         )`,
        11,
        listingRows,
      );
    }
    if (invRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_inventories (
           world_id, port_id, commodity_id, stock_kg, last_restock_tick
         )`,
        5,
        invRows,
      );
    }
  });
}

/** Single port listing upsert. */
export async function persistPortListingToPg(
  pool: pg.Pool,
  listing: PortListing,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const rows = portListingTableRows(wid, [listing]);
  if (rows.length === 0) return expectedRevision ?? 0n;
  const row = rows[0]!;
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(
      `INSERT INTO port_listings (
       world_id, id, port_id, commodity_id, available_kg, unit_price_usd,
       allocated_hub_icao, arrived_at_tick, expires_at_tick, status, payload_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (world_id, id) DO UPDATE SET
       port_id = EXCLUDED.port_id,
       commodity_id = EXCLUDED.commodity_id,
       available_kg = EXCLUDED.available_kg,
       unit_price_usd = EXCLUDED.unit_price_usd,
       allocated_hub_icao = EXCLUDED.allocated_hub_icao,
       arrived_at_tick = EXCLUDED.arrived_at_tick,
       expires_at_tick = EXCLUDED.expires_at_tick,
       status = EXCLUDED.status,
       payload_json = EXCLUDED.payload_json`,
      row,
    );
  });
}

/** Port concession index (company leases on ports). */
export async function persistPortConcessionsToPg(
  pool: pg.Pool,
  rows: PortConcessionIndexRow[],
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const concessionRows = portConcessionTableRows(wid, rows);
  return withRevisionedTx(pool, wid, expectedRevision, async (client) => {
    await client.query(`DELETE FROM port_concessions WHERE world_id = $1`, [wid]);
    if (concessionRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO port_concessions (
           world_id, port_id, company_id, lease_paid_through_tick, level
         )`,
        5,
        concessionRows,
      );
    }
  });
}

/**
 * Contract-pilot / NPC live: clock + hubs/stock + lots + inbound + NPC roster/
 * flights + dealer pool — not port/demand/fuel/charter ops tables.
 */
export async function persistNpcLiveToPg(
  pool: pg.Pool,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
  expectedRevision?: bigint,
): Promise<bigint> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const airports = world.airports ?? [];
  const lots = world.lots ?? [];
  const inbound = world.inboundPending ?? [];
  const { hubRows, stockRows } = airportTableRows(wid, airports);
  const lotRows = lotTableRows(wid, lots, airports);
  const inboundRows = inboundTableRows(wid, inbound);
  const npcRows = npcTableRows(wid, world.npcs ?? []);
  const npcFlightRows = npcFlightTableRows(wid, world.npcFlights ?? [], airports);
  const instanceRows = aircraftInstanceTableRows(
    wid,
    world.aircraftInstances ?? [],
  );
  return withTx(pool, async (client) => {
    await ensureWorldRow(client, wid);
    await lockEconomyRevision(client, wid, expectedRevision);
    await client.query(
      `INSERT INTO economy_meta (
         world_id, seed, tick, last_batch_at_ms, home_country_id, misc_json, revision
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1)
       ON CONFLICT (world_id) DO UPDATE SET
         seed = EXCLUDED.seed,
         tick = EXCLUDED.tick,
         last_batch_at_ms = EXCLUDED.last_batch_at_ms,
         home_country_id = EXCLUDED.home_country_id,
         misc_json = EXCLUDED.misc_json,
         revision = economy_meta.revision + 1`,
      [
        wid,
        world.seed,
        sqlNum(world.tick),
        sqlBigint(world.lastBatchAtMs),
        world.homeCountryId ?? '',
        jsonParam(pickPgEconomyMisc(world)),
      ],
    );

    await client.query(`DELETE FROM airport_stock WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM airports WHERE world_id = $1`, [wid]);
    if (hubRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO airports (
           world_id, icao, name, region, country_id, hub_tier, bush, bush_trip_only,
           lat, lon, level, level_xp, level_curve_version, activity_score, last_activity_tick
         )`,
        15,
        hubRows,
      );
    }
    if (stockRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO airport_stock (
           world_id, icao, commodity_id, stock_kg, capacity_kg,
           base_production_per_tick_kg, base_consumption_per_tick_kg,
           production_per_tick_kg, consumption_per_tick_kg
         )`,
        9,
        stockRows,
      );
    }

    await client.query(`DELETE FROM lots WHERE world_id = $1`, [wid]);
    if (lotRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO lots (
           id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
           created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status,
           origin_country_id, dest_country_id, world_id, claimed_by_company_id
         )`,
        17,
        lotRows,
      );
    }

    await client.query(`DELETE FROM inbound_pending WHERE world_id = $1`, [wid]);
    if (inboundRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO inbound_pending (
           id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
           expires_at_tick, source, payload_json, world_id
         )`,
        10,
        inboundRows,
      );
    }

    await client.query(`DELETE FROM npc_flights WHERE world_id = $1`, [wid]);
    await client.query(`DELETE FROM npcs WHERE world_id = $1`, [wid]);
    if (npcRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO npcs (
           world_id, id, name, aircraft_class_id, airframe_type_id, max_cargo_kg,
           home_region, home_country_id, reliability, aggressiveness, fee_bias, status,
           busy_until_tick, busy_until_ms, duty_hours_accum, last_leg_duty_hours,
           rest_until_tick, rest_until_ms, hours_since_mx, location_icao, mx_until_ms,
           mx_until_tick, leased_player_aircraft_id, current_flight_id, payload_json
         )`,
        25,
        npcRows,
      );
    }
    if (npcFlightRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO npc_flights (
           id, npc_id, lot_id, origin_icao, dest_icao, commodity_id, cargo_kg, pay_usd,
           aircraft_class_id, departed_at_tick, arrives_at_tick, departed_at_ms, arrives_at_ms,
           status, origin_country_id, dest_country_id, payload_json, world_id
         )`,
        18,
        npcFlightRows,
      );
    }

    await client.query(`DELETE FROM aircraft_instances WHERE world_id = $1`, [
      wid,
    ]);
    if (instanceRows.length > 0) {
      await insertChunks(
        client,
        `INSERT INTO aircraft_instances (
           world_id, id, airframe_type_id, aircraft_class_id, country_id, based_icao,
           registration, kind, condition, hours_airframe, hours_engine,
           airframe_condition_pct, engine_condition_pct, status, seeded_at_tick,
           available_at_tick
         )`,
        16,
        instanceRows,
      );
    }
    const revision = await client.query(
      `SELECT revision FROM economy_meta WHERE world_id = $1`,
      [wid],
    );
    return revisionBigInt(revision.rows[0]?.revision);
  });
}

function missionCoreAndPayload(m: MissionIntent): {
  core: {
    id: string;
    status: MissionStatus;
    originIcao: string;
    destIcao: string;
    aircraftId?: string;
    missionType: string;
    charterOfferId?: string;
    pax: number;
    baggageKg: number;
    commodityId: CommodityId;
    cargoKg: number;
    payUsd: number;
    acceptedAtTick: number;
    deadlineTick: number;
    departedAtTick?: number;
    settledAtTick?: number;
    urgency: string;
    reason: string;
  };
  payload: string | null;
} {
  const {
    id,
    status,
    originIcao,
    destIcao,
    aircraftId,
    missionType,
    charterOfferId,
    pax,
    baggageKg,
    commodityId,
    cargoKg,
    payUsd,
    acceptedAtTick,
    deadlineTick,
    departedAtTick,
    settledAtTick,
    urgency,
    reason,
    ...rest
  } = m;
  return {
    core: {
      id,
      status,
      originIcao,
      destIcao,
      aircraftId,
      missionType: missionType ?? 'freight',
      charterOfferId,
      pax:
        missionType === 'charter'
          ? Math.max(1, Math.min(12, Math.floor(pax)))
          : 0,
      baggageKg:
        missionType === 'charter' ? Math.max(0, Math.round(baggageKg ?? 0)) : 0,
      commodityId,
      cargoKg,
      payUsd,
      acceptedAtTick,
      deadlineTick,
      departedAtTick,
      settledAtTick,
      urgency,
      reason,
    },
    payload: Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
  };
}

function fleetPersistValues(
  a: PlayerAircraft,
  companyId: string,
): unknown[] {
  const { cols, leaseJson, leaseOutJson, payloadJson } =
    splitFleetAircraftForPersist(a);
  return [
    cols.id,
    companyId,
    cols.aircraftClassId,
    cols.airframeTypeId ?? null,
    cols.label ?? '',
    cols.locationIcao ?? '',
    sqlNum(cols.fuelKg),
    sqlNum(cols.fuelCapacityKg),
    cols.status,
    cols.assignedMissionId ?? null,
    cols.ownership ?? null,
    cols.registration ?? null,
    cols.condition ?? null,
    cols.hoursAirframe ?? null,
    cols.hoursEngine ?? null,
    cols.airframeConditionPct ?? null,
    cols.engineConditionPct ?? null,
    cols.hoursSinceInspection ?? null,
    cols.maintenanceDueAtHours ?? null,
    cols.airframeConfigurationId ?? null,
    cols.rolesPackRelPath ?? null,
    cols.leaseOverdue === true ? true : null,
    cols.listedListingId ?? null,
    leaseJson,
    leaseOutJson,
    payloadJson,
  ];
}

async function readFleetAircraft(
  pool: pg.Pool,
  companyId: string,
): Promise<PlayerAircraft[]> {
  const { rows } = await pool.query(
    `SELECT id, aircraft_class_id, airframe_type_id, label, location_icao,
            fuel_kg, fuel_capacity_kg, status, assigned_mission_id, ownership,
            registration, condition, hours_airframe, hours_engine,
            airframe_condition_pct, engine_condition_pct, hours_since_inspection,
            maintenance_due_at_hours, airframe_configuration_id, roles_pack_rel_path,
            lease_overdue, listed_listing_id, lease_json, lease_out_json, payload_json
     FROM fleet_aircraft WHERE company_id = $1 ORDER BY id ASC`,
    [companyId],
  );
  return rows.map((r) =>
    assembleFleetAircraftFromRow({
      id: r.id as string,
      aircraft_class_id: r.aircraft_class_id as string,
      airframe_type_id: r.airframe_type_id as string | null,
      label: r.label as string,
      location_icao: r.location_icao as string,
      fuel_kg: num(r.fuel_kg),
      fuel_capacity_kg: num(r.fuel_capacity_kg),
      status: r.status as string,
      assigned_mission_id: r.assigned_mission_id as string | null,
      ownership: r.ownership as string | null,
      registration: r.registration as string | null,
      condition: r.condition as string | null,
      hours_airframe: r.hours_airframe == null ? null : num(r.hours_airframe),
      hours_engine: r.hours_engine == null ? null : num(r.hours_engine),
      airframe_condition_pct:
        r.airframe_condition_pct == null ? null : num(r.airframe_condition_pct),
      engine_condition_pct:
        r.engine_condition_pct == null ? null : num(r.engine_condition_pct),
      hours_since_inspection:
        r.hours_since_inspection == null ? null : num(r.hours_since_inspection),
      maintenance_due_at_hours:
        r.maintenance_due_at_hours == null
          ? null
          : num(r.maintenance_due_at_hours),
      airframe_configuration_id: r.airframe_configuration_id as string | null,
      roles_pack_rel_path: r.roles_pack_rel_path as string | null,
      lease_overdue: r.lease_overdue as boolean | null,
      listed_listing_id: r.listed_listing_id as string | null,
      lease_json: r.lease_json,
      lease_out_json: r.lease_out_json,
      payload_json: r.payload_json,
    }),
  );
}

async function readMissionsTable(
  pool: pg.Pool,
  companyId: string,
): Promise<MissionIntent[]> {
  const { rows } = await pool.query(
    `SELECT id, status, origin_icao, dest_icao, aircraft_id,
            mission_type, charter_offer_id, pax, baggage_kg, commodity_id, cargo_kg,
            pay_usd, accepted_at_tick, deadline_tick, departed_at_tick, settled_at_tick,
            urgency, reason, payload_json
     FROM missions WHERE company_id = $1 ORDER BY accepted_at_tick ASC, id ASC`,
    [companyId],
  );
  return rows.map((r) => {
    const extra = parseJson<Partial<MissionIntent>>(r.payload_json) ?? {};
    const missionType = r.mission_type === 'charter' ? 'charter' : 'freight';
    const mission = {
      ...extra,
      id: r.id as string,
      missionType,
      status: r.status as MissionStatus,
      originIcao: r.origin_icao as string,
      destIcao: r.dest_icao as string,
      commodityId: r.commodity_id as CommodityId,
      cargoKg: num(r.cargo_kg),
      pax: missionType === 'charter' ? Math.max(1, Math.min(12, num(r.pax))) : 0,
      baggageKg: missionType === 'charter' ? Math.max(0, num(r.baggage_kg)) : 0,
      payUsd: num(r.pay_usd),
      acceptedAtTick: num(r.accepted_at_tick),
      deadlineTick: num(r.deadline_tick),
      urgency: r.urgency === 'urgent' ? 'urgent' : 'normal',
      reason: (r.reason as string) ?? '',
    } as MissionIntent;
    if (r.aircraft_id) mission.aircraftId = r.aircraft_id as string;
    if (r.charter_offer_id) mission.charterOfferId = r.charter_offer_id as string;
    if (r.departed_at_tick != null) mission.departedAtTick = num(r.departed_at_tick);
    if (r.settled_at_tick != null) mission.settledAtTick = num(r.settled_at_tick);
    return mission;
  });
}

async function readCompanyStateScalars(
  pool: pg.Pool,
  companyId: string,
): Promise<Partial<CareerMissionsState> | null> {
  const { rows } = await pool.query(
    `SELECT wallet_usd, pilot_name, pilot_icao, hub_selected, company_credit_json,
            cargo_ops_json, class_ops_json, aircraft_market_json, aircraft_market_day,
            aircraft_market_demand_day, airframe_perf_json, player_fbos_json,
            company_crew_json, ground_staff_json, active_bush_trip_json, port_pickups_json,
            player_warehouses_json, player_port_concessions_json,
            port_auto_buy_orders_json, last_seen_tick
     FROM company_state WHERE company_id = $1`,
    [companyId],
  );
  const row = rows[0];
  if (!row) return null;

  const out: Partial<CareerMissionsState> = {
    walletUsd: num(row.wallet_usd),
    pilotName: (row.pilot_name as string) ?? '',
    pilotIcao: (row.pilot_icao as string) || undefined,
    hubSelected: Boolean(row.hub_selected),
  };
  const lastSeen = num(row.last_seen_tick);
  if (lastSeen > 0) out.lastSeenTick = lastSeen;

  const credit = parseJson<CareerMissionsState['companyCredit']>(
    row.company_credit_json,
  );
  if (credit) out.companyCredit = credit;
  const cargoOps = parseJson<CareerMissionsState['cargoOps']>(row.cargo_ops_json);
  if (cargoOps) out.cargoOps = cargoOps;
  const classOps = parseJson<CareerMissionsState['classOps']>(row.class_ops_json);
  if (classOps) out.classOps = classOps;
  const market = parseJson<CareerMissionsState['aircraftMarket']>(
    row.aircraft_market_json,
  );
  if (market) out.aircraftMarket = market;
  if (row.aircraft_market_day != null) {
    out.aircraftMarketDay = num(row.aircraft_market_day);
  }
  if (row.aircraft_market_demand_day != null) {
    out.aircraftMarketDemandDay = num(row.aircraft_market_demand_day);
  }
  const perf = parseJson<CareerMissionsState['airframePerfOverrides']>(
    row.airframe_perf_json,
  );
  if (perf) out.airframePerfOverrides = perf;

  const fbosRaw = parseJson<PlayerFboState>(row.player_fbos_json);
  if (fbosRaw && typeof fbosRaw === 'object') {
    out.playerFbos = {
      fbos: Array.isArray(fbosRaw.fbos) ? fbosRaw.fbos : [],
      holds: Array.isArray(fbosRaw.holds) ? fbosRaw.holds : [],
      stock: [],
      ...(Array.isArray(fbosRaw.dispatchers)
        ? { dispatchers: fbosRaw.dispatchers }
        : {}),
      ...(fbosRaw.dispatcherHirePoolByHub &&
      typeof fbosRaw.dispatcherHirePoolByHub === 'object'
        ? { dispatcherHirePoolByHub: fbosRaw.dispatcherHirePoolByHub }
        : {}),
      ...(fbosRaw.dispatcherHirePoolDayByHub &&
      typeof fbosRaw.dispatcherHirePoolDayByHub === 'object'
        ? { dispatcherHirePoolDayByHub: fbosRaw.dispatcherHirePoolDayByHub }
        : {}),
      ...(fbosRaw.activeTour !== undefined
        ? { activeTour: fbosRaw.activeTour }
        : {}),
    };
  }

  const crew = parseJson<CareerMissionsState['companyCrew']>(
    row.company_crew_json,
  );
  if (crew) out.companyCrew = crew;
  const ground = parseJson<CareerMissionsState['groundStaff']>(
    row.ground_staff_json,
  );
  if (ground) out.groundStaff = ground;
  // Column kept for migrate; bush trips removed — never hydrate activeBushTrip.
  void row.active_bush_trip_json;

  const pickups = parseJson<CareerMissionsState['portPickups']>(
    row.port_pickups_json,
  );
  out.portPickups = Array.isArray(pickups) ? pickups : [];

  const wh = parseJson<CareerMissionsState['playerWarehouses']>(
    row.player_warehouses_json,
  );
  if (wh && typeof wh === 'object') {
    out.playerWarehouses = {
      warehouses: Array.isArray(wh.warehouses) ? wh.warehouses : [],
      stock: Array.isArray(wh.stock) ? wh.stock : [],
      inboundTransfers: Array.isArray(wh.inboundTransfers)
        ? wh.inboundTransfers
        : [],
      demandHolds: Array.isArray(wh.demandHolds) ? wh.demandHolds : [],
    };
  } else {
    out.playerWarehouses = { warehouses: [], stock: [], inboundTransfers: [] };
  }

  const concessions = parseJson<CareerMissionsState['playerPortConcessions']>(
    row.player_port_concessions_json,
  );
  out.playerPortConcessions = Array.isArray(concessions) ? concessions : [];
  const autoBuy = parseJson<CareerMissionsState['portAutoBuyOrders']>(
    row.port_auto_buy_orders_json,
  );
  out.portAutoBuyOrders = Array.isArray(autoBuy) ? autoBuy : [];

  return out;
}

async function readLedgerRows(
  pool: pg.Pool,
  companyId: string,
): Promise<CareerLedgerEntry[]> {
  const { rows } = await pool.query(
    `SELECT id, at_tick, day_index, amount_usd, kind, note, aircraft_id, mission_id, icao
     FROM ledger WHERE company_id = $1 ORDER BY at_tick ASC, id ASC`,
    [companyId],
  );
  return normalizeCareerLedger(
    rows.map((r) => ({
      id: r.id as string,
      atTick: num(r.at_tick),
      dayIndex: num(r.day_index),
      amountUsd: num(r.amount_usd),
      kind: r.kind as CareerLedgerKind,
      note: (r.note as string | null) ?? undefined,
      aircraftId: (r.aircraft_id as string | null) ?? undefined,
      missionId: (r.mission_id as string | null) ?? undefined,
      icao: (r.icao as string | null) ?? undefined,
    })),
  );
}

export async function hydrateMissionsFromPg(
  pool: pg.Pool,
  companyId: string,
  blobFallback: CareerMissionsState,
): Promise<CareerMissionsState> {
  const cid = companyId.trim() || LOCAL_COMPANY_ID;
  const scalars = await readCompanyStateScalars(pool, cid);
  const ledgerRows = await readLedgerRows(pool, cid);
  const ledger =
    ledgerRows.length > 0 ? ledgerRows : (blobFallback.ledger ?? []);

  if (scalars) {
    const merged: CareerMissionsState = {
      ...blobFallback,
      ...scalars,
      fleet: await readFleetAircraft(pool, cid),
      missions: await readMissionsTable(pool, cid),
      ledger,
    };
    const companyRes = await pool.query(
      `SELECT home_hub_icao, display_name FROM companies WHERE id = $1`,
      [cid],
    );
    const company = companyRes.rows[0] as
      | { home_hub_icao: string; display_name: string }
      | undefined;
    if (company?.home_hub_icao) merged.homeHubIcao = company.home_hub_icao;
    if (company?.display_name && !merged.pilotName) {
      merged.pilotName = company.display_name;
    }
    // Heal: empty seed / bad company_state can clear hubSelected while
    // companies.home_hub_icao still holds the registered hub (contract pilots).
    if (
      !merged.hubSelected &&
      merged.homeHubIcao?.trim() &&
      (merged.pilotName?.trim() || merged.pilotIcao?.trim() || merged.fleet.length > 0)
    ) {
      merged.hubSelected = true;
      if (!merged.pilotIcao?.trim()) merged.pilotIcao = merged.homeHubIcao;
    }
    return merged;
  }

  return {
    ...blobFallback,
    ledger,
  };
}

export async function persistMissionsTablesToPg(
  pool: pg.Pool,
  state: CareerMissionsState,
  companyId: string,
): Promise<void> {
  const cid = companyId.trim() || LOCAL_COMPANY_ID;
  const now = Date.now();

  await withTx(pool, async (client) => {
    const progressRes = await client.query(
      `SELECT
         COALESCE(
           (SELECT wallet_usd FROM company_state WHERE company_id = $1),
           0
         )::float8 AS wallet_usd,
         (SELECT COUNT(*)::int FROM fleet_aircraft WHERE company_id = $1) AS fleet_count,
         (SELECT COUNT(*)::int FROM ledger WHERE company_id = $1) AS ledger_count,
         (SELECT COUNT(*)::int FROM missions WHERE company_id = $1) AS mission_count`,
      [cid],
    );
    const fleetIdRes = await client.query(
      `SELECT id FROM fleet_aircraft WHERE company_id = $1 ORDER BY id ASC`,
      [cid],
    );
    const row = progressRes.rows[0] as
      | {
          wallet_usd: number;
          fleet_count: number;
          ledger_count: number;
          mission_count: number;
        }
      | undefined;
    assertCompanyPersistSafe({
      companyId: cid,
      existing: {
        walletUsd: Number(row?.wallet_usd ?? 0),
        fleetCount: Number(row?.fleet_count ?? 0),
        ledgerCount: Number(row?.ledger_count ?? 0),
        missionCount: Number(row?.mission_count ?? 0),
        fleetIds: fleetIdRes.rows.map((r) => String((r as { id: string }).id)),
      },
      incoming: companyProgressFromState(state),
    });

    if (state.pilotName || state.homeHubIcao) {
      await client.query(
        `UPDATE companies SET
           display_name = COALESCE(NULLIF($1, ''), display_name),
           home_hub_icao = COALESCE(NULLIF($2, ''), home_hub_icao)
         WHERE id = $3`,
        [state.pilotName ?? '', state.homeHubIcao ?? '', cid],
      );
    }

    await client.query(
      `INSERT INTO company_state (
         company_id, wallet_usd, pilot_name, pilot_icao, hub_selected,
         company_credit_json, cargo_ops_json, class_ops_json, aircraft_market_json,
         aircraft_market_day, aircraft_market_demand_day, airframe_perf_json,
         player_fbos_json, company_crew_json, ground_staff_json, active_bush_trip_json,
         port_pickups_json, player_warehouses_json, player_port_concessions_json,
         port_auto_buy_orders_json, last_seen_tick, updated_at_ms
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
         $10, $11, $12::jsonb,
         $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb,
         $17::jsonb, $18::jsonb, $19::jsonb,
         $20::jsonb, $21, $22
       )
       ON CONFLICT (company_id) DO UPDATE SET
         wallet_usd = EXCLUDED.wallet_usd,
         pilot_name = EXCLUDED.pilot_name,
         pilot_icao = EXCLUDED.pilot_icao,
         hub_selected = EXCLUDED.hub_selected,
         company_credit_json = EXCLUDED.company_credit_json,
         cargo_ops_json = EXCLUDED.cargo_ops_json,
         class_ops_json = EXCLUDED.class_ops_json,
         aircraft_market_json = EXCLUDED.aircraft_market_json,
         aircraft_market_day = EXCLUDED.aircraft_market_day,
         aircraft_market_demand_day = EXCLUDED.aircraft_market_demand_day,
         airframe_perf_json = EXCLUDED.airframe_perf_json,
         player_fbos_json = EXCLUDED.player_fbos_json,
         company_crew_json = COALESCE(
           EXCLUDED.company_crew_json,
           company_state.company_crew_json
         ),
         ground_staff_json = COALESCE(
           EXCLUDED.ground_staff_json,
           company_state.ground_staff_json
         ),
         active_bush_trip_json = EXCLUDED.active_bush_trip_json,
         port_pickups_json = EXCLUDED.port_pickups_json,
         player_warehouses_json = EXCLUDED.player_warehouses_json,
         player_port_concessions_json = EXCLUDED.player_port_concessions_json,
         port_auto_buy_orders_json = EXCLUDED.port_auto_buy_orders_json,
         last_seen_tick = EXCLUDED.last_seen_tick,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [
        cid,
        sqlNum(state.walletUsd),
        state.pilotName ?? '',
        state.pilotIcao ?? '',
        Boolean(state.hubSelected),
        jsonParam(state.companyCredit),
        jsonParam(state.cargoOps),
        jsonParam(state.classOps),
        jsonParam(state.aircraftMarket),
        state.aircraftMarketDay ?? null,
        state.aircraftMarketDemandDay ?? null,
        jsonParam(state.airframePerfOverrides),
        jsonParam(
          state.playerFbos
            ? { ...state.playerFbos, stock: [] }
            : null,
        ),
        jsonParam(state.companyCrew),
        jsonParam(state.groundStaff),
        null,
        jsonParam(state.portPickups ?? []),
        jsonParam(
          state.playerWarehouses ?? {
            warehouses: [],
            stock: [],
            inboundTransfers: [],
          },
        ),
        jsonParam(state.playerPortConcessions ?? []),
        jsonParam(state.portAutoBuyOrders ?? []),
        typeof state.lastSeenTick === 'number' &&
          Number.isFinite(state.lastSeenTick)
          ? Math.max(0, Math.floor(state.lastSeenTick))
          : 0,
        now,
      ],
    );

    await client.query(`DELETE FROM fleet_aircraft WHERE company_id = $1`, [
      cid,
    ]);
    const fleet = state.fleet ?? [];
    if (fleet.length > 0) {
      const fleetRows: unknown[][] = [];
      for (const a of fleet) {
        if (!a.id) continue;
        fleetRows.push(fleetPersistValues(a, cid));
      }
      if (fleetRows.length > 0) {
        await insertChunks(
          client,
          `INSERT INTO fleet_aircraft (
             id, company_id, aircraft_class_id, airframe_type_id, label, location_icao,
             fuel_kg, fuel_capacity_kg, status, assigned_mission_id, ownership,
             registration, condition, hours_airframe, hours_engine,
             airframe_condition_pct, engine_condition_pct, hours_since_inspection,
             maintenance_due_at_hours, airframe_configuration_id, roles_pack_rel_path,
             lease_overdue, listed_listing_id, lease_json, lease_out_json, payload_json
           )`,
          26,
          fleetRows,
        );
      }
    }

    await client.query(`DELETE FROM missions WHERE company_id = $1`, [cid]);
    const missions = state.missions ?? [];
    if (missions.length > 0) {
      const missionRows: unknown[][] = [];
      for (const m of missions) {
        if (!m.id) continue;
        const { core, payload } = missionCoreAndPayload(m);
        missionRows.push([
          core.id,
          cid,
          core.status,
          core.originIcao,
          core.destIcao,
          core.aircraftId ?? null,
          core.missionType,
          core.charterOfferId ?? null,
          sqlNum(core.pax),
          sqlNum(core.baggageKg),
          core.commodityId,
          sqlNum(core.cargoKg),
          sqlNum(core.payUsd),
          sqlNum(core.acceptedAtTick),
          sqlNum(core.deadlineTick),
          core.departedAtTick ?? null,
          core.settledAtTick ?? null,
          core.urgency ?? 'normal',
          core.reason ?? '',
          payload,
        ]);
      }
      if (missionRows.length > 0) {
        await insertChunks(
          client,
          `INSERT INTO missions (
             id, company_id, status, origin_icao, dest_icao, aircraft_id,
             mission_type, charter_offer_id, pax, baggage_kg, commodity_id,
             cargo_kg, pay_usd, accepted_at_tick, deadline_tick, departed_at_tick,
             settled_at_tick, urgency, reason, payload_json
           )`,
          20,
          missionRows,
        );
      }
    }

    await client.query(`DELETE FROM ledger WHERE company_id = $1`, [cid]);
    const ledger = state.ledger ?? [];
    if (ledger.length > 0) {
      const ledgerRows: unknown[][] = ledger
        .filter((e) => e.id)
        .map((e) => [
          e.id,
          cid,
          sqlNum(e.atTick),
          sqlNum(e.dayIndex),
          sqlNum(e.amountUsd),
          e.kind,
          e.note ?? null,
          e.aircraftId ?? null,
          e.missionId ?? null,
          e.icao ?? null,
        ]);
      if (ledgerRows.length > 0) {
        await insertChunks(
          client,
          `INSERT INTO ledger (
             id, company_id, at_tick, day_index, amount_usd, kind, note,
             aircraft_id, mission_id, icao
           )`,
          10,
          ledgerRows,
        );
      }
    }
  });
}
