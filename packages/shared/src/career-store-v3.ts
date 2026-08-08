/**
 * Career store schema v3 — tabular hot state (lots SoT, company, world live).
 * Used only by SqliteCareerStore; simulation stays in-memory.
 */

import type { DatabaseSync } from 'node:sqlite';
import { countryIdFromRegion } from './career-partition.js';
import { normalizeCareerLedger } from './career-ledger.js';
import type {
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerLedgerKind,
  CareerMissionsState,
  CommodityId,
  EconomyEvent,
  FreighterClassId,
  InboundPending,
  MissionIntent,
  MissionStatus,
  NpcFlight,
  PlayerAircraft,
  PlayerAircraftStatus,
  ShipmentLot,
  ShipmentLotStatus,
} from './types/career-economy.js';

export const LOCAL_COMPANY_ID = 'local';

export type SqliteDb = DatabaseSync;

/** node:sqlite rejects `undefined` binds — use null. */
function sqlVal(v: unknown): string | number | bigint | null | Uint8Array {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return String(v);
}

function columnExists(db: SqliteDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableCount(db: SqliteDb, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
    | { n: number }
    | undefined;
  return Number(row?.n ?? 0);
}

export function ensureV3Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      home_hub_icao TEXT NOT NULL DEFAULT '',
      home_country_id TEXT NOT NULL DEFAULT '',
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_state (
      company_id TEXT PRIMARY KEY NOT NULL,
      wallet_usd REAL NOT NULL DEFAULT 0,
      pilot_name TEXT NOT NULL DEFAULT '',
      pilot_icao TEXT NOT NULL DEFAULT '',
      hub_selected INTEGER NOT NULL DEFAULT 0,
      company_credit_json TEXT,
      cargo_ops_json TEXT,
      aircraft_market_json TEXT,
      aircraft_market_day INTEGER,
      aircraft_market_demand_day INTEGER,
      airframe_perf_json TEXT,
      player_fbos_json TEXT,
      company_crew_json TEXT,
      active_bush_trip_json TEXT,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS fleet_aircraft (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      aircraft_class_id TEXT NOT NULL,
      airframe_type_id TEXT,
      label TEXT NOT NULL,
      location_icao TEXT NOT NULL,
      fuel_kg REAL NOT NULL,
      fuel_capacity_kg REAL NOT NULL,
      status TEXT NOT NULL,
      assigned_mission_id TEXT,
      ownership TEXT,
      lease_json TEXT,
      payload_json TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS fleet_company_status_idx
      ON fleet_aircraft(company_id, status);
    CREATE INDEX IF NOT EXISTS fleet_location_idx
      ON fleet_aircraft(location_icao);

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      status TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      aircraft_id TEXT,
      commodity_id TEXT NOT NULL,
      cargo_kg REAL NOT NULL,
      pay_usd REAL NOT NULL,
      accepted_at_tick INTEGER NOT NULL,
      deadline_tick INTEGER NOT NULL,
      departed_at_tick INTEGER,
      settled_at_tick INTEGER,
      urgency TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload_json TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS missions_company_status_idx
      ON missions(company_id, status);
    CREATE INDEX IF NOT EXISTS missions_od_idx
      ON missions(origin_icao, dest_icao);

    CREATE TABLE IF NOT EXISTS inbound_pending (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      cargo_kg REAL NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      source TEXT NOT NULL,
      origin_country_id TEXT,
      dest_country_id TEXT,
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS inbound_dest_idx ON inbound_pending(dest_icao);

    CREATE TABLE IF NOT EXISTS npc_flights (
      id TEXT PRIMARY KEY NOT NULL,
      npc_id TEXT NOT NULL,
      lot_id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      cargo_kg REAL NOT NULL,
      pay_usd REAL NOT NULL,
      aircraft_class_id TEXT NOT NULL,
      departed_at_tick INTEGER NOT NULL,
      arrives_at_tick INTEGER NOT NULL,
      departed_at_ms INTEGER NOT NULL,
      arrives_at_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      origin_country_id TEXT,
      dest_country_id TEXT,
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS npc_flights_status_idx ON npc_flights(status);

    CREATE TABLE IF NOT EXISTS economy_events (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      region TEXT NOT NULL,
      commodity_id TEXT,
      starts_at_tick INTEGER NOT NULL,
      ends_at_tick INTEGER NOT NULL,
      label TEXT NOT NULL,
      country_id TEXT,
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS economy_events_ends_idx ON economy_events(ends_at_tick);
  `);

  if (!columnExists(db, 'lots', 'origin_country_id')) {
    db.exec(`ALTER TABLE lots ADD COLUMN origin_country_id TEXT`);
  }
  if (!columnExists(db, 'lots', 'dest_country_id')) {
    db.exec(`ALTER TABLE lots ADD COLUMN dest_country_id TEXT`);
  }
  if (!columnExists(db, 'ledger', 'company_id')) {
    db.exec(`ALTER TABLE ledger ADD COLUMN company_id TEXT NOT NULL DEFAULT 'local'`);
  }
  if (!columnExists(db, 'company_state', 'player_fbos_json')) {
    db.exec(`ALTER TABLE company_state ADD COLUMN player_fbos_json TEXT`);
  }
  if (!columnExists(db, 'company_state', 'company_crew_json')) {
    db.exec(`ALTER TABLE company_state ADD COLUMN company_crew_json TEXT`);
  }
  if (!columnExists(db, 'company_state', 'active_bush_trip_json')) {
    db.exec(`ALTER TABLE company_state ADD COLUMN active_bush_trip_json TEXT`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS ledger_company_tick_idx ON ledger(company_id, at_tick);
  `);
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

// ─── Lots SoT ────────────────────────────────────────────────────────────────

export function countLotsRows(db: SqliteDb): number {
  return tableCount(db, 'lots');
}

export function readLotsRows(db: SqliteDb): ShipmentLot[] {
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

/** Upsert by id; delete rows not present in `lots`. Caller wraps in a transaction. */
export function upsertLots(
  db: SqliteDb,
  lots: ShipmentLot[],
  airports?: CareerEconomyWorld['airports'],
): void {
  const countries = icaoCountryMap(airports);
  const ids = lots.map((l) => l.id);
  if (ids.length === 0) {
    db.prepare(`DELETE FROM lots`).run();
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM lots WHERE id NOT IN (${placeholders})`).run(...ids);

  const upsert = db.prepare(
    `INSERT INTO lots (
       id, commodity_id, origin_icao, dest_icao, quantity_kg, reserved_kg,
       created_at_tick, expires_at_tick, pay_usd, base_pay_usd, urgency, reason, status,
       origin_country_id, dest_country_id
     ) VALUES (
       @id, @commodity_id, @origin_icao, @dest_icao, @quantity_kg, @reserved_kg,
       @created_at_tick, @expires_at_tick, @pay_usd, @base_pay_usd, @urgency, @reason, @status,
       @origin_country_id, @dest_country_id
     )
     ON CONFLICT(id) DO UPDATE SET
       commodity_id = excluded.commodity_id,
       origin_icao = excluded.origin_icao,
       dest_icao = excluded.dest_icao,
       quantity_kg = excluded.quantity_kg,
       reserved_kg = excluded.reserved_kg,
       created_at_tick = excluded.created_at_tick,
       expires_at_tick = excluded.expires_at_tick,
       pay_usd = excluded.pay_usd,
       base_pay_usd = excluded.base_pay_usd,
       urgency = excluded.urgency,
       reason = excluded.reason,
       status = excluded.status,
       origin_country_id = excluded.origin_country_id,
       dest_country_id = excluded.dest_country_id`,
  );
  for (const lot of lots) {
    upsert.run({
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
      origin_country_id: countryForIcao(countries, lot.originIcao) || null,
      dest_country_id: countryForIcao(countries, lot.destIcao) || null,
    });
  }
}

export function fillLotCountryIds(db: SqliteDb, airports: CareerEconomyWorld['airports']): void {
  const countries = icaoCountryMap(airports);
  const rows = db
    .prepare(
      `SELECT id, origin_icao, dest_icao, origin_country_id, dest_country_id FROM lots`,
    )
    .all() as Array<{
    id: string;
    origin_icao: string;
    dest_icao: string;
    origin_country_id: string | null;
    dest_country_id: string | null;
  }>;
  const upd = db.prepare(
    `UPDATE lots SET origin_country_id = ?, dest_country_id = ? WHERE id = ?`,
  );
  for (const r of rows) {
    const oc = countryForIcao(countries, r.origin_icao);
    const dc = countryForIcao(countries, r.dest_icao);
    if (
      (r.origin_country_id && r.dest_country_id) ||
      (!oc && !dc)
    ) {
      if (r.origin_country_id && r.dest_country_id) continue;
    }
    if (!r.origin_country_id || !r.dest_country_id) {
      upd.run(oc || r.origin_country_id || null, dc || r.dest_country_id || null, r.id);
    }
  }
}

/** Drop hot arrays that live in tables from the economy blob remainder. */
export function stripEconomyHotArrays(
  world: CareerEconomyWorld,
): Record<string, unknown> {
  const {
    lots: _lots,
    inboundPending: _inbound,
    npcFlights: _npcFlights,
    events: _events,
    ...rest
  } = world;
  return {
    ...rest,
    lots: [],
    inboundPending: [],
    npcFlights: [],
    events: [],
  };
}

export function economyBlobHasHotArrays(raw: Record<string, unknown>): boolean {
  const lots = Array.isArray(raw.lots) ? raw.lots.length : 0;
  const inbound = Array.isArray(raw.inboundPending) ? raw.inboundPending.length : 0;
  const npc = Array.isArray(raw.npcFlights) ? raw.npcFlights.length : 0;
  const events = Array.isArray(raw.events) ? raw.events.length : 0;
  return lots > 0 || inbound > 0 || npc > 0 || events > 0;
}

// ─── World live overlays ─────────────────────────────────────────────────────

export function readInboundPending(db: SqliteDb): InboundPending[] {
  const rows = db
    .prepare(
      `SELECT id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
              expires_at_tick, source, payload_json
       FROM inbound_pending ORDER BY expires_at_tick ASC, id ASC`,
    )
    .all() as Array<{
    id: string;
    mission_id: string;
    origin_icao: string;
    dest_icao: string;
    commodity_id: string;
    cargo_kg: number;
    expires_at_tick: number;
    source: string;
    payload_json: string | null;
  }>;
  return rows.map((r) => {
    const base: InboundPending = {
      id: r.id,
      missionId: r.mission_id,
      originIcao: r.origin_icao,
      destIcao: r.dest_icao,
      commodityId: r.commodity_id as CommodityId,
      cargoKg: r.cargo_kg,
      expiresAtTick: r.expires_at_tick,
      source: r.source === 'player' ? 'player' : 'player',
    };
    if (r.payload_json) {
      try {
        return { ...JSON.parse(r.payload_json), ...base } as InboundPending;
      } catch {
        /* ignore */
      }
    }
    return base;
  });
}

export function replaceInboundPending(
  db: SqliteDb,
  rows: InboundPending[],
  airports?: CareerEconomyWorld['airports'],
): void {
  const countries = icaoCountryMap(airports);
  db.prepare(`DELETE FROM inbound_pending`).run();
  const ins = db.prepare(
    `INSERT INTO inbound_pending (
       id, mission_id, origin_icao, dest_icao, commodity_id, cargo_kg,
       expires_at_tick, source, origin_country_id, dest_country_id, payload_json
     ) VALUES (
       @id, @mission_id, @origin_icao, @dest_icao, @commodity_id, @cargo_kg,
       @expires_at_tick, @source, @origin_country_id, @dest_country_id, @payload_json
     )`,
  );
  for (const row of rows) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      id,
      mission_id: missionId,
      origin_icao: originIcao,
      dest_icao: destIcao,
      commodity_id: commodityId,
      cargo_kg: cargoKg,
      expires_at_tick: expiresAtTick,
      source,
      origin_country_id: countryForIcao(countries, originIcao) || null,
      dest_country_id: countryForIcao(countries, destIcao) || null,
      payload_json: extra,
    });
  }
}

export function readNpcFlights(db: SqliteDb): NpcFlight[] {
  const rows = db
    .prepare(
      `SELECT id, npc_id, lot_id, origin_icao, dest_icao, commodity_id, cargo_kg,
              pay_usd, aircraft_class_id, departed_at_tick, arrives_at_tick,
              departed_at_ms, arrives_at_ms, status, payload_json
       FROM npc_flights ORDER BY departed_at_tick ASC, id ASC`,
    )
    .all() as Array<{
    id: string;
    npc_id: string;
    lot_id: string;
    origin_icao: string;
    dest_icao: string;
    commodity_id: string;
    cargo_kg: number;
    pay_usd: number;
    aircraft_class_id: string;
    departed_at_tick: number;
    arrives_at_tick: number;
    departed_at_ms: number;
    arrives_at_ms: number;
    status: string;
    payload_json: string | null;
  }>;
  return rows.map((r) => {
    const status: NpcFlight['status'] =
      r.status === 'completed'
        ? 'completed'
        : r.status === 'awaiting_pilot'
          ? 'awaiting_pilot'
          : 'in_flight';
    const base: NpcFlight = {
      id: r.id,
      npcId: r.npc_id,
      lotId: r.lot_id,
      originIcao: r.origin_icao,
      destIcao: r.dest_icao,
      commodityId: r.commodity_id as CommodityId,
      cargoKg: r.cargo_kg,
      payUsd: r.pay_usd,
      aircraftClassId: r.aircraft_class_id as FreighterClassId,
      departedAtTick: r.departed_at_tick,
      arrivesAtTick: r.arrives_at_tick,
      departedAtMs: r.departed_at_ms,
      arrivesAtMs: r.arrives_at_ms,
      status,
    };
    if (r.payload_json) {
      try {
        const extra = JSON.parse(r.payload_json) as Partial<NpcFlight>;
        // Column status is canonical — do not let payload_json overwrite it.
        const { status: _ignored, ...payloadRest } = extra;
        return { ...base, ...payloadRest, status };
      } catch {
        /* ignore */
      }
    }
    return base;
  });
}

export function replaceNpcFlights(
  db: SqliteDb,
  flights: NpcFlight[],
  airports?: CareerEconomyWorld['airports'],
): void {
  const countries = icaoCountryMap(airports);
  db.prepare(`DELETE FROM npc_flights`).run();
  const ins = db.prepare(
    `INSERT INTO npc_flights (
       id, npc_id, lot_id, origin_icao, dest_icao, commodity_id, cargo_kg, pay_usd,
       aircraft_class_id, departed_at_tick, arrives_at_tick, departed_at_ms, arrives_at_ms,
       status, origin_country_id, dest_country_id, payload_json
     ) VALUES (
       @id, @npc_id, @lot_id, @origin_icao, @dest_icao, @commodity_id, @cargo_kg, @pay_usd,
       @aircraft_class_id, @departed_at_tick, @arrives_at_tick, @departed_at_ms, @arrives_at_ms,
       @status, @origin_country_id, @dest_country_id, @payload_json
     )`,
  );
  for (const f of flights) {
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
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      id,
      npc_id: npcId,
      lot_id: lotId,
      origin_icao: originIcao,
      dest_icao: destIcao,
      commodity_id: commodityId,
      cargo_kg: cargoKg,
      pay_usd: payUsd,
      aircraft_class_id: aircraftClassId,
      departed_at_tick: departedAtTick,
      arrives_at_tick: arrivesAtTick,
      departed_at_ms: departedAtMs,
      arrives_at_ms: arrivesAtMs,
      status,
      origin_country_id: countryForIcao(countries, originIcao) || null,
      dest_country_id: countryForIcao(countries, destIcao) || null,
      payload_json: extra,
    });
  }
}

export function readEconomyEvents(db: SqliteDb): EconomyEvent[] {
  const rows = db
    .prepare(
      `SELECT id, kind, region, commodity_id, starts_at_tick, ends_at_tick, label, payload_json
       FROM economy_events ORDER BY starts_at_tick ASC, id ASC`,
    )
    .all() as Array<{
    id: string;
    kind: string;
    region: string;
    commodity_id: string | null;
    starts_at_tick: number;
    ends_at_tick: number;
    label: string;
    payload_json: string | null;
  }>;
  return rows.map((r) => {
    const base: EconomyEvent = {
      id: r.id,
      kind: r.kind as EconomyEvent['kind'],
      region: r.region,
      startsAtTick: r.starts_at_tick,
      endsAtTick: r.ends_at_tick,
      label: r.label,
    };
    if (r.commodity_id) base.commodityId = r.commodity_id as CommodityId;
    if (r.payload_json) {
      try {
        const extra = JSON.parse(r.payload_json) as Partial<EconomyEvent>;
        return { ...extra, ...base };
      } catch {
        /* ignore */
      }
    }
    return base;
  });
}

export function replaceEconomyEvents(db: SqliteDb, events: EconomyEvent[]): void {
  db.prepare(`DELETE FROM economy_events`).run();
  const ins = db.prepare(
    `INSERT INTO economy_events (
       id, kind, region, commodity_id, starts_at_tick, ends_at_tick, label, country_id, payload_json
     ) VALUES (
       @id, @kind, @region, @commodity_id, @starts_at_tick, @ends_at_tick, @label, @country_id, @payload_json
     )`,
  );
  for (const e of events) {
    const { id, kind, region, commodityId, startsAtTick, endsAtTick, label, ...rest } = e;
    const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
    ins.run({
      id,
      kind,
      region,
      commodity_id: commodityId ?? null,
      starts_at_tick: startsAtTick,
      ends_at_tick: endsAtTick,
      label,
      country_id: countryIdFromRegion(region) || null,
      payload_json: extra,
    });
  }
}

/** Prefer tables for hot arrays once schema ≥ 3 (always call after migrate). */
export function hydrateWorldFromTables(db: SqliteDb, world: CareerEconomyWorld): void {
  world.lots = readLotsRows(db);
  world.inboundPending = readInboundPending(db);
  world.npcFlights = readNpcFlights(db);
  world.events = readEconomyEvents(db);
}

export function persistWorldLiveTables(db: SqliteDb, world: CareerEconomyWorld): void {
  upsertLots(db, world.lots ?? [], world.airports);
  replaceInboundPending(db, world.inboundPending ?? [], world.airports);
  replaceNpcFlights(db, world.npcFlights ?? [], world.airports);
  replaceEconomyEvents(db, world.events ?? []);
}

// ─── Company / fleet / missions ──────────────────────────────────────────────

export function ensureLocalCompany(
  db: SqliteDb,
  opts?: {
    displayName?: string;
    homeHubIcao?: string;
    homeCountryId?: string;
  },
): void {
  const now = Date.now();
  const existing = db.prepare(`SELECT id FROM companies WHERE id = ?`).get(LOCAL_COMPANY_ID) as
    | { id: string }
    | undefined;
  if (existing) {
    if (opts?.displayName || opts?.homeHubIcao || opts?.homeCountryId) {
      db.prepare(
        `UPDATE companies SET
           display_name = COALESCE(NULLIF(?, ''), display_name),
           home_hub_icao = COALESCE(NULLIF(?, ''), home_hub_icao),
           home_country_id = COALESCE(NULLIF(?, ''), home_country_id)
         WHERE id = ?`,
      ).run(
        opts.displayName ?? '',
        opts.homeHubIcao ?? '',
        opts.homeCountryId ?? '',
        LOCAL_COMPANY_ID,
      );
    }
    return;
  }
  db.prepare(
    `INSERT INTO companies (id, display_name, home_hub_icao, home_country_id, created_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    LOCAL_COMPANY_ID,
    opts?.displayName ?? '',
    opts?.homeHubIcao ?? '',
    opts?.homeCountryId ?? '',
    now,
  );
}

function missionCoreAndPayload(m: MissionIntent): {
  core: Record<string, unknown>;
  payload: string | null;
} {
  const {
    id,
    status,
    originIcao,
    destIcao,
    aircraftId,
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

function fleetCoreAndPayload(a: PlayerAircraft): {
  core: Record<string, unknown>;
  payload: string | null;
  leaseJson: string | null;
} {
  const {
    id,
    aircraftClassId,
    airframeTypeId,
    label,
    locationIcao,
    fuelKg,
    fuelCapacityKg,
    status,
    assignedMissionId,
    ownership,
    lease,
    ...rest
  } = a;
  return {
    core: {
      id,
      aircraftClassId,
      airframeTypeId,
      label,
      locationIcao,
      fuelKg,
      fuelCapacityKg,
      status,
      assignedMissionId,
      ownership,
    },
    leaseJson: lease ? JSON.stringify(lease) : null,
    payload: Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
  };
}

export function replaceFleetAircraft(
  db: SqliteDb,
  companyId: string,
  fleet: PlayerAircraft[],
): void {
  db.prepare(`DELETE FROM fleet_aircraft WHERE company_id = ?`).run(companyId);
  const ins = db.prepare(
    `INSERT INTO fleet_aircraft (
       id, company_id, aircraft_class_id, airframe_type_id, label, location_icao,
       fuel_kg, fuel_capacity_kg, status, assigned_mission_id, ownership, lease_json, payload_json
     ) VALUES (
       @id, @company_id, @aircraft_class_id, @airframe_type_id, @label, @location_icao,
       @fuel_kg, @fuel_capacity_kg, @status, @assigned_mission_id, @ownership, @lease_json, @payload_json
     )`,
  );
  for (const a of fleet) {
    const { core, payload, leaseJson } = fleetCoreAndPayload(a);
    ins.run({
      id: sqlVal(core.id),
      company_id: sqlVal(companyId),
      aircraft_class_id: sqlVal(core.aircraftClassId),
      airframe_type_id: sqlVal(core.airframeTypeId),
      label: sqlVal(core.label) ?? '',
      location_icao: sqlVal(core.locationIcao) ?? '',
      fuel_kg: sqlVal(core.fuelKg) ?? 0,
      fuel_capacity_kg: sqlVal(core.fuelCapacityKg) ?? 0,
      status: sqlVal(core.status),
      assigned_mission_id: sqlVal(core.assignedMissionId),
      ownership: sqlVal(core.ownership),
      lease_json: sqlVal(leaseJson),
      payload_json: sqlVal(payload),
    });
  }
}

export function readFleetAircraft(db: SqliteDb, companyId: string): PlayerAircraft[] {
  const rows = db
    .prepare(
      `SELECT id, aircraft_class_id, airframe_type_id, label, location_icao,
              fuel_kg, fuel_capacity_kg, status, assigned_mission_id, ownership,
              lease_json, payload_json
       FROM fleet_aircraft WHERE company_id = ? ORDER BY id ASC`,
    )
    .all(companyId) as Array<{
    id: string;
    aircraft_class_id: string;
    airframe_type_id: string | null;
    label: string;
    location_icao: string;
    fuel_kg: number;
    fuel_capacity_kg: number;
    status: string;
    assigned_mission_id: string | null;
    ownership: string | null;
    lease_json: string | null;
    payload_json: string | null;
  }>;
  return rows.map((r) => {
    let extra: Partial<PlayerAircraft> = {};
    if (r.payload_json) {
      try {
        extra = JSON.parse(r.payload_json) as Partial<PlayerAircraft>;
      } catch {
        /* ignore */
      }
    }
    const aircraft: PlayerAircraft = {
      ...extra,
      id: r.id,
      aircraftClassId: r.aircraft_class_id as FreighterClassId,
      label: r.label,
      locationIcao: r.location_icao,
      fuelKg: r.fuel_kg,
      fuelCapacityKg: r.fuel_capacity_kg,
      status: r.status as PlayerAircraftStatus,
    };
    if (r.airframe_type_id) aircraft.airframeTypeId = r.airframe_type_id;
    if (r.assigned_mission_id) aircraft.assignedMissionId = r.assigned_mission_id;
    if (r.ownership === 'owned' || r.ownership === 'leased') {
      aircraft.ownership = r.ownership;
    }
    if (r.lease_json) {
      try {
        aircraft.lease = JSON.parse(r.lease_json);
      } catch {
        /* ignore */
      }
    }
    return aircraft;
  });
}

export function replaceMissionsTable(
  db: SqliteDb,
  companyId: string,
  missions: MissionIntent[],
): void {
  db.prepare(`DELETE FROM missions WHERE company_id = ?`).run(companyId);
  const ins = db.prepare(
    `INSERT INTO missions (
       id, company_id, status, origin_icao, dest_icao, aircraft_id, commodity_id,
       cargo_kg, pay_usd, accepted_at_tick, deadline_tick, departed_at_tick,
       settled_at_tick, urgency, reason, payload_json
     ) VALUES (
       @id, @company_id, @status, @origin_icao, @dest_icao, @aircraft_id, @commodity_id,
       @cargo_kg, @pay_usd, @accepted_at_tick, @deadline_tick, @departed_at_tick,
       @settled_at_tick, @urgency, @reason, @payload_json
     )`,
  );
  for (const m of missions) {
    const { core, payload } = missionCoreAndPayload(m);
    ins.run({
      id: sqlVal(core.id),
      company_id: sqlVal(companyId),
      status: sqlVal(core.status),
      origin_icao: sqlVal(core.originIcao),
      dest_icao: sqlVal(core.destIcao),
      aircraft_id: sqlVal(core.aircraftId),
      commodity_id: sqlVal(core.commodityId),
      cargo_kg: sqlVal(core.cargoKg) ?? 0,
      pay_usd: sqlVal(core.payUsd) ?? 0,
      accepted_at_tick: sqlVal(core.acceptedAtTick) ?? 0,
      deadline_tick: sqlVal(core.deadlineTick) ?? 0,
      departed_at_tick: sqlVal(core.departedAtTick),
      settled_at_tick: sqlVal(core.settledAtTick),
      urgency: sqlVal(core.urgency) ?? 'normal',
      reason: sqlVal(core.reason) ?? '',
      payload_json: sqlVal(payload),
    });
  }
}

export function readMissionsTable(db: SqliteDb, companyId: string): MissionIntent[] {
  const rows = db
    .prepare(
      `SELECT id, status, origin_icao, dest_icao, aircraft_id, commodity_id, cargo_kg,
              pay_usd, accepted_at_tick, deadline_tick, departed_at_tick, settled_at_tick,
              urgency, reason, payload_json
       FROM missions WHERE company_id = ? ORDER BY accepted_at_tick ASC, id ASC`,
    )
    .all(companyId) as Array<{
    id: string;
    status: string;
    origin_icao: string;
    dest_icao: string;
    aircraft_id: string | null;
    commodity_id: string;
    cargo_kg: number;
    pay_usd: number;
    accepted_at_tick: number;
    deadline_tick: number;
    departed_at_tick: number | null;
    settled_at_tick: number | null;
    urgency: string;
    reason: string;
    payload_json: string | null;
  }>;
  return rows.map((r) => {
    let extra: Partial<MissionIntent> = {};
    if (r.payload_json) {
      try {
        extra = JSON.parse(r.payload_json) as Partial<MissionIntent>;
      } catch {
        /* ignore */
      }
    }
    const mission = {
      ...extra,
      id: r.id,
      status: r.status as MissionStatus,
      originIcao: r.origin_icao,
      destIcao: r.dest_icao,
      commodityId: r.commodity_id as CommodityId,
      cargoKg: r.cargo_kg,
      payUsd: r.pay_usd,
      acceptedAtTick: r.accepted_at_tick,
      deadlineTick: r.deadline_tick,
      urgency: r.urgency === 'urgent' ? 'urgent' : 'normal',
      reason: r.reason,
    } as MissionIntent;
    if (r.aircraft_id) mission.aircraftId = r.aircraft_id;
    if (typeof r.departed_at_tick === 'number') mission.departedAtTick = r.departed_at_tick;
    if (typeof r.settled_at_tick === 'number') mission.settledAtTick = r.settled_at_tick;
    return mission;
  });
}

export function upsertCompanyState(db: SqliteDb, state: CareerMissionsState): void {
  const now = Date.now();
  ensureLocalCompany(db, {
    displayName: state.pilotName || '',
    homeHubIcao: state.homeHubIcao || '',
  });
  db.prepare(
    `INSERT INTO company_state (
       company_id, wallet_usd, pilot_name, pilot_icao, hub_selected,
       company_credit_json, cargo_ops_json, aircraft_market_json,
       aircraft_market_day, aircraft_market_demand_day, airframe_perf_json,
       player_fbos_json, company_crew_json, active_bush_trip_json, updated_at_ms
     ) VALUES (
       @company_id, @wallet_usd, @pilot_name, @pilot_icao, @hub_selected,
       @company_credit_json, @cargo_ops_json, @aircraft_market_json,
       @aircraft_market_day, @aircraft_market_demand_day, @airframe_perf_json,
       @player_fbos_json, @company_crew_json, @active_bush_trip_json, @updated_at_ms
     )
     ON CONFLICT(company_id) DO UPDATE SET
       wallet_usd = excluded.wallet_usd,
       pilot_name = excluded.pilot_name,
       pilot_icao = excluded.pilot_icao,
       hub_selected = excluded.hub_selected,
       company_credit_json = excluded.company_credit_json,
       cargo_ops_json = excluded.cargo_ops_json,
       aircraft_market_json = excluded.aircraft_market_json,
       aircraft_market_day = excluded.aircraft_market_day,
       aircraft_market_demand_day = excluded.aircraft_market_demand_day,
       airframe_perf_json = excluded.airframe_perf_json,
       player_fbos_json = excluded.player_fbos_json,
       company_crew_json = COALESCE(
         excluded.company_crew_json,
         company_state.company_crew_json
       ),
       active_bush_trip_json = excluded.active_bush_trip_json,
       updated_at_ms = excluded.updated_at_ms`,
  ).run({
    company_id: LOCAL_COMPANY_ID,
    wallet_usd: sqlVal(state.walletUsd) ?? 0,
    pilot_name: sqlVal(state.pilotName) ?? '',
    pilot_icao: sqlVal(state.pilotIcao) ?? '',
    hub_selected: state.hubSelected ? 1 : 0,
    company_credit_json: state.companyCredit
      ? JSON.stringify(state.companyCredit)
      : null,
    cargo_ops_json: state.cargoOps ? JSON.stringify(state.cargoOps) : null,
    aircraft_market_json: state.aircraftMarket
      ? JSON.stringify(state.aircraftMarket)
      : null,
    aircraft_market_day: sqlVal(state.aircraftMarketDay),
    aircraft_market_demand_day: sqlVal(state.aircraftMarketDemandDay),
    airframe_perf_json: state.airframePerfOverrides
      ? JSON.stringify(state.airframePerfOverrides)
      : null,
    player_fbos_json: state.playerFbos
      ? JSON.stringify(state.playerFbos)
      : null,
    // null + COALESCE keeps prior roster when a write omits companyCrew.
    company_crew_json: state.companyCrew
      ? JSON.stringify(state.companyCrew)
      : null,
    active_bush_trip_json: state.activeBushTrip
      ? JSON.stringify(state.activeBushTrip)
      : null,
    updated_at_ms: now,
  });
}

export function readCompanyStateScalars(
  db: SqliteDb,
  companyId: string,
): Partial<CareerMissionsState> | null {
  const row = db
    .prepare(
      `SELECT wallet_usd, pilot_name, pilot_icao, hub_selected, company_credit_json,
              cargo_ops_json, aircraft_market_json, aircraft_market_day,
              aircraft_market_demand_day, airframe_perf_json, player_fbos_json,
              company_crew_json, active_bush_trip_json
       FROM company_state WHERE company_id = ?`,
    )
    .get(companyId) as
    | {
        wallet_usd: number;
        pilot_name: string;
        pilot_icao: string;
        hub_selected: number;
        company_credit_json: string | null;
        cargo_ops_json: string | null;
        aircraft_market_json: string | null;
        aircraft_market_day: number | null;
        aircraft_market_demand_day: number | null;
        airframe_perf_json: string | null;
        player_fbos_json: string | null;
        company_crew_json: string | null;
        active_bush_trip_json: string | null;
      }
    | undefined;
  if (!row) return null;
  const out: Partial<CareerMissionsState> = {
    walletUsd: row.wallet_usd,
    pilotName: row.pilot_name,
    pilotIcao: row.pilot_icao || undefined,
    hubSelected: Boolean(row.hub_selected),
  };
  if (row.company_credit_json) {
    try {
      out.companyCredit = JSON.parse(row.company_credit_json);
    } catch {
      /* ignore */
    }
  }
  if (row.cargo_ops_json) {
    try {
      out.cargoOps = JSON.parse(row.cargo_ops_json);
    } catch {
      /* ignore */
    }
  }
  if (row.aircraft_market_json) {
    try {
      out.aircraftMarket = JSON.parse(row.aircraft_market_json);
    } catch {
      /* ignore */
    }
  }
  if (typeof row.aircraft_market_day === 'number') {
    out.aircraftMarketDay = row.aircraft_market_day;
  }
  if (typeof row.aircraft_market_demand_day === 'number') {
    out.aircraftMarketDemandDay = row.aircraft_market_demand_day;
  }
  if (row.airframe_perf_json) {
    try {
      out.airframePerfOverrides = JSON.parse(row.airframe_perf_json);
    } catch {
      /* ignore */
    }
  }
  if (row.player_fbos_json) {
    try {
      out.playerFbos = JSON.parse(row.player_fbos_json);
    } catch {
      /* ignore */
    }
  }
  if (row.company_crew_json) {
    try {
      out.companyCrew = JSON.parse(row.company_crew_json);
    } catch {
      /* ignore */
    }
  }
  if (row.active_bush_trip_json) {
    try {
      out.activeBushTrip = JSON.parse(row.active_bush_trip_json);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Thin missions blob stub after company tables are SoT. */
export function missionsBlobStub(state: CareerMissionsState): Record<string, unknown> {
  return {
    version: 2,
    walletUsd: state.walletUsd,
    missions: [],
    fleet: [],
    hubSelected: state.hubSelected,
    pilotName: state.pilotName,
    homeHubIcao: state.homeHubIcao,
    pilotIcao: state.pilotIcao,
    ledger: [],
  };
}

export function companyTablesPopulated(db: SqliteDb): boolean {
  return tableCount(db, 'company_state') > 0;
}

export function persistCompanyTables(db: SqliteDb, state: CareerMissionsState): void {
  upsertCompanyState(db, state);
  replaceFleetAircraft(db, LOCAL_COMPANY_ID, state.fleet ?? []);
  replaceMissionsTable(db, LOCAL_COMPANY_ID, state.missions ?? []);
}

export function assembleMissionsFromTables(
  db: SqliteDb,
  blobFallback: CareerMissionsState,
): CareerMissionsState {
  const scalars = readCompanyStateScalars(db, LOCAL_COMPANY_ID);
  const ledgerRows = readLedgerRowsV3(db);
  const ledger =
    ledgerRows.length > 0 ? ledgerRows : (blobFallback.ledger ?? []);

  // When company_state exists, tables are SoT (even if fleet/missions empty).
  if (scalars) {
    const merged: CareerMissionsState = {
      ...blobFallback,
      ...scalars,
      fleet: readFleetAircraft(db, LOCAL_COMPANY_ID),
      missions: readMissionsTable(db, LOCAL_COMPANY_ID),
      ledger,
    };
    const company = db
      .prepare(`SELECT home_hub_icao, display_name FROM companies WHERE id = ?`)
      .get(LOCAL_COMPANY_ID) as
      | { home_hub_icao: string; display_name: string }
      | undefined;
    if (company?.home_hub_icao) merged.homeHubIcao = company.home_hub_icao;
    if (company?.display_name && !merged.pilotName) {
      merged.pilotName = company.display_name;
    }
    return merged;
  }

  return {
    ...blobFallback,
    ledger,
  };
}

export function readLedgerRowsV3(db: SqliteDb): CareerLedgerEntry[] {
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

export function replaceLedgerV3(db: SqliteDb, entries: CareerLedgerEntry[]): void {
  db.prepare(`DELETE FROM ledger`).run();
  const ins = db.prepare(
    `INSERT INTO ledger (
       id, at_tick, day_index, amount_usd, kind, note, aircraft_id, mission_id, icao, company_id
     ) VALUES (
       @id, @at_tick, @day_index, @amount_usd, @kind, @note, @aircraft_id, @mission_id, @icao, @company_id
     )`,
  );
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
      company_id: LOCAL_COMPANY_ID,
    });
  }
}

/**
 * Idempotent 2→3 backfill from economy/missions blobs into new tables,
 * then rewrite blobs without hot arrays.
 */
export function migrateV2toV3IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV3Ddl(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 3) {
    ensureLocalCompany(db);
    return;
  }

  ensureLocalCompany(db);

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

  const missRow = db.prepare(`SELECT json FROM missions_json WHERE id = 1`).get() as
    | { json: string }
    | undefined;
  let missions: CareerMissionsState | null = null;
  if (missRow) {
    try {
      missions = JSON.parse(missRow.json) as CareerMissionsState;
    } catch {
      missions = null;
    }
  }

  if (missions) {
    ensureLocalCompany(db, {
      displayName: missions.pilotName || '',
      homeHubIcao: missions.homeHubIcao || '',
      homeCountryId: economy?.homeCountryId,
    });
    if (!companyTablesPopulated(db)) {
      upsertCompanyState(db, missions);
    }
    if (tableCount(db, 'fleet_aircraft') === 0 && (missions.fleet?.length ?? 0) > 0) {
      replaceFleetAircraft(db, LOCAL_COMPANY_ID, missions.fleet);
    }
    if (tableCount(db, 'missions') === 0 && (missions.missions?.length ?? 0) > 0) {
      replaceMissionsTable(db, LOCAL_COMPANY_ID, missions.missions);
    }
  } else {
    // Still ensure company_state row exists for SP.
    if (!companyTablesPopulated(db)) {
      upsertCompanyState(db, {
        version: 2,
        walletUsd: 0,
        missions: [],
        fleet: [],
        hubSelected: false,
        pilotName: '',
        homeHubIcao: '',
      });
    }
  }

  if (economy) {
    if (countLotsRows(db) === 0 && (economy.lots?.length ?? 0) > 0) {
      upsertLots(db, economy.lots, economy.airports);
    } else if (countLotsRows(db) > 0) {
      fillLotCountryIds(db, economy.airports);
    }

    if (tableCount(db, 'inbound_pending') === 0 && (economy.inboundPending?.length ?? 0) > 0) {
      replaceInboundPending(db, economy.inboundPending ?? [], economy.airports);
    }
    if (tableCount(db, 'npc_flights') === 0 && (economy.npcFlights?.length ?? 0) > 0) {
      replaceNpcFlights(db, economy.npcFlights, economy.airports);
    }
    if (tableCount(db, 'economy_events') === 0 && (economy.events?.length ?? 0) > 0) {
      replaceEconomyEvents(db, economy.events);
    }

    // Rewrite economy blob without hot arrays.
    const stripped = stripEconomyHotArrays(economy);
    db.prepare(
      `UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`,
    ).run(JSON.stringify(stripped), Date.now());
  }

  if (missions) {
    const stub = missionsBlobStub(missions);
    db.prepare(
      `UPDATE missions_json SET json = ?, updated_at_ms = ? WHERE id = 1`,
    ).run(JSON.stringify(stub), Date.now());
  }

  db.prepare(`UPDATE ledger SET company_id = ? WHERE company_id IS NULL OR company_id = ''`).run(
    LOCAL_COMPANY_ID,
  );

  metaSet(db, 'schema_version', schemaVersion);
}
