/**
 * PG schema v29 — promote economy_meta.misc_json leftovers to typed columns
 * and tables. SP SQLite keeps these fields inside economy_json (no parity).
 */

import type pg from 'pg';
import { parseClientUpdatePolicy } from './career-client-update-policy.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type {
  CareerEconomyWorld,
  EconomyFlowStats,
  InternationalLane,
  PortInboundShip,
  PresenceEvent,
  PresenceEventKind,
  RegionalRecoveryState,
  TourLotSoftHold,
} from './types/career-economy.js';

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function jsonParam(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

async function insertChunks(
  client: pg.PoolClient,
  prefix: string,
  _colsPerRow: number,
  rows: unknown[][],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const row of chunk) {
      const ph: string[] = [];
      for (const cell of row) {
        values.push(cell);
        ph.push(`$${p++}`);
      }
      placeholders.push(`(${ph.join(',')})`);
    }
    await client.query(`${prefix} VALUES ${placeholders.join(',')}`, values);
  }
}

/** Schema v29 DDL + one-shot backfill from misc_json. */
export async function ensurePgEconomyLeftoversDdl(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE economy_meta
      ADD COLUMN IF NOT EXISTS economy_version INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS aircraft_pool_catalog_hash TEXT,
      ADD COLUMN IF NOT EXISTS force_client_update BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS min_client_version TEXT NOT NULL DEFAULT '0.0.0',
      ADD COLUMN IF NOT EXISTS flow_stats JSONB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS international_lanes (
      world_id TEXT NOT NULL REFERENCES worlds(id),
      id TEXT NOT NULL,
      origin_country_id TEXT NOT NULL,
      dest_country_id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      capacity_kg_per_day DOUBLE PRECISION,
      PRIMARY KEY (world_id, id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS international_lanes_pair_idx
      ON international_lanes(world_id, origin_country_id, dest_country_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS port_inbound_ships (
      world_id TEXT NOT NULL REFERENCES worlds(id),
      port_id TEXT NOT NULL,
      arrives_at_tick INTEGER NOT NULL,
      PRIMARY KEY (world_id, port_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_lot_soft_holds (
      world_id TEXT NOT NULL REFERENCES worlds(id),
      company_id TEXT NOT NULL,
      tour_id TEXT NOT NULL,
      leg_index INTEGER NOT NULL,
      lot_id TEXT NOT NULL,
      kg DOUBLE PRECISION NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      PRIMARY KEY (world_id, company_id, tour_id, leg_index)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tour_lot_soft_holds_expiry_idx
      ON tour_lot_soft_holds(world_id, expires_at_tick)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tour_lot_soft_holds_lot_idx
      ON tour_lot_soft_holds(world_id, lot_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS regional_recovery (
      world_id TEXT NOT NULL REFERENCES worlds(id),
      region TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      entered_day INTEGER,
      low_live_streak INTEGER NOT NULL DEFAULT 0,
      recovered_streak INTEGER NOT NULL DEFAULT 0,
      last_eval_day INTEGER NOT NULL DEFAULT 0,
      last_live_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
      last_dead_spoke_share DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (world_id, region)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS presence_events (
      world_id TEXT NOT NULL REFERENCES worlds(id),
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      at_tick INTEGER NOT NULL,
      at_ms BIGINT NOT NULL,
      company_id TEXT NOT NULL,
      company_display_name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (world_id, id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS presence_events_tick_idx
      ON presence_events(world_id, at_tick DESC)
  `);

  // One-shot backfill from misc_json (idempotent: only fill empty targets).
  await pool.query(`
    UPDATE economy_meta SET
      economy_version = COALESCE(
        NULLIF((misc_json->>'version')::int, 0),
        economy_version
      ),
      aircraft_pool_catalog_hash = COALESCE(
        NULLIF(misc_json->>'aircraftPoolCatalogHash', ''),
        aircraft_pool_catalog_hash
      ),
      force_client_update = COALESCE(
        (misc_json->'clientUpdatePolicy'->>'forceUpdate')::boolean,
        force_client_update
      ),
      min_client_version = COALESCE(
        NULLIF(misc_json->'clientUpdatePolicy'->>'minClientVersion', ''),
        min_client_version
      ),
      flow_stats = COALESCE(misc_json->'flow', flow_stats)
    WHERE misc_json IS NOT NULL
      AND misc_json <> '{}'::jsonb
  `);

  await pool.query(`
    INSERT INTO international_lanes (
      world_id, id, origin_country_id, dest_country_id,
      origin_icao, dest_icao, capacity_kg_per_day
    )
    SELECT
      m.world_id,
      elem->>'id',
      COALESCE(elem->>'originCountryId', ''),
      COALESCE(elem->>'destCountryId', ''),
      COALESCE(elem->>'originIcao', ''),
      COALESCE(elem->>'destIcao', ''),
      NULLIF(elem->>'capacityKgPerDay', '')::double precision
    FROM economy_meta m,
         LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(m.misc_json->'internationalLanes') = 'array'
             THEN m.misc_json->'internationalLanes'
             ELSE '[]'::jsonb
           END
         ) AS elem
    WHERE elem->>'id' IS NOT NULL AND elem->>'id' <> ''
    ON CONFLICT (world_id, id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO port_inbound_ships (world_id, port_id, arrives_at_tick)
    SELECT
      m.world_id,
      elem->>'portId',
      COALESCE((elem->>'arrivesAtTick')::int, 0)
    FROM economy_meta m,
         LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(m.misc_json->'portInboundShips') = 'array'
             THEN m.misc_json->'portInboundShips'
             ELSE '[]'::jsonb
           END
         ) AS elem
    WHERE elem->>'portId' IS NOT NULL AND elem->>'portId' <> ''
    ON CONFLICT (world_id, port_id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO tour_lot_soft_holds (
      world_id, company_id, tour_id, leg_index, lot_id, kg, expires_at_tick
    )
    SELECT
      m.world_id,
      COALESCE(elem->>'companyId', ''),
      COALESCE(elem->>'tourId', ''),
      COALESCE((elem->>'legIndex')::int, 0),
      COALESCE(elem->>'lotId', ''),
      COALESCE((elem->>'kg')::double precision, 0),
      COALESCE((elem->>'expiresAtTick')::int, 0)
    FROM economy_meta m,
         LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(m.misc_json->'tourLotSoftHolds') = 'array'
             THEN m.misc_json->'tourLotSoftHolds'
             ELSE '[]'::jsonb
           END
         ) AS elem
    WHERE elem->>'tourId' IS NOT NULL AND elem->>'tourId' <> ''
    ON CONFLICT (world_id, company_id, tour_id, leg_index) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO regional_recovery (
      world_id, region, active, entered_day, low_live_streak, recovered_streak,
      last_eval_day, last_live_pct, last_dead_spoke_share
    )
    SELECT
      m.world_id,
      key,
      COALESCE((value->>'active')::boolean, FALSE),
      NULLIF(value->>'enteredDay', '')::int,
      COALESCE((value->>'lowLiveStreak')::int, 0),
      COALESCE((value->>'recoveredStreak')::int, 0),
      COALESCE((value->>'lastEvalDay')::int, 0),
      COALESCE((value->>'lastLivePct')::double precision, 0),
      COALESCE((value->>'lastDeadSpokeShare')::double precision, 0)
    FROM economy_meta m,
         LATERAL jsonb_each(
           CASE
             WHEN jsonb_typeof(m.misc_json->'regionalRecovery') = 'object'
             THEN m.misc_json->'regionalRecovery'
             ELSE '{}'::jsonb
           END
         ) AS kv(key, value)
    WHERE key <> ''
    ON CONFLICT (world_id, region) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO presence_events (
      world_id, id, kind, at_tick, at_ms, company_id,
      company_display_name, summary
    )
    SELECT
      m.world_id,
      elem->>'id',
      COALESCE(elem->>'kind', 'lot_accept'),
      COALESCE((elem->>'atTick')::int, 0),
      COALESCE((elem->>'atMs')::bigint, 0),
      COALESCE(elem->>'companyId', ''),
      COALESCE(elem->>'companyDisplayName', ''),
      COALESCE(elem->>'summary', '')
    FROM economy_meta m,
         LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(m.misc_json->'presenceLog') = 'array'
             THEN m.misc_json->'presenceLog'
             ELSE '[]'::jsonb
           END
         ) AS elem
    WHERE elem->>'id' IS NOT NULL AND elem->>'id' <> ''
    ON CONFLICT (world_id, id) DO NOTHING
  `);

  // Strip promoted keys from misc_json (leave {} for future rare leftovers).
  await pool.query(`
    UPDATE economy_meta
    SET misc_json = COALESCE(misc_json, '{}'::jsonb)
      - 'version'
      - 'aircraftPoolCatalogHash'
      - 'clientUpdatePolicy'
      - 'flow'
      - 'internationalLanes'
      - 'portInboundShips'
      - 'tourLotSoftHolds'
      - 'regionalRecovery'
      - 'presenceLog'
    WHERE misc_json IS NOT NULL
  `);
}

export type EconomyMetaLeftoverColumns = {
  economyVersion: number;
  aircraftPoolCatalogHash: string | null;
  forceClientUpdate: boolean;
  minClientVersion: string;
  flowStats: unknown;
};

export function applyEconomyMetaLeftoverColumns(
  world: CareerEconomyWorld,
  cols: EconomyMetaLeftoverColumns,
): void {
  if (cols.economyVersion > 0) {
    (world as { version?: number }).version = cols.economyVersion as 3;
  }
  if (cols.aircraftPoolCatalogHash) {
    world.aircraftPoolCatalogHash = cols.aircraftPoolCatalogHash;
  }
  world.clientUpdatePolicy = parseClientUpdatePolicy({
    forceUpdate: cols.forceClientUpdate,
    minClientVersion: cols.minClientVersion,
  });
  if (cols.flowStats && typeof cols.flowStats === 'object') {
    world.flow = cols.flowStats as EconomyFlowStats;
  }
}

export function economyMetaLeftoverColumnParams(world: CareerEconomyWorld): {
  economyVersion: number;
  aircraftPoolCatalogHash: string | null;
  forceClientUpdate: boolean;
  minClientVersion: string;
  flowStats: string | null;
} {
  const policy = parseClientUpdatePolicy(world.clientUpdatePolicy ?? null);
  return {
    economyVersion:
      typeof world.version === 'number' && Number.isFinite(world.version)
        ? world.version
        : 3,
    aircraftPoolCatalogHash: world.aircraftPoolCatalogHash?.trim() || null,
    forceClientUpdate: policy.forceUpdate,
    minClientVersion: policy.minClientVersion || '0.0.0',
    flowStats: world.flow != null ? jsonParam(world.flow) : null,
  };
}

export async function hydratePgEconomyLeftoverTables(
  pool: pg.Pool | pg.PoolClient,
  world: CareerEconomyWorld,
  worldId: string = LOCAL_WORLD_ID,
): Promise<void> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;

  const laneRes = await pool.query(
    `SELECT id, origin_country_id, dest_country_id, origin_icao, dest_icao,
            capacity_kg_per_day
     FROM international_lanes WHERE world_id = $1 ORDER BY id ASC`,
    [wid],
  );
  if (laneRes.rows.length > 0) {
    world.internationalLanes = laneRes.rows.map((r) => {
      const lane: InternationalLane = {
        id: String(r.id),
        originCountryId: String(r.origin_country_id ?? ''),
        destCountryId: String(r.dest_country_id ?? ''),
        originIcao: String(r.origin_icao ?? ''),
        destIcao: String(r.dest_icao ?? ''),
      };
      const cap = num(r.capacity_kg_per_day, NaN);
      if (Number.isFinite(cap) && cap > 0) lane.capacityKgPerDay = cap;
      return lane;
    });
  }

  const shipRes = await pool.query(
    `SELECT port_id, arrives_at_tick
     FROM port_inbound_ships WHERE world_id = $1 ORDER BY port_id ASC`,
    [wid],
  );
  if (shipRes.rows.length > 0) {
    world.portInboundShips = shipRes.rows.map(
      (r): PortInboundShip => ({
        portId: String(r.port_id),
        arrivesAtTick: num(r.arrives_at_tick),
      }),
    );
  }

  const holdRes = await pool.query(
    `SELECT company_id, tour_id, leg_index, lot_id, kg, expires_at_tick
     FROM tour_lot_soft_holds WHERE world_id = $1
     ORDER BY company_id ASC, tour_id ASC, leg_index ASC`,
    [wid],
  );
  if (holdRes.rows.length > 0) {
    world.tourLotSoftHolds = holdRes.rows.map(
      (r): TourLotSoftHold => ({
        companyId: String(r.company_id),
        tourId: String(r.tour_id),
        legIndex: num(r.leg_index),
        lotId: String(r.lot_id),
        kg: num(r.kg),
        expiresAtTick: num(r.expires_at_tick),
      }),
    );
  }

  const recoveryRes = await pool.query(
    `SELECT region, active, entered_day, low_live_streak, recovered_streak,
            last_eval_day, last_live_pct, last_dead_spoke_share
     FROM regional_recovery WHERE world_id = $1 ORDER BY region ASC`,
    [wid],
  );
  if (recoveryRes.rows.length > 0) {
    const map: Record<string, RegionalRecoveryState> = {};
    for (const r of recoveryRes.rows) {
      const region = String(r.region ?? '').trim();
      if (!region) continue;
      const state: RegionalRecoveryState = {
        active: Boolean(r.active),
        lowLiveStreak: num(r.low_live_streak),
        recoveredStreak: num(r.recovered_streak),
        lastEvalDay: num(r.last_eval_day),
        lastLivePct: num(r.last_live_pct),
        lastDeadSpokeShare: num(r.last_dead_spoke_share),
      };
      if (r.entered_day != null) state.enteredDay = num(r.entered_day);
      map[region] = state;
    }
    world.regionalRecovery = map;
  }

  const presenceRes = await pool.query(
    `SELECT id, kind, at_tick, at_ms, company_id, company_display_name, summary
     FROM presence_events WHERE world_id = $1
     ORDER BY at_tick DESC, at_ms DESC
     LIMIT 30`,
    [wid],
  );
  if (presenceRes.rows.length > 0) {
    world.presenceLog = presenceRes.rows.map(
      (r): PresenceEvent => ({
        id: String(r.id),
        kind: String(r.kind) as PresenceEventKind,
        atTick: num(r.at_tick),
        atMs: num(r.at_ms),
        companyId: String(r.company_id ?? ''),
        companyDisplayName: String(r.company_display_name ?? ''),
        summary: String(r.summary ?? ''),
      }),
    );
  }
}

export async function persistPgEconomyLeftoverTables(
  client: pg.PoolClient,
  world: CareerEconomyWorld,
  worldId: string,
): Promise<void> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;

  await client.query(`DELETE FROM international_lanes WHERE world_id = $1`, [
    wid,
  ]);
  const lanes = world.internationalLanes ?? [];
  if (lanes.length > 0) {
    await insertChunks(
      client,
      `INSERT INTO international_lanes (
         world_id, id, origin_country_id, dest_country_id,
         origin_icao, dest_icao, capacity_kg_per_day
       )`,
      7,
      lanes.map((lane) => [
        wid,
        lane.id,
        lane.originCountryId,
        lane.destCountryId,
        lane.originIcao,
        lane.destIcao,
        lane.capacityKgPerDay ?? null,
      ]),
    );
  }

  await client.query(`DELETE FROM port_inbound_ships WHERE world_id = $1`, [
    wid,
  ]);
  const ships = world.portInboundShips ?? [];
  if (ships.length > 0) {
    await insertChunks(
      client,
      `INSERT INTO port_inbound_ships (world_id, port_id, arrives_at_tick)`,
      3,
      ships.map((s) => [wid, s.portId, sqlNum(s.arrivesAtTick)]),
    );
  }

  await client.query(`DELETE FROM tour_lot_soft_holds WHERE world_id = $1`, [
    wid,
  ]);
  const holds = world.tourLotSoftHolds ?? [];
  if (holds.length > 0) {
    await insertChunks(
      client,
      `INSERT INTO tour_lot_soft_holds (
         world_id, company_id, tour_id, leg_index, lot_id, kg, expires_at_tick
       )`,
      7,
      holds.map((h) => [
        wid,
        h.companyId,
        h.tourId,
        sqlNum(h.legIndex),
        h.lotId,
        sqlNum(h.kg),
        sqlNum(h.expiresAtTick),
      ]),
    );
  }

  await client.query(`DELETE FROM regional_recovery WHERE world_id = $1`, [wid]);
  const recovery = world.regionalRecovery ?? {};
  const recoveryRows = Object.entries(recovery).map(([region, state]) => [
    wid,
    region,
    Boolean(state.active),
    state.enteredDay ?? null,
    sqlNum(state.lowLiveStreak),
    sqlNum(state.recoveredStreak),
    sqlNum(state.lastEvalDay),
    sqlNum(state.lastLivePct),
    sqlNum(state.lastDeadSpokeShare),
  ]);
  if (recoveryRows.length > 0) {
    await insertChunks(
      client,
      `INSERT INTO regional_recovery (
         world_id, region, active, entered_day, low_live_streak, recovered_streak,
         last_eval_day, last_live_pct, last_dead_spoke_share
       )`,
      9,
      recoveryRows,
    );
  }

  await client.query(`DELETE FROM presence_events WHERE world_id = $1`, [wid]);
  const presence = (world.presenceLog ?? []).slice(0, 30);
  if (presence.length > 0) {
    await insertChunks(
      client,
      `INSERT INTO presence_events (
         world_id, id, kind, at_tick, at_ms, company_id,
         company_display_name, summary
       )`,
      8,
      presence.map((e) => [
        wid,
        e.id,
        e.kind,
        sqlNum(e.atTick),
        Math.trunc(sqlNum(e.atMs)),
        e.companyId,
        e.companyDisplayName ?? '',
        e.summary ?? '',
      ]),
    );
  }
}
