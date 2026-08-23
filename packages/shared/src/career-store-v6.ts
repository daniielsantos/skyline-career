/**
 * Career store schema v6 — dealer aircraft pool as SoT (MP-ready unique registration).
 *
 * SP uses `LOCAL_WORLD_ID`. Tick still in-memory; this file is I/O + DDL only.
 * Player fleet stays on company tables; this is the world dealer/NPC-ingest pool.
 */

import type { DatabaseSync } from 'node:sqlite';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type {
  AircraftInstance,
  AircraftInstanceStatus,
  AircraftListingKind,
  AirframeCondition,
  CareerEconomyWorld,
  FreighterClassId,
} from './types/career-economy.js';

export const CAREER_STORE_SCHEMA_V6 = '6';

export type SqliteDb = DatabaseSync;

const INSTANCE_STATUSES = new Set<AircraftInstanceStatus>(['available', 'sold']);
const LISTING_KINDS = new Set<AircraftListingKind>(['new', 'used', 'lease']);
const CONDITIONS = new Set<AirframeCondition>([
  'excellent',
  'good',
  'fair',
  'tired',
]);

const POOL_PATCH_FULL_THRESHOLD = 80;

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sqlOptNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function sqlText(v: unknown): string {
  return typeof v === 'string' ? v : '';
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

export function ensureV6Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS aircraft_instances (
      world_id TEXT NOT NULL,
      id TEXT NOT NULL,
      airframe_type_id TEXT NOT NULL,
      aircraft_class_id TEXT NOT NULL,
      country_id TEXT NOT NULL,
      based_icao TEXT NOT NULL,
      registration TEXT NOT NULL,
      kind TEXT NOT NULL,
      condition TEXT NOT NULL,
      hours_airframe REAL NOT NULL,
      hours_engine REAL NOT NULL,
      airframe_condition_pct REAL,
      engine_condition_pct REAL,
      status TEXT NOT NULL,
      seeded_at_tick INTEGER NOT NULL,
      available_at_tick INTEGER,
      PRIMARY KEY (world_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS aircraft_instances_reg_idx
      ON aircraft_instances(world_id, registration);
    CREATE INDEX IF NOT EXISTS aircraft_instances_country_idx
      ON aircraft_instances(world_id, country_id, status);
  `);
}

export function aircraftInstancePersistSignature(inst: AircraftInstance): string {
  return [
    inst.id,
    inst.status,
    inst.basedIcao,
    inst.registration,
    inst.hoursAirframe,
    inst.hoursEngine,
    inst.airframeConditionPct ?? '',
    inst.engineConditionPct ?? '',
    inst.availableAtTick ?? '',
    inst.countryId,
    inst.airframeTypeId,
  ].join('|');
}

export function aircraftInstanceSignatureMap(
  world: Pick<CareerEconomyWorld, 'aircraftInstances'>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const inst of world.aircraftInstances ?? []) {
    if (inst.id) m.set(inst.id, aircraftInstancePersistSignature(inst));
  }
  return m;
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
}): AircraftInstance | null {
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
    hoursAirframe: sqlNum(r.hours_airframe),
    hoursEngine: sqlNum(r.hours_engine),
    status,
    seededAtTick: sqlNum(r.seeded_at_tick),
  };
  const afPct = sqlOptNum(r.airframe_condition_pct);
  const engPct = sqlOptNum(r.engine_condition_pct);
  if (afPct !== undefined) inst.airframeConditionPct = afPct;
  if (engPct !== undefined) inst.engineConditionPct = engPct;
  const avail = sqlOptNum(r.available_at_tick);
  if (avail !== undefined) inst.availableAtTick = avail;
  return inst;
}

export function readAircraftInstances(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): AircraftInstance[] {
  const rows = db
    .prepare(
      `SELECT id, airframe_type_id, aircraft_class_id, country_id, based_icao,
              registration, kind, condition, hours_airframe, hours_engine,
              airframe_condition_pct, engine_condition_pct, status,
              seeded_at_tick, available_at_tick
       FROM aircraft_instances WHERE world_id = ? ORDER BY id ASC`,
    )
    .all(worldId) as Array<{
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
  }>;
  const out: AircraftInstance[] = [];
  for (const row of rows) {
    const inst = instanceFromRow(row);
    if (inst) out.push(inst);
  }
  return out;
}

export function countAircraftInstanceRows(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM aircraft_instances WHERE world_id = ?`)
    .get(worldId) as { n: number };
  return Number(row.n);
}

function upsertAircraftInstanceRows(
  db: SqliteDb,
  instances: AircraftInstance[],
  worldId = LOCAL_WORLD_ID,
): void {
  const upsert = db.prepare(
    `INSERT INTO aircraft_instances (
       world_id, id, airframe_type_id, aircraft_class_id, country_id, based_icao,
       registration, kind, condition, hours_airframe, hours_engine,
       airframe_condition_pct, engine_condition_pct, status, seeded_at_tick,
       available_at_tick
     ) VALUES (
       @world_id, @id, @airframe_type_id, @aircraft_class_id, @country_id, @based_icao,
       @registration, @kind, @condition, @hours_airframe, @hours_engine,
       @airframe_condition_pct, @engine_condition_pct, @status, @seeded_at_tick,
       @available_at_tick
     )
     ON CONFLICT(world_id, id) DO UPDATE SET
       airframe_type_id = excluded.airframe_type_id,
       aircraft_class_id = excluded.aircraft_class_id,
       country_id = excluded.country_id,
       based_icao = excluded.based_icao,
       registration = excluded.registration,
       kind = excluded.kind,
       condition = excluded.condition,
       hours_airframe = excluded.hours_airframe,
       hours_engine = excluded.hours_engine,
       airframe_condition_pct = excluded.airframe_condition_pct,
       engine_condition_pct = excluded.engine_condition_pct,
       status = excluded.status,
       seeded_at_tick = excluded.seeded_at_tick,
       available_at_tick = excluded.available_at_tick`,
  );
  for (const inst of instances) {
    const id = sqlText(inst.id).trim();
    const registration = sqlText(inst.registration).trim().toUpperCase();
    if (!id || !registration) continue;
    upsert.run({
      world_id: worldId,
      id,
      airframe_type_id: inst.airframeTypeId,
      aircraft_class_id: inst.aircraftClassId,
      country_id: inst.countryId,
      based_icao: inst.basedIcao.trim().toUpperCase(),
      registration,
      kind: inst.kind,
      condition: inst.condition,
      hours_airframe: inst.hoursAirframe,
      hours_engine: inst.hoursEngine,
      airframe_condition_pct: inst.airframeConditionPct ?? null,
      engine_condition_pct: inst.engineConditionPct ?? null,
      status: inst.status,
      seeded_at_tick: inst.seededAtTick,
      available_at_tick: inst.availableAtTick ?? null,
    });
  }
}

function replaceAircraftInstances(
  db: SqliteDb,
  instances: AircraftInstance[],
  worldId = LOCAL_WORLD_ID,
): void {
  db.prepare(`DELETE FROM aircraft_instances WHERE world_id = ?`).run(worldId);
  upsertAircraftInstanceRows(db, instances, worldId);
}

export function persistAircraftInstancesIncremental(
  db: SqliteDb,
  instances: AircraftInstance[],
  previous: Map<string, string> | null,
  worldId = LOCAL_WORLD_ID,
): void {
  if (!previous || previous.size === 0) {
    replaceAircraftInstances(db, instances, worldId);
    return;
  }
  const nextIds = new Set(instances.map((row) => row.id));
  const upsert: AircraftInstance[] = [];
  for (const inst of instances) {
    if (previous.get(inst.id) !== aircraftInstancePersistSignature(inst)) {
      upsert.push(inst);
    }
  }
  const remove: string[] = [];
  for (const id of previous.keys()) {
    if (!nextIds.has(id)) remove.push(id);
  }
  if (upsert.length + remove.length >= POOL_PATCH_FULL_THRESHOLD) {
    replaceAircraftInstances(db, instances, worldId);
    return;
  }
  const del = db.prepare(
    `DELETE FROM aircraft_instances WHERE world_id = ? AND id = ?`,
  );
  for (const id of remove) del.run(worldId, id);
  if (upsert.length > 0) upsertAircraftInstanceRows(db, upsert, worldId);
}

export function hydrateAircraftPoolFromTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  if (countAircraftInstanceRows(db, worldId) === 0) return;
  world.aircraftInstances = readAircraftInstances(db, worldId);
}

export function stripEconomyAircraftPool(
  blob: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...blob,
    aircraftInstances: [],
  };
}

export function economyBlobHasAircraftPool(raw: Record<string, unknown>): boolean {
  return Array.isArray(raw.aircraftInstances) && raw.aircraftInstances.length > 0;
}

export function persistAircraftPoolTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  replaceAircraftInstances(db, world.aircraftInstances ?? [], worldId);
}

/**
 * Copy blob dealer pool → tables when v6 tables are empty, then strip.
 */
export function migrateV5toV6IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV6Ddl(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 6) return;

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
      if (
        countAircraftInstanceRows(db, LOCAL_WORLD_ID) === 0 &&
        economyBlobHasAircraftPool(economy as unknown as Record<string, unknown>)
      ) {
        persistAircraftPoolTables(db, economy, LOCAL_WORLD_ID);
      }
      const stripped = stripEconomyAircraftPool(
        economy as unknown as Record<string, unknown>,
      );
      db.prepare(`UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`).run(
        JSON.stringify(stripped),
        Date.now(),
      );
    }
    metaSet(db, 'schema_version', schemaVersion);
  });
}
