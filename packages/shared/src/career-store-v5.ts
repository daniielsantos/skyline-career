/**
 * Career store schema v5 — world ops tables as SoT (NPC roster, fuel, Demand, ports).
 *
 * SP uses `LOCAL_WORLD_ID`. Tick still in-memory; this file is I/O + DDL only.
 * Player WH / concessions stay on company_state (tenant), not here.
 */

import type { DatabaseSync } from 'node:sqlite';
import { countryIdFromRegion } from './career-partition.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type {
  CareerEconomyWorld,
  CommodityId,
  DemandOrder,
  DemandOrderStatus,
  FreighterClassId,
  FuelHaul,
  FuelTruck,
  FuelTruckClassId,
  NpcFreighter,
  PortConcessionIndexRow,
  PortInventoryRow,
  PortListing,
  PortListingStatus,
} from './types/career-economy.js';

export const CAREER_STORE_SCHEMA_V5 = '5';

export type SqliteDb = DatabaseSync;

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

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sqlOptNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function sqlText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function sqlOptText(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
}

function parsePayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowId(row: { id?: unknown }): string {
  return typeof row.id === 'string' ? row.id.trim() : '';
}

/** Last row wins. Old blobs used `Math.random() * 1e6` listing ids and can collide. */
function uniqueByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
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

