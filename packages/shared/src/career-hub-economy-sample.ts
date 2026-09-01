/**
 * Daily hub economy samples for Hub Stats (UI + diagnostics).
 * Pure snapshot — persistence lives in career-store-v7 (+ v8 columns).
 */

import { CLASS_BASELINE_CARGO_KG } from './career-aircraft-pricing.js';
import { isBushTripOnlyHub } from './career-bush.js';
import {
  CAREER_CARGO_COMMODITIES,
  GA_LTL_MAX_KG,
  localUnitPriceUsd,
} from './career-economy.js';
import { hubLevelXpProgress } from './career-hub-level.js';
import { countryIdFromRegion } from './career-partition.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerEconomyWorld,
  HubEconomyCommoditySample,
  HubEconomySample,
  HubTier,
  ShipmentLot,
} from './types/career-economy.js';

export type { HubEconomyCommoditySample, HubEconomySample };

/** Quiet threshold — matches hub-level / pulse. */
export const HUB_STATS_QUIET_ACTIVITY_SCORE = 8;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function fillOf(stock: { stockKg: number; capacityKg: number } | undefined): number {
  if (!stock || !(stock.capacityKg > 0)) return 0;
  return clamp01(stock.stockKg / stock.capacityKg);
}

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

type SizeBand = keyof Pick<
  HubEconomySample,
  'kgGa' | 'kgTp' | 'kgMedium' | 'kgNarrow' | 'kgWide'
>;

function sizeBandKg(quantityKg: number): SizeBand {
  if (quantityKg <= GA_LTL_MAX_KG) return 'kgGa';
  if (quantityKg <= CLASS_BASELINE_CARGO_KG.light_turboprop) return 'kgTp';
  if (quantityKg <= CLASS_BASELINE_CARGO_KG.medium_piston) return 'kgMedium';
  if (quantityKg <= CLASS_BASELINE_CARGO_KG.narrow_freighter) return 'kgNarrow';
  return 'kgWide';
}

function isCargoHub(ap: {
  icao: string;
  bushTripOnly?: boolean;
}): boolean {
  return !(ap.bushTripOnly === true || isBushTripOnlyHub(ap.icao));
}

function resolveHubTier(
  airport: CareerEconomyWorld['airports'][number],
): HubTier {
  const t = airport.hubTier;
  if (t === 'major' || t === 'regional' || t === 'spoke') return t;
  return 'spoke';
}

/** Index available outbound lots by origin ICAO. */
function outboundLotsByOrigin(
  lots: ShipmentLot[] | undefined,
): Map<string, ShipmentLot[]> {
  const map = new Map<string, ShipmentLot[]>();
  for (const lot of lots ?? []) {
    if (lot.status !== 'available') continue;
    const origin = lot.originIcao?.trim().toUpperCase();
    if (!origin) continue;
    const list = map.get(origin);
    if (list) list.push(lot);
    else map.set(origin, [lot]);
  }
  return map;
}

/** Pending inbound transfers + NPC cargo headed to ICAO. */
export function hubInboundCargoKg(
  world: Pick<CareerEconomyWorld, 'inboundPending' | 'npcFlights'>,
  icao: string,
): number {
  const dest = icao.trim().toUpperCase();
  let kg = 0;
  for (const row of world.inboundPending ?? []) {
    if (row.destIcao?.trim().toUpperCase() !== dest) continue;
    kg += Math.max(0, row.cargoKg ?? 0);
  }
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'in_flight' && flight.status !== 'awaiting_pilot') {
      continue;
    }
    if (flight.destIcao?.trim().toUpperCase() !== dest) continue;
    kg += Math.max(0, flight.cargoKg ?? 0);
  }
  return kg;
}

