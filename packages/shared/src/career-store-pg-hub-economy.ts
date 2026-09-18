/**
 * Postgres hub_economy_samples — MP mirror of SQLite Hub Stats / Pulse history.
 * Schema v18. Flushed from pendingHubEconomySamples on day-boundary saves.
 */

import type pg from 'pg';
import { economyDayIndex } from './career-weather.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import { HUB_ECONOMY_SAMPLE_RETENTION_DAYS } from './career-store-v7.js';
import type { HubEconomySample, HubTier } from './types/career-economy.js';

const UPSERT_COLS = 30;
const UPSERT_BATCH = 80;

export const HUB_ECONOMY_SAMPLES_PG_DDL = `
CREATE TABLE IF NOT EXISTS hub_economy_samples (
  world_id TEXT NOT NULL,
  icao TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  activity_score DOUBLE PRECISION,
  hub_level INTEGER,
  quiet BOOLEAN NOT NULL DEFAULT FALSE,
  jet_a_fill DOUBLE PRECISION,
  outbound_lots INTEGER NOT NULL DEFAULT 0,
  outbound_kg INTEGER NOT NULL DEFAULT 0,
  pay_p50_usd DOUBLE PRECISION,
  kg_ga INTEGER NOT NULL DEFAULT 0,
  kg_tp INTEGER NOT NULL DEFAULT 0,
  kg_medium INTEGER NOT NULL DEFAULT 0,
  kg_narrow INTEGER NOT NULL DEFAULT 0,
  kg_wide INTEGER NOT NULL DEFAULT 0,
  commodities_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  country_id TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  hub_tier TEXT NOT NULL DEFAULT 'spoke',
  cargo_stock_kg INTEGER NOT NULL DEFAULT 0,
  cargo_capacity_kg INTEGER NOT NULL DEFAULT 0,
  inbound_kg INTEGER NOT NULL DEFAULT 0,
  lots_ga INTEGER NOT NULL DEFAULT 0,
  lots_tp INTEGER NOT NULL DEFAULT 0,
  lots_medium INTEGER NOT NULL DEFAULT 0,
  lots_narrow INTEGER NOT NULL DEFAULT 0,
  lots_wide INTEGER NOT NULL DEFAULT 0,
  pay_p10_usd DOUBLE PRECISION,
  pay_p90_usd DOUBLE PRECISION,
  PRIMARY KEY (world_id, icao, day_index)
);
CREATE INDEX IF NOT EXISTS hub_economy_samples_day_idx
  ON hub_economy_samples(world_id, day_index);
CREATE INDEX IF NOT EXISTS hub_economy_samples_icao_idx
  ON hub_economy_samples(world_id, icao, day_index);
CREATE INDEX IF NOT EXISTS hub_economy_samples_country_day_idx
  ON hub_economy_samples(world_id, country_id, day_index);
CREATE INDEX IF NOT EXISTS hub_economy_samples_tier_day_idx
  ON hub_economy_samples(world_id, hub_tier, day_index);
`;

export async function ensurePgHubEconomySamplesDdl(
  pool: pg.Pool | pg.PoolClient,
): Promise<void> {
  await pool.query(HUB_ECONOMY_SAMPLES_PG_DDL);
}

function sqlNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function sqlText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseHubTier(raw: string): HubTier {
  if (raw === 'major' || raw === 'regional' || raw === 'spoke') return raw;
  return 'spoke';
}