export function ensureV5Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npcs (
      world_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      aircraft_class_id TEXT NOT NULL,
      airframe_type_id TEXT,
      max_cargo_kg REAL,
      home_region TEXT NOT NULL,
      home_country_id TEXT NOT NULL DEFAULT '',
      reliability REAL NOT NULL,
      aggressiveness REAL NOT NULL,
      fee_bias REAL NOT NULL,
      status TEXT NOT NULL,
      busy_until_tick INTEGER,
      busy_until_ms INTEGER,
      duty_hours_accum REAL,
      last_leg_duty_hours REAL,
      rest_until_tick INTEGER,
      rest_until_ms INTEGER,
      hours_since_mx REAL,
      location_icao TEXT,
      mx_until_ms INTEGER,
      mx_until_tick INTEGER,
      leased_player_aircraft_id TEXT,
      current_flight_id TEXT,
      payload_json TEXT,
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
      busy_until_ms INTEGER,
      payload_json TEXT,
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
      cargo_kg REAL NOT NULL,
      departed_at_ms INTEGER NOT NULL,
      arrives_at_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      PRIMARY KEY (world_id, id)
    );
    CREATE INDEX IF NOT EXISTS fuel_hauls_status_idx ON fuel_hauls(world_id, status);
    CREATE INDEX IF NOT EXISTS fuel_hauls_dest_idx ON fuel_hauls(world_id, dest_icao);

    CREATE TABLE IF NOT EXISTS demand_orders (
      world_id TEXT NOT NULL,
      id TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      wanted_kg REAL NOT NULL,
      remaining_kg REAL NOT NULL,
      max_unit_price_usd REAL NOT NULL,
      arrived_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      PRIMARY KEY (world_id, id)
    );
    CREATE INDEX IF NOT EXISTS demand_orders_status_idx ON demand_orders(world_id, status);
    CREATE INDEX IF NOT EXISTS demand_orders_dest_idx ON demand_orders(world_id, dest_icao);

    CREATE TABLE IF NOT EXISTS port_listings (
      world_id TEXT NOT NULL,
      id TEXT NOT NULL,
      port_id TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      available_kg REAL NOT NULL,
      unit_price_usd REAL NOT NULL,
      allocated_hub_icao TEXT NOT NULL,
      arrived_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      PRIMARY KEY (world_id, id)
    );
    CREATE INDEX IF NOT EXISTS port_listings_port_idx ON port_listings(world_id, port_id, status);

    CREATE TABLE IF NOT EXISTS port_inventories (
      world_id TEXT NOT NULL,
      port_id TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      stock_kg REAL NOT NULL,
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
  `);
  try {
    db.exec(
      `ALTER TABLE port_concessions ADD COLUMN level INTEGER NOT NULL DEFAULT 1`,
    );
  } catch {
    /* column already exists */
  }
}

export function countNpcRows(db: SqliteDb, worldId = LOCAL_WORLD_ID): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM npcs WHERE world_id = ?`)
    .get(worldId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export function countFuelTruckRows(db: SqliteDb, worldId = LOCAL_WORLD_ID): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM fuel_trucks WHERE world_id = ?`)
    .get(worldId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export function readNpcs(db: SqliteDb, worldId = LOCAL_WORLD_ID): NpcFreighter[] {
  const rows = db
    .prepare(
      `SELECT id, name, aircraft_class_id, airframe_type_id, max_cargo_kg, home_region,
              reliability, aggressiveness, fee_bias, status, busy_until_tick, busy_until_ms,
              duty_hours_accum, last_leg_duty_hours, rest_until_tick, rest_until_ms,
              hours_since_mx, location_icao, mx_until_ms, mx_until_tick,
              leased_player_aircraft_id, current_flight_id, payload_json
       FROM npcs WHERE world_id = ? ORDER BY id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const extra = parsePayload(typeof r.payload_json === 'string' ? r.payload_json : null);
    const statusRaw = sqlText(r.status);
    const status = NPC_STATUSES.has(statusRaw as NpcFreighter['status'])
      ? (statusRaw as NpcFreighter['status'])
      : 'idle';
    const npc: NpcFreighter = {
      id: sqlText(r.id),
      name: sqlText(r.name),
      aircraftClassId: sqlText(r.aircraft_class_id) as FreighterClassId,
      homeRegion: sqlText(r.home_region),
      reliability: sqlNum(r.reliability),
      aggressiveness: sqlNum(r.aggressiveness),
      feeBias: sqlNum(r.fee_bias),
      status,
    };
    const airframe = sqlOptText(r.airframe_type_id);
    if (airframe) npc.airframeTypeId = airframe;
    const maxCargo = sqlOptNum(r.max_cargo_kg);
    if (maxCargo != null) npc.maxCargoKg = maxCargo;
    const busyTick = sqlOptNum(r.busy_until_tick);
    if (busyTick != null) npc.busyUntilTick = busyTick;
    const busyMs = sqlOptNum(r.busy_until_ms);
    if (busyMs != null) npc.busyUntilMs = busyMs;
    const duty = sqlOptNum(r.duty_hours_accum);
    if (duty != null) npc.dutyHoursAccum = duty;
    const lastLeg = sqlOptNum(r.last_leg_duty_hours);
    if (lastLeg != null) npc.lastLegDutyHours = lastLeg;
    const restTick = sqlOptNum(r.rest_until_tick);
    if (restTick != null) npc.restUntilTick = restTick;
    const restMs = sqlOptNum(r.rest_until_ms);
    if (restMs != null) npc.restUntilMs = restMs;
    const hoursMx = sqlOptNum(r.hours_since_mx);
    if (hoursMx != null) npc.hoursSinceMx = hoursMx;
    const loc = sqlOptText(r.location_icao);
    if (loc) npc.locationIcao = loc;
    const mxMs = sqlOptNum(r.mx_until_ms);
    if (mxMs != null) npc.mxUntilMs = mxMs;
    const mxTick = sqlOptNum(r.mx_until_tick);
    if (mxTick != null) npc.mxUntilTick = mxTick;
    const leased = sqlOptText(r.leased_player_aircraft_id);
    if (leased) npc.leasedPlayerAircraftId = leased;
    const flight = sqlOptText(r.current_flight_id);
    if (flight) npc.currentFlightId = flight;
    return { ...extra, ...npc };
  });
}

