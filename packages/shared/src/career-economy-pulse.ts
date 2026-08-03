/**
 * Read-only economy health snapshot for Career debug (CLI / API).
 * Does not mutate the world.
 */
import {
  CAREER_CARGO_COMMODITIES,
} from './career-economy.js';
import { describeLotMarketPressure } from './career-npc.js';
import {
  countryIdFromRegion,
  isDomesticOd,
  listWorldCountryIds,
} from './career-partition.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

/** Same quiet threshold as airport API / hub-level soft neglect. */
const QUIET_ACTIVITY_SCORE = 8;

const DEAD_HUB_ICAO_CAP = 20;

/** Soft health hint thresholds (advisory notes only). */
const LIVE_HUB_PCT_LOW = 0.25;
const INTL_SHARE_HIGH = 0.25;
const LANE_BUSY_HIGH = 0.5;
const DEAD_HUB_PCT_HIGH = 0.4;

export interface EconomyPulseCountry {
  countryId: string;
  hubs: number;
  availableLots: number;
  /** Hubs with ≥1 originating available lot (0 for INTL). */
  liveHubPct: number;
  /** Median of per-airport mean cargo fill; null if no hubs. */
  fillP50: number | null;
  payPerKgP50: number | null;
  /** Share of this bucket's available lots with laneBusy. */
  laneBusyPct: number;
  deadHubs: number;
  quietHubs: number;
  deadHubIcaos: string[];
}

export interface EconomyPulse {
  tick: number;
  homeCountryId: string | null;
  airportCount: number;
  availableLots: number;
  /** International available lots / all available. */
  intlSharePct: number;
  countries: EconomyPulseCountry[];
  notes: string[];
}

function fillPct(stock: StockPile): number {
  return stock.capacityKg > 0 ? stock.stockKg / stock.capacityKg : 0;
}

