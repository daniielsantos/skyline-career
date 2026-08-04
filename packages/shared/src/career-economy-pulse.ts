/**
 * Read-only economy health snapshot for Career debug (CLI / API).
 * Does not mutate the world.
 */
import { CAREER_CARGO_COMMODITIES, tickEconomyN } from './career-economy.js';
import { TICKS_PER_DAY } from './career-clock.js';
import { describeLotMarketPressure } from './career-npc.js';
import {
  countryIdFromRegion,
  isDomesticOd,
  listWorldCountryIds,
} from './career-partition.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityId,
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

/** Align with market formation surplus/shortage cutoffs. */
const SURPLUS_FILL = 0.55;
const SHORTAGE_FILL = 0.45;

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

export interface EconomyPulseLotStatus {
  available: number;
  reserved: number;
  in_transit: number;
  expired: number;
  delivered: number;
  other: number;
}

export interface EconomyPulseCommodity {
  commodityId: CommodityId;
  availableLots: number;
  /** Median inventory fill across hubs that stock this commodity. */
  fillP50: number | null;
  payPerKgP50: number | null;
  /** Median contract value (payUsd) for bookable leftovers. */
  payUsdP50: number | null;
  /** Mean contract value (payUsd) for bookable leftovers. */
  payUsdAvg: number | null;
  /** Hubs with fill ≥ surplus cutoff (export pressure). */
  hubsSurplus: number;
  /** Hubs with fill ≤ shortage cutoff (import pressure). */
  hubsShortage: number;
}