export function replaceNpcs(
  db: SqliteDb,
  npcs: NpcFreighter[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM npcs WHERE world_id = ?`).run(worldId);
  npcs = uniqueByKey(npcs, rowId);
  const ins = db.prepare(
    `INSERT INTO npcs (
       world_id, id, name, aircraft_class_id, airframe_type_id, max_cargo_kg,
       home_region, home_country_id, reliability, aggressiveness, fee_bias, status,
       busy_until_tick, busy_until_ms, duty_hours_accum, last_leg_duty_hours,
       rest_until_tick, rest_until_ms, hours_since_mx, location_icao, mx_until_ms,
       mx_until_tick, leased_player_aircraft_id, current_flight_id, payload_json
     ) VALUES (
       @world_id, @id, @name, @aircraft_class_id, @airframe_type_id, @max_cargo_kg,
       @home_region, @home_country_id, @reliability, @aggressiveness, @fee_bias, @status,
       @busy_until_tick, @busy_until_ms, @duty_hours_accum, @last_leg_duty_hours,
       @rest_until_tick, @rest_until_ms, @hours_since_mx, @location_icao, @mx_until_ms,
       @mx_until_tick, @leased_player_aircraft_id, @current_flight_id, @payload_json
     )`,
  );
  for (const npc of npcs) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      world_id: worldId,
      id,
      name,
      aircraft_class_id: aircraftClassId,
      airframe_type_id: airframeTypeId ?? null,
      max_cargo_kg: maxCargoKg ?? null,
      home_region: homeRegion,
      home_country_id: countryIdFromRegion(homeRegion) || '',
      reliability,
      aggressiveness,
      fee_bias: feeBias,
      status,
      busy_until_tick: busyUntilTick ?? null,
      busy_until_ms: busyUntilMs ?? null,
      duty_hours_accum: dutyHoursAccum ?? null,
      last_leg_duty_hours: lastLegDutyHours ?? null,
      rest_until_tick: restUntilTick ?? null,
      rest_until_ms: restUntilMs ?? null,
      hours_since_mx: hoursSinceMx ?? null,
      location_icao: locationIcao ?? null,
      mx_until_ms: mxUntilMs ?? null,
      mx_until_tick: mxUntilTick ?? null,
      leased_player_aircraft_id: leasedPlayerAircraftId ?? null,
      current_flight_id: currentFlightId ?? null,
      payload_json: extra,
    });
  }
}

export function readFuelTrucks(db: SqliteDb, worldId = LOCAL_WORLD_ID): FuelTruck[] {
  const rows = db
    .prepare(
      `SELECT id, name, truck_class_id, home_region, status, current_haul_id,
              busy_until_ms, payload_json
       FROM fuel_trucks WHERE world_id = ? ORDER BY id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const extra = parsePayload(typeof r.payload_json === 'string' ? r.payload_json : null);
    const classRaw = sqlText(r.truck_class_id);
    const truckClassId = FUEL_TRUCK_CLASSES.has(classRaw as FuelTruckClassId)
      ? (classRaw as FuelTruckClassId)
      : 'rigid_tanker';
    const statusRaw = sqlText(r.status);
    const status = FUEL_TRUCK_STATUSES.has(statusRaw as FuelTruck['status'])
      ? (statusRaw as FuelTruck['status'])
      : 'idle';
    const truck: FuelTruck = {
      id: sqlText(r.id),
      name: sqlText(r.name),
      truckClassId,
      homeRegion: sqlText(r.home_region),
      status,
    };
    const haul = sqlOptText(r.current_haul_id);
    if (haul) truck.currentHaulId = haul;
    const busy = sqlOptNum(r.busy_until_ms);
    if (busy != null) truck.busyUntilMs = busy;
    return { ...extra, ...truck };
  });
}

