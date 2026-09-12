/** Career store schema v9 — charter world state + mission columns. */

import type { DatabaseSync } from 'node:sqlite';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type {
  CareerEconomyWorld,
  CharterDemand,
  CharterHubState,
  CharterOffer,
  CharterOfferStatus,
  CharterTier,
  CharterUrgency,
} from './types/career-economy.js';

export const CAREER_STORE_SCHEMA_V9 = '9';
export type SqliteDb = DatabaseSync;

function columns(db: SqliteDb, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
}

function ensureColumn(db: SqliteDb, table: string, column: string, type: string): void {
  if (!columns(db, table).has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function ensureV9Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS charter_demand (
      world_id TEXT NOT NULL,
      id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      pressure REAL NOT NULL,
      international INTEGER NOT NULL DEFAULT 0,
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
      waiting_pax REAL NOT NULL DEFAULT 0,
      attract_pax REAL NOT NULL DEFAULT 0,
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
      baggage_kg REAL NOT NULL DEFAULT 0,
      distance_nm REAL NOT NULL,
      tier TEXT NOT NULL,
      urgency TEXT NOT NULL,
      international INTEGER NOT NULL DEFAULT 0,
      pay_usd REAL NOT NULL,
      created_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      status TEXT NOT NULL,
      mission_id TEXT,
      PRIMARY KEY (world_id, id),
      FOREIGN KEY (world_id, demand_id) REFERENCES charter_demand(world_id, id)
    );
    CREATE INDEX IF NOT EXISTS charter_offers_status_expiry_idx
      ON charter_offers(world_id, status, expires_at_tick);
    CREATE INDEX IF NOT EXISTS charter_offers_od_idx
      ON charter_offers(world_id, origin_icao, dest_icao);
  `);
  ensureColumn(db, 'missions', 'mission_type', "TEXT NOT NULL DEFAULT 'freight'");
  ensureColumn(db, 'missions', 'charter_offer_id', 'TEXT');
  ensureColumn(db, 'missions', 'pax', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'missions', 'baggage_kg', 'REAL NOT NULL DEFAULT 0');
  // Handles databases already stamped v9 by the initial charter foundation.
  ensureColumn(db, 'charter_offers', 'baggage_kg', 'REAL NOT NULL DEFAULT 0');
  db.exec(`
    UPDATE missions SET mission_type = 'freight'
      WHERE mission_type IS NULL OR TRIM(mission_type) = '';
    CREATE INDEX IF NOT EXISTS missions_type_status_idx
      ON missions(company_id, mission_type, status);
    CREATE INDEX IF NOT EXISTS missions_charter_offer_idx
      ON missions(charter_offer_id);
  `);
}

export function migrateV8toV9IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV9Ddl(db);
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(row?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 9) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureV9Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function hydrateCharterFromTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  world.charterDemand = db
    .prepare(
      `SELECT id, origin_icao, dest_icao, pressure, international,
              created_at_tick, updated_at_tick, last_offered_day,
              fulfilled_groups, expired_groups
       FROM charter_demand WHERE world_id = ? ORDER BY id`,
    )
    .all(worldId)
    .map((raw) => {
      const row = raw as Record<string, string | number | null>;
      return {
        id: String(row.id),
        originIcao: String(row.origin_icao),
        destIcao: String(row.dest_icao),
        pressure: Number(row.pressure),
        international: Boolean(row.international),
        createdAtTick: Number(row.created_at_tick),
        updatedAtTick: Number(row.updated_at_tick),
        lastOfferedDay: Number(row.last_offered_day),
        fulfilledGroups: Number(row.fulfilled_groups),
        expiredGroups: Number(row.expired_groups),
      } satisfies CharterDemand;
    });
  world.charterOffers = db
    .prepare(
      `SELECT id, demand_id, origin_icao, dest_icao, group_size, baggage_kg, distance_nm,
              tier, urgency, international, pay_usd, created_at_tick,
              expires_at_tick, status, mission_id
       FROM charter_offers WHERE world_id = ? ORDER BY created_at_tick, id`,
    )
    .all(worldId)
    .map((raw) => {
      const row = raw as Record<string, string | number | null>;
      return {
        id: String(row.id),
        demandId: String(row.demand_id),
        originIcao: String(row.origin_icao),
        destIcao: String(row.dest_icao),
        groupSize: Number(row.group_size),
        baggageKg: Number(row.baggage_kg),
        distanceNm: Number(row.distance_nm),
        tier: String(row.tier) as CharterTier,
        urgency: String(row.urgency) as CharterUrgency,
        international: Boolean(row.international),
        payUsd: Number(row.pay_usd),
        createdAtTick: Number(row.created_at_tick),
        expiresAtTick: Number(row.expires_at_tick),
        status: String(row.status) as CharterOfferStatus,
        ...(row.mission_id ? { missionId: String(row.mission_id) } : {}),
      } satisfies CharterOffer;
    });
  world.charterHubs = db
    .prepare(
      `SELECT icao, waiting_pax, attract_pax, capacity_pax, updated_at_tick
       FROM charter_hubs WHERE world_id = ? ORDER BY icao`,
    )
    .all(worldId)
    .map((raw) => {
      const row = raw as Record<string, string | number | null>;
      return {
        icao: String(row.icao),
        waitingPax: Number(row.waiting_pax),
        attractPax: Number(row.attract_pax),
        capacityPax: Number(row.capacity_pax),
        updatedAtTick: Number(row.updated_at_tick),
      } satisfies CharterHubState;
    });
}

export function persistCharterTables(
  db: SqliteDb,
  world: CareerEconomyWorld,
  worldId = LOCAL_WORLD_ID,
): void {
  ensureV9Ddl(db);
  db.prepare(`DELETE FROM charter_offers WHERE world_id = ?`).run(worldId);
  db.prepare(`DELETE FROM charter_demand WHERE world_id = ?`).run(worldId);
  db.prepare(`DELETE FROM charter_hubs WHERE world_id = ?`).run(worldId);
  const demandStmt = db.prepare(`
    INSERT INTO charter_demand (
      world_id, id, origin_icao, dest_icao, pressure, international,
      created_at_tick, updated_at_tick, last_offered_day,
      fulfilled_groups, expired_groups
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of world.charterDemand ?? []) {
    demandStmt.run(
      worldId,
      row.id,
      row.originIcao,
      row.destIcao,
      row.pressure,
      row.international ? 1 : 0,
      row.createdAtTick,
      row.updatedAtTick,
      row.lastOfferedDay,
      row.fulfilledGroups,
      row.expiredGroups,
    );
  }
  const hubStmt = db.prepare(`
    INSERT INTO charter_hubs (
      world_id, icao, waiting_pax, attract_pax, capacity_pax, updated_at_tick
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const seenHubs = new Set<string>();
  for (const row of world.charterHubs ?? []) {
    const icao = row.icao.trim().toUpperCase();
    if (!icao || seenHubs.has(icao)) continue;
    seenHubs.add(icao);
    hubStmt.run(
      worldId,
      icao,
      row.waitingPax,
      row.attractPax,
      row.capacityPax,
      row.updatedAtTick,
    );
  }
  const offerStmt = db.prepare(`
    INSERT INTO charter_offers (
      world_id, id, demand_id, origin_icao, dest_icao, group_size, baggage_kg, distance_nm,
      tier, urgency, international, pay_usd, created_at_tick, expires_at_tick,
      status, mission_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of world.charterOffers ?? []) {
    offerStmt.run(
      worldId,
      row.id,
      row.demandId,
      row.originIcao,
      row.destIcao,
      row.groupSize,
      row.baggageKg,
      row.distanceNm,
      row.tier,
      row.urgency,
      row.international ? 1 : 0,
      row.payUsd,
      row.createdAtTick,
      row.expiresAtTick,
      row.status,
      row.missionId ?? null,
    );
  }
}

export function stripEconomyCharter(
  world: CareerEconomyWorld | Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...world } as Record<string, unknown>;
  delete out.charterDemand;
  delete out.charterOffers;
  delete out.charterHubs;
  return out;
}