function sampleFromPgRow(r: Record<string, unknown>): HubEconomySample | null {
  const icao = sqlText(r.icao).toUpperCase();
  if (!icao) return null;
  let commodities: HubEconomySample['commodities'] = [];
  try {
    const raw = r.commodities_json;
    const parsed =
      typeof raw === 'string'
        ? (JSON.parse(raw) as unknown)
        : raw != null && typeof raw === 'object'
          ? raw
          : [];
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
    quiet: r.quiet === true || sqlNum(r.quiet) !== 0,
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

function sampleRowValues(
  worldId: string,
  s: HubEconomySample,
): unknown[] {
  return [
    worldId,
    s.icao.trim().toUpperCase(),
    s.dayIndex,
    s.tick,
    s.activityScore,
    s.hubLevel,
    s.quiet === true,
    s.jetAFill,
    s.outboundLots,
    s.outboundKg,
    s.payP50Usd,
    s.kgGa,
    s.kgTp,
    s.kgMedium,
    s.kgNarrow,
    s.kgWide,
    JSON.stringify(s.commodities ?? []),
    s.countryId ?? '',
    s.region ?? '',
    s.hubTier ?? 'spoke',
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
  ];
}

function upsertPlaceholders(rowCount: number): string {
  const parts: string[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const base = r * UPSERT_COLS;
    const cols: string[] = [];
    for (let c = 1; c <= UPSERT_COLS; c += 1) {
      cols.push(`$${base + c}`);
    }
    // commodities_json is column 17 — cast jsonb
    cols[16] = `$${base + 17}::jsonb`;
    parts.push(`(${cols.join(', ')})`);
  }
  return parts.join(', ');
}

export async function upsertHubEconomySamplesToPg(
  client: pg.PoolClient,
  samples: HubEconomySample[],
  worldId = LOCAL_WORLD_ID,
): Promise<void> {
  if (samples.length === 0) return;
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const sqlPrefix = `
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
    ) VALUES `;
  const conflict = `
    ON CONFLICT (world_id, icao, day_index) DO UPDATE SET
      tick = EXCLUDED.tick,
      activity_score = EXCLUDED.activity_score,
      hub_level = EXCLUDED.hub_level,
      quiet = EXCLUDED.quiet,
      jet_a_fill = EXCLUDED.jet_a_fill,
      outbound_lots = EXCLUDED.outbound_lots,
      outbound_kg = EXCLUDED.outbound_kg,
      pay_p50_usd = EXCLUDED.pay_p50_usd,
      kg_ga = EXCLUDED.kg_ga,
      kg_tp = EXCLUDED.kg_tp,
      kg_medium = EXCLUDED.kg_medium,
      kg_narrow = EXCLUDED.kg_narrow,
      kg_wide = EXCLUDED.kg_wide,
      commodities_json = EXCLUDED.commodities_json,
      country_id = EXCLUDED.country_id,
      region = EXCLUDED.region,
      hub_tier = EXCLUDED.hub_tier,
      cargo_stock_kg = EXCLUDED.cargo_stock_kg,
      cargo_capacity_kg = EXCLUDED.cargo_capacity_kg,
      inbound_kg = EXCLUDED.inbound_kg,
      lots_ga = EXCLUDED.lots_ga,
      lots_tp = EXCLUDED.lots_tp,
      lots_medium = EXCLUDED.lots_medium,
      lots_narrow = EXCLUDED.lots_narrow,
      lots_wide = EXCLUDED.lots_wide,
      pay_p10_usd = EXCLUDED.pay_p10_usd,
      pay_p90_usd = EXCLUDED.pay_p90_usd`;

  for (let i = 0; i < samples.length; i += UPSERT_BATCH) {
    const chunk = samples.slice(i, i + UPSERT_BATCH);
    const flat = chunk.flatMap((s) => sampleRowValues(wid, s));
    await client.query(
      `${sqlPrefix}${upsertPlaceholders(chunk.length)}${conflict}`,
      flat,
    );
  }
}

export async function pruneHubEconomySamplesFromPg(
  client: pg.PoolClient,
  currentDayIndex: number,
  retentionDays = HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
  worldId = LOCAL_WORLD_ID,
): Promise<number> {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const minDay = Math.max(0, currentDayIndex - retentionDays + 1);
  const result = await client.query(
    `DELETE FROM hub_economy_samples WHERE world_id = $1 AND day_index < $2`,
    [wid, minDay],
  );
  return result.rowCount ?? 0;
}

/** Flush pending day samples inside an open economy transaction. */
export async function flushPendingHubEconomySamplesToPg(
  client: pg.PoolClient,
  world: {
    tick: number;
    pendingHubEconomySamples?: HubEconomySample[] | null;
  },
  worldId = LOCAL_WORLD_ID,
): Promise<void> {
  const pending = world.pendingHubEconomySamples;
  if (!pending || pending.length === 0) {
    world.pendingHubEconomySamples = undefined;
    return;
  }
  await upsertHubEconomySamplesToPg(client, pending, worldId);
  const day = economyDayIndex(world.tick);
  await pruneHubEconomySamplesFromPg(
    client,
    day,
    HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
    worldId,
  );
  world.pendingHubEconomySamples = undefined;
}

export async function readHubEconomySamplesFromPg(
  pool: pg.Pool,
  opts: {
    icao: string;
    sinceDay?: number;
    worldId?: string;
  },
): Promise<HubEconomySample[]> {
  const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
  const icao = opts.icao.trim().toUpperCase();
  const sinceDay =
    typeof opts.sinceDay === 'number' && Number.isFinite(opts.sinceDay)
      ? Math.max(0, Math.floor(opts.sinceDay))
      : 0;
  const result = await pool.query(
    `SELECT * FROM hub_economy_samples
     WHERE world_id = $1 AND icao = $2 AND day_index >= $3
     ORDER BY day_index ASC`,
    [worldId, icao, sinceDay],
  );
  return result.rows
    .map((row) => sampleFromPgRow(row as Record<string, unknown>))
    .filter((s): s is HubEconomySample => s != null);
}

export async function readHubEconomySamplesSinceFromPg(
  pool: pg.Pool,
  opts: {
    sinceDay?: number;
    untilDay?: number;
    worldId?: string;
  } = {},
): Promise<HubEconomySample[]> {
  const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
  const sinceDay =
    typeof opts.sinceDay === 'number' && Number.isFinite(opts.sinceDay)
      ? Math.max(0, Math.floor(opts.sinceDay))
      : 0;
  // Do not bind Number.MAX_SAFE_INTEGER — Postgres INTEGER max is 2^31-1.
  const params: unknown[] = [worldId, sinceDay];
  let untilSql = '';
  if (typeof opts.untilDay === 'number' && Number.isFinite(opts.untilDay)) {
    untilSql = ' AND day_index <= $3';
    params.push(Math.floor(opts.untilDay));
  }
  const result = await pool.query(
    `SELECT * FROM hub_economy_samples
     WHERE world_id = $1 AND day_index >= $2${untilSql}
     ORDER BY day_index ASC, icao ASC`,
    params,
  );
  return result.rows
    .map((row) => sampleFromPgRow(row as Record<string, unknown>))
    .filter((s): s is HubEconomySample => s != null);
}