export function replaceFuelTrucks(
  db: SqliteDb,
  trucks: FuelTruck[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM fuel_trucks WHERE world_id = ?`).run(worldId);
  trucks = uniqueByKey(trucks, rowId);
  const ins = db.prepare(
    `INSERT INTO fuel_trucks (
       world_id, id, name, truck_class_id, home_region, status, current_haul_id,
       busy_until_ms, payload_json
     ) VALUES (
       @world_id, @id, @name, @truck_class_id, @home_region, @status, @current_haul_id,
       @busy_until_ms, @payload_json
     )`,
  );
  for (const t of trucks) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      world_id: worldId,
      id,
      name,
      truck_class_id: truckClassId,
      home_region: homeRegion,
      status,
      current_haul_id: currentHaulId ?? null,
      busy_until_ms: busyUntilMs ?? null,
      payload_json: extra,
    });
  }
}

export function readFuelHauls(db: SqliteDb, worldId = LOCAL_WORLD_ID): FuelHaul[] {
  const rows = db
    .prepare(
      `SELECT id, truck_id, origin_icao, dest_icao, commodity_id, cargo_kg,
              departed_at_ms, arrives_at_ms, status, payload_json
       FROM fuel_hauls WHERE world_id = ? ORDER BY departed_at_ms ASC, id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const extra = parsePayload(typeof r.payload_json === 'string' ? r.payload_json : null);
    const statusRaw = sqlText(r.status);
    const status = FUEL_HAUL_STATUSES.has(statusRaw as FuelHaul['status'])
      ? (statusRaw as FuelHaul['status'])
      : 'enroute';
    const haul: FuelHaul = {
      id: sqlText(r.id),
      truckId: sqlText(r.truck_id),
      originIcao: sqlText(r.origin_icao),
      destIcao: sqlText(r.dest_icao),
      commodityId: 'fuel',
      cargoKg: sqlNum(r.cargo_kg),
      departedAtMs: sqlNum(r.departed_at_ms),
      arrivesAtMs: sqlNum(r.arrives_at_ms),
      status,
    };
    return { ...extra, ...haul };
  });
}

export function replaceFuelHauls(
  db: SqliteDb,
  hauls: FuelHaul[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM fuel_hauls WHERE world_id = ?`).run(worldId);
  hauls = uniqueByKey(hauls, rowId);
  const ins = db.prepare(
    `INSERT INTO fuel_hauls (
       world_id, id, truck_id, origin_icao, dest_icao, commodity_id, cargo_kg,
       departed_at_ms, arrives_at_ms, status, payload_json
     ) VALUES (
       @world_id, @id, @truck_id, @origin_icao, @dest_icao, @commodity_id, @cargo_kg,
       @departed_at_ms, @arrives_at_ms, @status, @payload_json
     )`,
  );
  for (const h of hauls) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      world_id: worldId,
      id,
      truck_id: truckId,
      origin_icao: originIcao,
      dest_icao: destIcao,
      commodity_id: commodityId,
      cargo_kg: cargoKg,
      departed_at_ms: departedAtMs,
      arrives_at_ms: arrivesAtMs,
      status,
      payload_json: extra,
    });
  }
}

export function readDemandOrders(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): DemandOrder[] {
  const rows = db
    .prepare(
      `SELECT id, dest_icao, commodity_id, wanted_kg, remaining_kg, max_unit_price_usd,
              arrived_at_tick, expires_at_tick, status, payload_json
       FROM demand_orders WHERE world_id = ? ORDER BY expires_at_tick ASC, id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const extra = parsePayload(typeof r.payload_json === 'string' ? r.payload_json : null);
    const statusRaw = sqlText(r.status);
    const status = DEMAND_STATUSES.has(statusRaw as DemandOrderStatus)
      ? (statusRaw as DemandOrderStatus)
      : 'open';
    const order: DemandOrder = {
      id: sqlText(r.id),
      destIcao: sqlText(r.dest_icao),
      commodityId: sqlText(r.commodity_id) as CommodityId,
      wantedKg: sqlNum(r.wanted_kg),
      remainingKg: sqlNum(r.remaining_kg),
      maxUnitPriceUsd: sqlNum(r.max_unit_price_usd),
      arrivedAtTick: sqlNum(r.arrived_at_tick),
      expiresAtTick: sqlNum(r.expires_at_tick),
      status,
    };
    return { ...extra, ...order };
  });
}