export function buildHubEconomySampleForAirport(
  world: Pick<CareerEconomyWorld, 'tick' | 'lots' | 'inboundPending' | 'npcFlights'>,
  airport: CareerEconomyWorld['airports'][number],
  outbound?: ShipmentLot[],
): HubEconomySample | null {
  if (!isCargoHub(airport)) return null;
  const icao = airport.icao.trim().toUpperCase();
  const lots = outbound ?? [];
  const pays: number[] = [];
  let outboundKg = 0;
  let kgGa = 0;
  let kgTp = 0;
  let kgMedium = 0;
  let kgNarrow = 0;
  let kgWide = 0;
  let lotsGa = 0;
  let lotsTp = 0;
  let lotsMedium = 0;
  let lotsNarrow = 0;
  let lotsWide = 0;
  for (const lot of lots) {
    const kg = Math.max(0, lot.quantityKg ?? 0);
    outboundKg += kg;
    const band = sizeBandKg(kg);
    if (band === 'kgGa') {
      kgGa += kg;
      lotsGa += 1;
    } else if (band === 'kgTp') {
      kgTp += kg;
      lotsTp += 1;
    } else if (band === 'kgMedium') {
      kgMedium += kg;
      lotsMedium += 1;
    } else if (band === 'kgNarrow') {
      kgNarrow += kg;
      lotsNarrow += 1;
    } else {
      kgWide += kg;
      lotsWide += 1;
    }
    if (typeof lot.payUsd === 'number' && Number.isFinite(lot.payUsd)) {
      pays.push(lot.payUsd);
    }
  }
  pays.sort((a, b) => a - b);

  let cargoStockKg = 0;
  let cargoCapacityKg = 0;
  const commodities: HubEconomyCommoditySample[] = CAREER_CARGO_COMMODITIES.map(
    (c) => {
      const pile = airport.inventory?.[c.id];
      const stock = pile ?? { stockKg: 0, capacityKg: 0 };
      cargoStockKg += Math.max(0, stock.stockKg ?? 0);
      cargoCapacityKg += Math.max(0, stock.capacityKg ?? 0);
      return {
        id: c.id,
        fill: fillOf(stock),
        spotUsd: localUnitPriceUsd(c.id, stock),
        stockKg: Math.max(0, stock.stockKg ?? 0),
        capacityKg: Math.max(0, stock.capacityKg ?? 0),
      };
    },
  );

  const fuelPile = airport.inventory?.fuel;
  const activityScore =
    typeof airport.activityScore === 'number' && Number.isFinite(airport.activityScore)
      ? airport.activityScore
      : 40;
  const levelInfo = hubLevelXpProgress(airport);
  const region = (airport.region ?? '').trim();

  return {
    icao,
    dayIndex: economyDayIndex(world.tick),
    tick: world.tick,
    countryId: countryIdFromRegion(region) || 'XX',
    region: region || 'XX',
    hubTier: resolveHubTier(airport),
    activityScore,
    hubLevel: levelInfo.level,
    quiet: activityScore < HUB_STATS_QUIET_ACTIVITY_SCORE,
    jetAFill: fillOf(fuelPile),
    outboundLots: lots.length,
    outboundKg,
    payP50Usd: percentileSorted(pays, 0.5),
    payP10Usd: pays.length >= 2 ? percentileSorted(pays, 0.1) : null,
    payP90Usd: pays.length >= 2 ? percentileSorted(pays, 0.9) : null,
    kgGa,
    kgTp,
    kgMedium,
    kgNarrow,
    kgWide,
    lotsGa,
    lotsTp,
    lotsMedium,
    lotsNarrow,
    lotsWide,
    cargoStockKg,
    cargoCapacityKg,
    inboundKg: hubInboundCargoKg(world, icao),
    commodities,
  };
}

/**
 * One sample per cargo hub at the current world tick (call on day boundary).
 */
export function buildHubEconomySamples(
  world: CareerEconomyWorld,
): HubEconomySample[] {
  const byOrigin = outboundLotsByOrigin(world.lots);
  const out: HubEconomySample[] = [];
  for (const ap of world.airports ?? []) {
    const sample = buildHubEconomySampleForAirport(
      world,
      ap,
      byOrigin.get(ap.icao.trim().toUpperCase()) ?? [],
    );
    if (sample) out.push(sample);
  }
  return out;
}

/**
 * If this tick crossed an economy-day boundary, append samples to
 * `world.pendingHubEconomySamples` (flushed by saveEconomy → SQL).
 */
export function maybeQueueHubEconomyDaySample(world: CareerEconomyWorld): void {
  if (world.tick <= 0) return;
  const day = economyDayIndex(world.tick);
  const prevDay = economyDayIndex(world.tick - 1);
  if (day === prevDay) return;
  const pending = world.pendingHubEconomySamples ?? [];
  // Idempotent if finish/save retries the same tick.
  if (pending.some((s) => s.dayIndex === day)) return;
  const samples = buildHubEconomySamples(world);
  if (samples.length === 0) return;
  pending.push(...samples);
  world.pendingHubEconomySamples = pending;
}