export interface EconomyPulse {
  tick: number;
  homeCountryId: string | null;
  airportCount: number;
  availableLots: number;
  /** International available lots / all available. */
  intlSharePct: number;
  /** Median contract payUsd across bookable leftovers. */
  payUsdP50: number | null;
  /** Mean contract payUsd across bookable leftovers. */
  payUsdAvg: number | null;
  lotStatus: EconomyPulseLotStatus;
  commodities: EconomyPulseCommodity[];
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

export function mean(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
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

function emptyLotStatus(): EconomyPulseLotStatus {
  return {
    available: 0,
    reserved: 0,
    in_transit: 0,
    expired: 0,
    delivered: 0,
    other: 0,
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

  if (pulse.availableLots > 0) {
    const dry = pulse.commodities.filter((c) => c.availableLots === 0);
    if (dry.length > 0 && dry.length < pulse.commodities.length) {
      notes.push(
        `No bookable lots for: ${dry.map((c) => c.commodityId).join(', ')}`,
      );
    }
    for (const c of pulse.commodities) {
      if (c.hubsSurplus > 0 && c.hubsShortage === 0 && c.availableLots === 0) {
        notes.push(
          `${c.commodityId}: surplus hubs but no bookable freights (blocked lanes or formation)`,
        );
      }
      if (c.hubsShortage > 0 && c.hubsSurplus === 0 && c.availableLots > 8) {
        notes.push(
          `${c.commodityId}: many freights but almost no surplus hubs — check stock bias`,
        );
      }
    }
  }

  const booked =
    pulse.lotStatus.reserved + pulse.lotStatus.in_transit;
  const liveBoard = pulse.lotStatus.available;
  if (booked > 0 && liveBoard > 0 && booked > liveBoard * 2) {
    notes.push(
      `More reserved/in-transit (${booked}) than bookable leftovers (${liveBoard})`,
    );
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
  const boardPayUsd: number[] = [];
  const lotStatus = emptyLotStatus();

  type CommodityAcc = {
    payPerKg: number[];
    payUsd: number[];
    fills: number[];
    hubsSurplus: number;
    hubsShortage: number;
  };
  const commodityAcc = new Map<CommodityId, CommodityAcc>();
  for (const def of CAREER_CARGO_COMMODITIES) {
    commodityAcc.set(def.id, {
      payPerKg: [],
      payUsd: [],
      fills: [],
      hubsSurplus: 0,
      hubsShortage: 0,
    });
  }

  for (const ap of world.airports ?? []) {
    for (const def of CAREER_CARGO_COMMODITIES) {
      const pile = ap.inventory?.[def.id];
      if (!pile || pile.capacityKg <= 0) continue;
      const fill = fillPct(pile);
      const acc = commodityAcc.get(def.id)!;
      acc.fills.push(fill);
      if (fill >= SURPLUS_FILL) acc.hubsSurplus += 1;
      if (fill <= SHORTAGE_FILL) acc.hubsShortage += 1;
    }
  }

  for (const lot of world.lots ?? []) {
    switch (lot.status) {
      case 'available':
        lotStatus.available += 1;
        break;
      case 'reserved':
        lotStatus.reserved += 1;
        break;
      case 'in_transit':
        lotStatus.in_transit += 1;
        break;
      case 'expired':
        lotStatus.expired += 1;
        break;
      case 'delivered':
        lotStatus.delivered += 1;
        break;
      default:
        lotStatus.other += 1;
        break;
    }

    const left = leftoverKg(lot);
    if (left <= 0) continue;
    availableLots += 1;
    boardPayUsd.push(lot.payUsd);
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

    const cAcc = commodityAcc.get(lot.commodityId as CommodityId);
    if (cAcc) {
      cAcc.payUsd.push(lot.payUsd);
      if (qty > 0) cAcc.payPerKg.push(lot.payUsd / qty);
    }
  }

  const commodities: EconomyPulseCommodity[] = CAREER_CARGO_COMMODITIES.map(
    (def) => {
      const acc = commodityAcc.get(def.id)!;
      return {
        commodityId: def.id,
        availableLots: acc.payUsd.length,
        fillP50: median(acc.fills),
        payPerKgP50: median(acc.payPerKg),
        payUsdP50: median(acc.payUsd),
        payUsdAvg: mean(acc.payUsd),
        hubsSurplus: acc.hubsSurplus,
        hubsShortage: acc.hubsShortage,
      };
    },
  );

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
    payUsdP50: median(boardPayUsd),
    payUsdAvg: mean(boardPayUsd),
    lotStatus,
    commodities,
    countries,
  };

  return {
    ...base,
    notes: buildNotes(base, countryHubs),
  };
}

export type EconomyPulseSample = {
  atTick: number;
  sampleIndex: number;
  pulse: EconomyPulse;
};

export type EconomyPulseSweepDelta = {
  availableLots: number;
  payUsdP50: number | null;
  payUsdAvg: number | null;
  intlSharePct: number;
  lotStatus: EconomyPulseLotStatus;
  commodities: Array<{
    commodityId: CommodityId;
    availableLots: number;
    payUsdP50: number | null;
    payUsdAvg: number | null;
    fillP50: number | null;
    hubsSurplus: number;
    hubsShortage: number;
  }>;
};

export type EconomyPulseSweepResult = {
  ticksAdvanced: number;
  sampleEvery: number;
  sampleCount: number;
  startTick: number;
  endTick: number;
  samples: EconomyPulseSample[];
  first: EconomyPulse;
  last: EconomyPulse;
  delta: EconomyPulseSweepDelta;
};

function nullDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return b - a;
}

function lotStatusDelta(
  a: EconomyPulseLotStatus,
  b: EconomyPulseLotStatus,
): EconomyPulseLotStatus {
  return {
    available: b.available - a.available,
    reserved: b.reserved - a.reserved,
    in_transit: b.in_transit - a.in_transit,
    expired: b.expired - a.expired,
    delivered: b.delivered - a.delivered,
    other: b.other - a.other,
  };
}

/**
 * Advance the economy and sample pulse snapshots for balance / trend reports.
 * Mutates `world` via tickEconomyN.
 */
export function sweepEconomyPulse(
  world: CareerEconomyWorld,
  opts: {
    /** Total ticks to advance (default 7 days). */
    ticks?: number;
    /** Sample every N ticks (default 1 day). Always includes start + end. */
    every?: number;
    nowMs?: number;
  } = {},
): EconomyPulseSweepResult {
  const ticks = Math.max(0, Math.floor(opts.ticks ?? TICKS_PER_DAY * 7));
  const every = Math.max(1, Math.floor(opts.every ?? TICKS_PER_DAY));
  const nowMs = opts.nowMs ?? Date.now();
  const startTick = world.tick;
  const samples: EconomyPulseSample[] = [];

  const pushSample = (sampleIndex: number) => {
    samples.push({
      atTick: world.tick,
      sampleIndex,
      pulse: computeEconomyPulse(world, nowMs),
    });
  };

  pushSample(0);
  let advanced = 0;
  let sampleIndex = 1;
  while (advanced < ticks) {
    const step = Math.min(every, ticks - advanced);
    tickEconomyN(world, step, { fromBatchAtMs: world.lastBatchAtMs });
    advanced += step;
    pushSample(sampleIndex);
    sampleIndex += 1;
  }

  const first = samples[0]!.pulse;
  const last = samples[samples.length - 1]!.pulse;
  const byId = new Map(first.commodities.map((c) => [c.commodityId, c]));

  return {
    ticksAdvanced: advanced,
    sampleEvery: every,
    sampleCount: samples.length,
    startTick,
    endTick: world.tick,
    samples,
    first,
    last,
    delta: {
      availableLots: last.availableLots - first.availableLots,
      payUsdP50: nullDelta(first.payUsdP50, last.payUsdP50),
      payUsdAvg: nullDelta(first.payUsdAvg, last.payUsdAvg),
      intlSharePct: last.intlSharePct - first.intlSharePct,
      lotStatus: lotStatusDelta(first.lotStatus, last.lotStatus),
      commodities: last.commodities.map((c) => {
        const prev = byId.get(c.commodityId);
        return {
          commodityId: c.commodityId,
          availableLots: c.availableLots - (prev?.availableLots ?? 0),
          payUsdP50: nullDelta(prev?.payUsdP50 ?? null, c.payUsdP50),
          payUsdAvg: nullDelta(prev?.payUsdAvg ?? null, c.payUsdAvg),
          fillP50: nullDelta(prev?.fillP50 ?? null, c.fillP50),
          hubsSurplus: c.hubsSurplus - (prev?.hubsSurplus ?? 0),
          hubsShortage: c.hubsShortage - (prev?.hubsShortage ?? 0),
        };
      }),
    },
  };
}