export function replaceDemandOrders(
  db: SqliteDb,
  orders: DemandOrder[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM demand_orders WHERE world_id = ?`).run(worldId);
  orders = uniqueByKey(orders, rowId);
  const ins = db.prepare(
    `INSERT INTO demand_orders (
       world_id, id, dest_icao, commodity_id, wanted_kg, remaining_kg,
       max_unit_price_usd, arrived_at_tick, expires_at_tick, status, payload_json
     ) VALUES (
       @world_id, @id, @dest_icao, @commodity_id, @wanted_kg, @remaining_kg,
       @max_unit_price_usd, @arrived_at_tick, @expires_at_tick, @status, @payload_json
     )`,
  );
  for (const o of orders) {
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
      ...rest
    } = o;
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      world_id: worldId,
      id,
      dest_icao: destIcao,
      commodity_id: commodityId,
      wanted_kg: wantedKg,
      remaining_kg: remainingKg,
      max_unit_price_usd: maxUnitPriceUsd,
      arrived_at_tick: arrivedAtTick,
      expires_at_tick: expiresAtTick,
      status,
      payload_json: extra,
    });
  }
}

export function readPortListings(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): PortListing[] {
  const rows = db
    .prepare(
      `SELECT id, port_id, commodity_id, available_kg, unit_price_usd, allocated_hub_icao,
              arrived_at_tick, expires_at_tick, status, payload_json
       FROM port_listings WHERE world_id = ? ORDER BY expires_at_tick ASC, id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const extra = parsePayload(typeof r.payload_json === 'string' ? r.payload_json : null);
    const statusRaw = sqlText(r.status);
    const status = PORT_LISTING_STATUSES.has(statusRaw as PortListingStatus)
      ? (statusRaw as PortListingStatus)
      : 'open';
    const listing: PortListing = {
      id: sqlText(r.id),
      portId: sqlText(r.port_id),
      commodityId: sqlText(r.commodity_id) as CommodityId,
      availableKg: sqlNum(r.available_kg),
      unitPriceUsd: sqlNum(r.unit_price_usd),
      allocatedHubIcao: sqlText(r.allocated_hub_icao),
      arrivedAtTick: sqlNum(r.arrived_at_tick),
      expiresAtTick: sqlNum(r.expires_at_tick),
      status,
    };
    return { ...extra, ...listing };
  });
}

export function replacePortListings(
  db: SqliteDb,
  listings: PortListing[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM port_listings WHERE world_id = ?`).run(worldId);
  listings = uniqueByKey(listings, rowId);
  const ins = db.prepare(
    `INSERT INTO port_listings (
       world_id, id, port_id, commodity_id, available_kg, unit_price_usd,
       allocated_hub_icao, arrived_at_tick, expires_at_tick, status, payload_json
     ) VALUES (
       @world_id, @id, @port_id, @commodity_id, @available_kg, @unit_price_usd,
       @allocated_hub_icao, @arrived_at_tick, @expires_at_tick, @status, @payload_json
     )`,
  );
  for (const l of listings) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      world_id: worldId,
      id,
      port_id: portId,
      commodity_id: commodityId,
      available_kg: availableKg,
      unit_price_usd: unitPriceUsd,
      allocated_hub_icao: allocatedHubIcao,
      arrived_at_tick: arrivedAtTick,
      expires_at_tick: expiresAtTick,
      status,
      payload_json: extra,
    });
  }
}

export function readPortInventories(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): PortInventoryRow[] {
  const rows = db
    .prepare(
      `SELECT port_id, commodity_id, stock_kg, last_restock_tick
       FROM port_inventories WHERE world_id = ? ORDER BY port_id ASC, commodity_id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    portId: sqlText(r.port_id),
    commodityId: sqlText(r.commodity_id) as CommodityId,
    stockKg: sqlNum(r.stock_kg),
    lastRestockTick: sqlNum(r.last_restock_tick),
  }));
}

