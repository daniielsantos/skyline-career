/**
 * Career store schema v7/v8 — daily hub economy samples (Hub Stats + network pulse).
 *
 * SP uses `LOCAL_WORLD_ID`. Samples are append-only per day; prune keeps 30 days.
 * Never stored in economy_json.
 *
 * v8 adds country/tier/stock/inbound/lot-count/pay-band columns (ALTER on upgrade).
 */

import type { DatabaseSync } from 'node:sqlite';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type { HubEconomySample, HubTier } from './types/career-economy.js';
import { economyDayIndex } from './career-weather.js';
import { TICKS_PER_DAY } from './career-clock.js';

export const CAREER_STORE_SCHEMA_V7 = '7';
export const CAREER_STORE_SCHEMA_V8 = '8';

/** Keep this many economy days of samples (inclusive of today). */
export const HUB_ECONOMY_SAMPLE_RETENTION_DAYS = 30;

export type SqliteDb = DatabaseSync;

function sqlNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
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

function tableColumns(db: SqliteDb, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

function ensureColumn(
  db: SqliteDb,
  table: string,
  column: string,
  ddlType: string,
): void {
  const cols = tableColumns(db, table);
  if (cols.has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
}

/** Base table (v7). New installs get v8 columns via ensureV8HubSampleColumns. */
export function ensureV7Ddl(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_economy_samples (
      world_id TEXT NOT NULL,
      icao TEXT NOT NULL,
      day_index INTEGER NOT NULL,
      tick INTEGER NOT NULL,
      activity_score REAL,
      hub_level INTEGER,
      quiet INTEGER NOT NULL DEFAULT 0,
      jet_a_fill REAL,
      outbound_lots INTEGER NOT NULL DEFAULT 0,
      outbound_kg INTEGER NOT NULL DEFAULT 0,
      pay_p50_usd REAL,
      kg_ga INTEGER NOT NULL DEFAULT 0,
      kg_tp INTEGER NOT NULL DEFAULT 0,
      kg_medium INTEGER NOT NULL DEFAULT 0,
      kg_narrow INTEGER NOT NULL DEFAULT 0,
      kg_wide INTEGER NOT NULL DEFAULT 0,
      commodities_json TEXT NOT NULL,
      PRIMARY KEY (world_id, icao, day_index)
    );
    CREATE INDEX IF NOT EXISTS hub_economy_samples_day_idx
      ON hub_economy_samples(world_id, day_index);
    CREATE INDEX IF NOT EXISTS hub_economy_samples_icao_idx
      ON hub_economy_samples(world_id, icao, day_index);
  `);
}

/** Network-pulse dimensions + denser board/stock stats. */
export function ensureV8HubSampleColumns(db: SqliteDb): void {
  ensureV7Ddl(db);
  ensureColumn(db, 'hub_economy_samples', 'country_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hub_economy_samples', 'region', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'hub_economy_samples', 'hub_tier', "TEXT NOT NULL DEFAULT 'spoke'");
  ensureColumn(db, 'hub_economy_samples', 'cargo_stock_kg', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'cargo_capacity_kg', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'inbound_kg', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'lots_ga', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'lots_tp', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'lots_medium', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'lots_narrow', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'lots_wide', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'hub_economy_samples', 'pay_p10_usd', 'REAL');
  ensureColumn(db, 'hub_economy_samples', 'pay_p90_usd', 'REAL');
  db.exec(`
    CREATE INDEX IF NOT EXISTS hub_economy_samples_country_day_idx
      ON hub_economy_samples(world_id, country_id, day_index);
    CREATE INDEX IF NOT EXISTS hub_economy_samples_tier_day_idx
      ON hub_economy_samples(world_id, hub_tier, day_index);
  `);
}

export function migrateV6toV7IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV7Ddl(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 7) return;

  withSqliteTransaction(db, () => {
    ensureV7Ddl(db);
    metaSet(db, 'schema_version', schemaVersion);
  });
}

export function migrateV7toV8IfNeeded(
  db: SqliteDb,
  metaSet: (db: SqliteDb, key: string, value: string) => void,
  schemaVersion: string,
): void {
  ensureV8HubSampleColumns(db);

  const verRow = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const current = Number.parseInt(verRow?.value ?? '0', 10);
  if (Number.isFinite(current) && current >= 8) return;

  withSqliteTransaction(db, () => {
    ensureV8HubSampleColumns(db);
    metaSet(db, 'schema_version', schemaVersion);
  });
}

export function upsertHubEconomySamples(
  db: SqliteDb,
  samples: HubEconomySample[],
  worldId = LOCAL_WORLD_ID,
): void {
  if (samples.length === 0) return;
  ensureV8HubSampleColumns(db);
  const stmt = db.prepare(`
    INSERT INTO hub_economy_samples (
      world_id, icao, day_index, tick,
      activity_score, hub_level, quiet, jet_a_fill,
      outbound_lots, outbound_kg, pay_p50_usd,
      kg_ga, kg_tp, kg_medium, kg_narrow, kg_wide,
      commodities_json,
      country_id, region, hub_tier,
      cargo_stock_kg, cargo_capacity_kg, inbound_kg,
      lots_ga, lots_tp, lots_medium, lots_narrow, lots_wide,
      pay_p10_usd, pay_p90_usd
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
    ON CONFLICT(world_id, icao, day_index) DO UPDATE SET
      tick = excluded.tick,
      activity_score = excluded.activity_score,
      hub_level = excluded.hub_level,
      quiet = excluded.quiet,
      jet_a_fill = excluded.jet_a_fill,
      outbound_lots = excluded.outbound_lots,
      outbound_kg = excluded.outbound_kg,
      pay_p50_usd = excluded.pay_p50_usd,
      kg_ga = excluded.kg_ga,
      kg_tp = excluded.kg_tp,
      kg_medium = excluded.kg_medium,
      kg_narrow = excluded.kg_narrow,
      kg_wide = excluded.kg_wide,
      commodities_json = excluded.commodities_json,
      country_id = excluded.country_id,
      region = excluded.region,
      hub_tier = excluded.hub_tier,
      cargo_stock_kg = excluded.cargo_stock_kg,
      cargo_capacity_kg = excluded.cargo_capacity_kg,
      inbound_kg = excluded.inbound_kg,
      lots_ga = excluded.lots_ga,
      lots_tp = excluded.lots_tp,
      lots_medium = excluded.lots_medium,
      lots_narrow = excluded.lots_narrow,
      lots_wide = excluded.lots_wide,
      pay_p10_usd = excluded.pay_p10_usd,
      pay_p90_usd = excluded.pay_p90_usd
  `);
  for (const s of samples) {
    stmt.run(
      worldId,
      s.icao,
      s.dayIndex,
      s.tick,
      s.activityScore,
      s.hubLevel,
      s.quiet ? 1 : 0,
      s.jetAFill,
      s.outboundLots,
      s.outboundKg,
      s.payP50Usd,
      s.kgGa,
      s.kgTp,
      s.kgMedium,
      s.kgNarrow,
      s.kgWide,
      JSON.stringify(s.commodities),
      s.countryId,
      s.region,
      s.hubTier,
      s.cargoStockKg,
      s.cargoCapacityKg,
      s.inboundKg,
      s.lotsGa,
      s.lotsTp,
      s.lotsMedium,
      s.lotsNarrow,
      s.lotsWide,
      s.payP10Usd ?? null,
      s.payP90Usd ?? null,
    );
  }
}

export function pruneHubEconomySamples(
  db: SqliteDb,
  currentDayIndex: number,
  retentionDays = HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
  worldId = LOCAL_WORLD_ID,
): number {
  const minDay = Math.max(0, currentDayIndex - retentionDays + 1);
  const result = db
    .prepare(
      `DELETE FROM hub_economy_samples WHERE world_id = ? AND day_index < ?`,
    )
    .run(worldId, minDay);
  return Number(result.changes ?? 0);
}

export function readHubEconomySamples(
  db: SqliteDb,
  opts: {
    icao: string;
    sinceDay?: number;
    worldId?: string;
  },
): HubEconomySample[] {
  const worldId = opts.worldId ?? LOCAL_WORLD_ID;
  const icao = opts.icao.trim().toUpperCase();
  const sinceDay =
    typeof opts.sinceDay === 'number' && Number.isFinite(opts.sinceDay)
      ? Math.max(0, Math.floor(opts.sinceDay))
      : 0;
  ensureV8HubSampleColumns(db);
  const rows = db
    .prepare(
      `SELECT * FROM hub_economy_samples
       WHERE world_id = ? AND icao = ? AND day_index >= ?
       ORDER BY day_index ASC`,
    )
    .all(worldId, icao, sinceDay) as Array<Record<string, unknown>>;
  return rows.map(sampleFromRow).filter((s): s is HubEconomySample => s != null);
}

/** All hubs for days ≥ sinceDay (network history pulse). */
export function readHubEconomySamplesSince(
  db: SqliteDb,
  opts: {
    sinceDay?: number;
    untilDay?: number;
    worldId?: string;
  } = {},
): HubEconomySample[] {
  const worldId = opts.worldId ?? LOCAL_WORLD_ID;
  const sinceDay =
    typeof opts.sinceDay === 'number' && Number.isFinite(opts.sinceDay)
      ? Math.max(0, Math.floor(opts.sinceDay))
      : 0;
  const untilDay =
    typeof opts.untilDay === 'number' && Number.isFinite(opts.untilDay)
      ? Math.floor(opts.untilDay)
      : Number.MAX_SAFE_INTEGER;
  ensureV8HubSampleColumns(db);
  const rows = db
    .prepare(
      `SELECT * FROM hub_economy_samples
       WHERE world_id = ? AND day_index >= ? AND day_index <= ?
       ORDER BY day_index ASC, icao ASC`,
    )
    .all(worldId, sinceDay, untilDay) as Array<Record<string, unknown>>;
  return rows.map(sampleFromRow).filter((s): s is HubEconomySample => s != null);
}

function parseHubTier(raw: string): HubTier {
  if (raw === 'major' || raw === 'regional' || raw === 'spoke') return raw;
  return 'spoke';
}

function sampleFromRow(r: Record<string, unknown>): HubEconomySample | null {
  const icao = sqlText(r.icao).toUpperCase();
  if (!icao) return null;
  let commodities: HubEconomySample['commodities'] = [];
  try {
    const parsed = JSON.parse(sqlText(r.commodities_json)) as unknown;
    if (Array.isArray(parsed)) {
      const next: HubEconomySample['commodities'] = [];
      for (const c of parsed) {
        if (!c || typeof c !== 'object') continue;
        const row = c as Record<string, unknown>;
        const id = sqlText(row.id);
        if (!id) continue;
        const item: HubEconomySample['commodities'][number] = {
          id: id as HubEconomySample['commodities'][number]['id'],
          fill: sqlNum(row.fill),
          spotUsd: sqlNum(row.spotUsd),
        };
        if (row.stockKg != null) item.stockKg = sqlNum(row.stockKg);
        if (row.capacityKg != null) item.capacityKg = sqlNum(row.capacityKg);
        next.push(item);
      }
      commodities = next;
    }
  } catch {
    commodities = [];
  }
  const optPay = (key: string): number | null => {
    const v = r[key];
    if (v == null || v === '') return null;
    return sqlNum(v);
  };
  return {
    icao,
    dayIndex: sqlNum(r.day_index),
    tick: sqlNum(r.tick),
    countryId: sqlText(r.country_id) || 'XX',
    region: sqlText(r.region) || '',
    hubTier: parseHubTier(sqlText(r.hub_tier)),
    activityScore: sqlNum(r.activity_score),
    hubLevel: sqlNum(r.hub_level, 1),
    quiet: sqlNum(r.quiet) !== 0,
    jetAFill: sqlNum(r.jet_a_fill),
    outboundLots: sqlNum(r.outbound_lots),
    outboundKg: sqlNum(r.outbound_kg),
    payP50Usd: optPay('pay_p50_usd'),
    payP10Usd: optPay('pay_p10_usd'),
    payP90Usd: optPay('pay_p90_usd'),
    kgGa: sqlNum(r.kg_ga),
    kgTp: sqlNum(r.kg_tp),
    kgMedium: sqlNum(r.kg_medium),
    kgNarrow: sqlNum(r.kg_narrow),
    kgWide: sqlNum(r.kg_wide),
    lotsGa: sqlNum(r.lots_ga),
    lotsTp: sqlNum(r.lots_tp),
    lotsMedium: sqlNum(r.lots_medium),
    lotsNarrow: sqlNum(r.lots_narrow),
    lotsWide: sqlNum(r.lots_wide),
    cargoStockKg: sqlNum(r.cargo_stock_kg),
    cargoCapacityKg: sqlNum(r.cargo_capacity_kg),
    inboundKg: sqlNum(r.inbound_kg),
    commodities,
  };
}

/** Flush pending samples from a world into SQL and prune old days. */
export function flushPendingHubEconomySamples(
  db: SqliteDb,
  world: {
    tick: number;
    pendingHubEconomySamples?: HubEconomySample[] | null;
  },
  worldId = LOCAL_WORLD_ID,
): void {
  const pending = world.pendingHubEconomySamples;
  if (!pending || pending.length === 0) {
    world.pendingHubEconomySamples = undefined;
    return;
  }
  upsertHubEconomySamples(db, pending, worldId);
  const day = economyDayIndex(world.tick);
  pruneHubEconomySamples(db, day, HUB_ECONOMY_SAMPLE_RETENTION_DAYS, worldId);
  world.pendingHubEconomySamples = undefined;
}

/** @internal test helper */
export { TICKS_PER_DAY as hubEconomyTicksPerDay };