export function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function leftoverKg(lot: ShipmentLot): number {
  if (lot.status !== 'available') return 0;
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function airportMeanFill(ap: AirportTerminal): number {
  const fills: number[] = [];
  for (const commodity of CAREER_CARGO_COMMODITIES) {
    const pile = ap.inventory?.[commodity.id];
    if (!pile) continue;
    fills.push(fillPct(pile));
  }
  if (fills.length === 0) return 0;
  return fills.reduce((a, b) => a + b, 0) / fills.length;
}

function lotBucketId(
  lot: ShipmentLot,
  byIcao: Map<string, AirportTerminal>,
): string {
  const origin = byIcao.get(lot.originIcao.toUpperCase());
  const dest = byIcao.get(lot.destIcao.toUpperCase());
  const originRegion = origin?.region ?? '';
  const destRegion = dest?.region ?? '';
  if (originRegion && destRegion && !isDomesticOd(originRegion, destRegion)) {
    return 'INTL';
  }
  if (originRegion) return countryIdFromRegion(originRegion);
  return countryIdFromRegion(destRegion || 'XX');
}

function emptyCountry(countryId: string, hubs: number): EconomyPulseCountry {
  return {
    countryId,
    hubs,
    availableLots: 0,
    liveHubPct: 0,
    fillP50: null,
    payPerKgP50: null,
    laneBusyPct: 0,
    deadHubs: 0,
    quietHubs: 0,
    deadHubIcaos: [],
  };
}

function buildNotes(
  pulse: Omit<EconomyPulse, 'notes'>,
  countryHubs: Map<string, AirportTerminal[]>,
): string[] {
  const notes: string[] = [];
  const realCountries = pulse.countries.filter((c) => c.countryId !== 'INTL');

  for (const c of realCountries) {
    if (c.hubs > 0 && c.liveHubPct < LIVE_HUB_PCT_LOW) {
      notes.push(
        `${c.countryId}: only ${(c.liveHubPct * 100).toFixed(0)}% of hubs have originating freights`,
      );
    }
    if (c.laneBusyPct > LANE_BUSY_HIGH && c.availableLots > 0) {
      notes.push(
        `${c.countryId}: ${(c.laneBusyPct * 100).toFixed(0)}% of lots are on busy lanes`,
      );
    }
    const hubs = countryHubs.get(c.countryId) ?? [];
    const spokeN = hubs.filter((a) => a.hubTier === 'spoke').length;
    const deadDenom = spokeN > 0 ? spokeN : c.hubs;
    if (deadDenom > 0 && c.deadHubs / deadDenom > DEAD_HUB_PCT_HIGH) {
      notes.push(
        `${c.countryId}: ${c.deadHubs} hubs with no originating lots (of ${c.hubs})`,
      );
    }
  }

  if (realCountries.length >= 2) {
    if (pulse.intlSharePct === 0) {
      notes.push('No international freights on the board');
    } else if (pulse.intlSharePct > INTL_SHARE_HIGH) {
      notes.push(
        `International freights are ${(pulse.intlSharePct * 100).toFixed(0)}% of the board`,
      );
    }
  }

  return notes;
}

/**
 * Aggregate a read-only health pulse for the career cargo economy.
 */
export function computeEconomyPulse(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): EconomyPulse {
  const byIcao = new Map<string, AirportTerminal>();
  for (const ap of world.airports ?? []) {
    byIcao.set(ap.icao.toUpperCase(), ap);
  }

  const countryIds = listWorldCountryIds(world);
  const countryHubs = new Map<string, AirportTerminal[]>();
  for (const id of countryIds) {
    countryHubs.set(id, []);
  }
  for (const ap of world.airports ?? []) {
    const id = countryIdFromRegion(ap.region ?? '');
    const list = countryHubs.get(id);
    if (list) list.push(ap);
    else countryHubs.set(id, [ap]);
  }

  type LotAcc = {
    lots: ShipmentLot[];
    payPerKg: number[];
    busy: number;
  };
  const lotAcc = new Map<string, LotAcc>();
  const ensureAcc = (id: string): LotAcc => {
    let acc = lotAcc.get(id);
    if (!acc) {
      acc = { lots: [], payPerKg: [], busy: 0 };
      lotAcc.set(id, acc);
    }
    return acc;
  };
  for (const id of countryIds) ensureAcc(id);
  ensureAcc('INTL');

  const originLotCount = new Map<string, number>();
  let availableLots = 0;
  let intlLots = 0;

  for (const lot of world.lots ?? []) {
    if (leftoverKg(lot) <= 0) continue;
    availableLots += 1;
    const bucket = lotBucketId(lot, byIcao);
    if (bucket === 'INTL') intlLots += 1;
    const acc = ensureAcc(bucket);
    acc.lots.push(lot);
    const qty = lot.quantityKg > 0 ? lot.quantityKg : 0;
    if (qty > 0) acc.payPerKg.push(lot.payUsd / qty);
    const pressure = describeLotMarketPressure(world, lot, nowMs);
    if (pressure.laneBusy) acc.busy += 1;
    const originKey = lot.originIcao.toUpperCase();
    originLotCount.set(originKey, (originLotCount.get(originKey) ?? 0) + 1);
  }

  const countries: EconomyPulseCountry[] = [];

  for (const countryId of countryIds) {
    const hubs = countryHubs.get(countryId) ?? [];
    const acc = lotAcc.get(countryId) ?? { lots: [], payPerKg: [], busy: 0 };
    const fills = hubs.map(airportMeanFill);
    const liveHubs = hubs.filter(
      (ap) => (originLotCount.get(ap.icao.toUpperCase()) ?? 0) > 0,
    ).length;
    const deadIcaos = hubs
      .filter((ap) => (originLotCount.get(ap.icao.toUpperCase()) ?? 0) === 0)
      .map((ap) => ap.icao)
      .sort();
    const quietHubs = hubs.filter(
      (ap) => (ap.activityScore ?? 40) < QUIET_ACTIVITY_SCORE,
    ).length;
    const n = acc.lots.length;
    countries.push({
      countryId,
      hubs: hubs.length,
      availableLots: n,
      liveHubPct: hubs.length > 0 ? liveHubs / hubs.length : 0,
      fillP50: median(fills),
      payPerKgP50: median(acc.payPerKg),
      laneBusyPct: n > 0 ? acc.busy / n : 0,
      deadHubs: deadIcaos.length,
      quietHubs,
      deadHubIcaos: deadIcaos.slice(0, DEAD_HUB_ICAO_CAP),
    });
  }

  const intlAcc = lotAcc.get('INTL') ?? { lots: [], payPerKg: [], busy: 0 };
  const intlN = intlAcc.lots.length;
  countries.push({
    ...emptyCountry('INTL', 0),
    availableLots: intlN,
    payPerKgP50: median(intlAcc.payPerKg),
    laneBusyPct: intlN > 0 ? intlAcc.busy / intlN : 0,
  });

  countries.sort((a, b) => {
    if (a.countryId === 'INTL') return 1;
    if (b.countryId === 'INTL') return -1;
    return a.countryId.localeCompare(b.countryId);
  });

  const intlSharePct = availableLots > 0 ? intlLots / availableLots : 0;
  const base: Omit<EconomyPulse, 'notes'> = {
    tick: world.tick,
    homeCountryId: world.homeCountryId ?? null,
    airportCount: world.airports?.length ?? 0,
    availableLots,
    intlSharePct,
    countries,
  };

  return {
    ...base,
    notes: buildNotes(base, countryHubs),
  };
}