export function replacePortInventories(
  db: SqliteDb,
  rows: PortInventoryRow[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM port_inventories WHERE world_id = ?`).run(worldId);
  rows = uniqueByKey(
    rows,
    (r) =>
      `${String(r.portId ?? '').trim().toUpperCase()}\0${String(r.commodityId ?? '')}`,
  );
  const ins = db.prepare(
    `INSERT INTO port_inventories (
       world_id, port_id, commodity_id, stock_kg, last_restock_tick
     ) VALUES (@world_id, @port_id, @commodity_id, @stock_kg, @last_restock_tick)`,
  );
  for (const r of rows) {
    ins.run({
      world_id: worldId,
      port_id: r.portId,
      commodity_id: r.commodityId,
      stock_kg: r.stockKg,
      last_restock_tick: r.lastRestockTick,
    });
  }
}

export function readPortConcessions(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): PortConcessionIndexRow[] {
  const rows = db
    .prepare(
      `SELECT port_id, company_id, lease_paid_through_tick, level
       FROM port_concessions WHERE world_id = ? ORDER BY port_id ASC`,
    )
    .all(worldId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const levelNum = Math.floor(sqlNum(r.level, 1));
    const level = levelNum === 2 || levelNum === 3 ? levelNum : 1;
    return {
      portId: sqlText(r.port_id),
      companyId: sqlText(r.company_id),
      leasePaidThroughTick: sqlNum(r.lease_paid_through_tick),
      level,
    };
  });
}

export function replacePortConcessions(
  db: SqliteDb,
  rows: PortConcessionIndexRow[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM port_concessions WHERE world_id = ?`).run(worldId);
  rows = uniqueByKey(rows, (r) => String(r.portId ?? '').trim().toUpperCase());
  const ins = db.prepare(
    `INSERT INTO port_concessions (
       world_id, port_id, company_id, lease_paid_through_tick, level
     ) VALUES (@world_id, @port_id, @company_id, @lease_paid_through_tick, @level)`,
  );
  for (const r of rows) {
    const level = r.level === 2 || r.level === 3 ? r.level : 1;
    ins.run({
      world_id: worldId,
      port_id: r.portId,
      company_id: r.companyId,
      lease_paid_through_tick: r.leasePaidThroughTick,
      level,
    });
  }
}

export function persistWorldOpsTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  replaceNpcs(db, world.npcs ?? [], worldId);
  replaceFuelTrucks(db, world.fuelTrucks ?? [], worldId);
  replaceFuelHauls(db, world.fuelHauls ?? [], worldId);
  replaceDemandOrders(db, world.demandOrders ?? [], worldId);
  replacePortListings(db, world.portListings ?? [], worldId);
  replacePortInventories(db, world.portInventories ?? [], worldId);
  replacePortConcessions(db, world.portConcessions ?? [], worldId);
}

export function hydrateWorldOpsFromTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  const npcs = readNpcs(db, worldId);
  if (npcs.length > 0) world.npcs = npcs;
  const trucks = readFuelTrucks(db, worldId);
  if (trucks.length > 0) world.fuelTrucks = trucks;
  const hauls = readFuelHauls(db, worldId);
  if (hauls.length > 0) world.fuelHauls = hauls;
  const demand = readDemandOrders(db, worldId);
  if (demand.length > 0) world.demandOrders = demand;
  const listings = readPortListings(db, worldId);
  if (listings.length > 0) world.portListings = listings;
  const inventories = readPortInventories(db, worldId);
  if (inventories.length > 0) world.portInventories = inventories;
  const concessions = readPortConcessions(db, worldId);
  if (concessions.length > 0) world.portConcessions = concessions;
}

/** Drop world-ops arrays from the economy blob remainder once tables are SoT. */
export function stripEconomyWorldOps(
  blob: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...blob,
    npcs: [],
    fuelTrucks: [],
    fuelHauls: [],
    demandOrders: [],
    portListings: [],
    portInventories: [],
    portConcessions: [],
  };
}

export function economyBlobHasWorldOps(raw: Record<string, unknown>): boolean {
  const len = (key: string): number =>
    Array.isArray(raw[key]) ? (raw[key] as unknown[]).length : 0;
  return (
    len('npcs') > 0 ||
    len('fuelTrucks') > 0 ||
    len('fuelHauls') > 0 ||
    len('demandOrders') > 0 ||
    len('portListings') > 0 ||
    len('portInventories') > 0 ||
    len('portConcessions') > 0
  );
}

/**
 * Copy blob NPC/fuel/demand/ports → tables when v5 tables are empty, then strip.
 */
export function migrateV4toV5IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV5Ddl(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 5) return;

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
      if (economyBlobHasWorldOps(economy as unknown as Record<string, unknown>)) {
        persistWorldOpsTables(db, economy, LOCAL_WORLD_ID);
      }
      const stripped = stripEconomyWorldOps(economy as unknown as Record<string, unknown>);
      db.prepare(`UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`).run(
        JSON.stringify(stripped),
        Date.now(),
      );
    }
    metaSet(db, 'schema_version', schemaVersion);
  });
}
