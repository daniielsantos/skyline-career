/**
 * Daily dynamic international freight lanes.
 *
 * Every country is eligible, but only a bounded gateway graph is active on a
 * given economy day. Selection follows live surplus/shortage pressure, keeps
 * country and country-pair caps, and retains lanes that still own active lots.
 */

import { TICKS_PER_DAY } from './career-clock.js';
import { countryIdFromRegion } from './career-partition.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityId,
  HubTier,
  InternationalLane,
} from './types/career-economy.js';

export const DYNAMIC_INTL_GATEWAYS_PER_COUNTRY = 3;
export const DYNAMIC_INTL_MIN_LANES_PER_COUNTRY = 2;
export const DYNAMIC_INTL_MAX_LANES_PER_COUNTRY = 6;
export const DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR = 2;
export const DYNAMIC_INTL_LANES_MIN = 96;
export const DYNAMIC_INTL_LANES_MAX = 480;
export const DYNAMIC_INTL_LANES_PER_COUNTRY = 2.25;
export const DYNAMIC_INTL_LONG_HAUL_SHARE = 0.2;
export const DYNAMIC_INTL_LONG_HAUL_MIN_NM = 2_500;
export const DYNAMIC_INTL_MIN_ROUTE_NM = 60;
export const DYNAMIC_INTL_MAX_ROUTE_NM = 6_500;

const LANE_COMMODITIES: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
  'perishables',
];

type LaneCandidate = {
  a: AirportTerminal;
  b: AirportTerminal;
  countryA: string;
  countryB: string;
  countryPairKey: string;
  odKey: string;
  nm: number;
  score: number;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashUnit(seed: string): number {
  return hashSeed(seed) / 4294967296;
}

function tierOf(ap: AirportTerminal): HubTier {
  return ap.hubTier === 'major' ||
    ap.hubTier === 'regional' ||
    ap.hubTier === 'spoke'
    ? ap.hubTier
    : 'spoke';
}

function tierScore(tier: HubTier): number {
  if (tier === 'major') return 3;
  if (tier === 'regional') return 2;
  return 1;
}

function greatCircleNm(a: AirportTerminal, b: AirportTerminal): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function countryPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function odKey(a: string, b: string): string {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function gatewayPressure(a: AirportTerminal, b: AirportTerminal): number {
  let best = 0;
  for (const commodityId of LANE_COMMODITIES) {
    const stockA = a.inventory[commodityId];
    const stockB = b.inventory[commodityId];
    if (!stockA?.capacityKg || !stockB?.capacityKg) continue;
    const fillA = stockA.stockKg / stockA.capacityKg;
    const fillB = stockB.stockKg / stockB.capacityKg;
    const aToB = Math.max(0, fillA - 0.5) * Math.max(0, 0.5 - fillB);
    const bToA = Math.max(0, fillB - 0.5) * Math.max(0, 0.5 - fillA);
    best = Math.max(best, aToB, bToA);
  }
  return Math.min(1, best * 8);
}

function gatewayRows(
  world: Pick<CareerEconomyWorld, 'airports' | 'seed'>,
  day: number,
): Map<string, AirportTerminal[]> {
  const byCountry = new Map<string, AirportTerminal[]>();
  for (const ap of world.airports) {
    if (ap.bush === true || ap.bushTripOnly === true) continue;
    const country = countryIdFromRegion(ap.region ?? '');
    if (!/^[A-Z]{2}$/.test(country) || country === 'XX') continue;
    const list = byCountry.get(country);
    if (list) list.push(ap);
    else byCountry.set(country, [ap]);
  }
  for (const [country, rows] of byCountry) {
    rows.sort((a, b) => {
      const qualityA =
        tierScore(tierOf(a)) * 10 +
        Math.max(1, a.level ?? 1) +
        hashUnit(`${world.seed}:${day}:gateway:${country}:${a.icao}`);
      const qualityB =
        tierScore(tierOf(b)) * 10 +
        Math.max(1, b.level ?? 1) +
        hashUnit(`${world.seed}:${day}:gateway:${country}:${b.icao}`);
      return qualityB - qualityA || a.icao.localeCompare(b.icao);
    });
    rows.splice(DYNAMIC_INTL_GATEWAYS_PER_COUNTRY);
  }
  return byCountry;
}

function laneCapacityKgPerDay(a: AirportTerminal, b: AirportTerminal): number {
  const lowerTier = Math.min(tierScore(tierOf(a)), tierScore(tierOf(b)));
  const base = lowerTier >= 3 ? 90_000 : lowerTier >= 2 ? 55_000 : 30_000;
  const levelMult = 0.85 + Math.min(5, ((a.level ?? 1) + (b.level ?? 1)) / 2) * 0.05;
  return Math.round((base * levelMult) / 1_000) * 1_000;
}

function candidateScore(
  world: Pick<CareerEconomyWorld, 'seed'>,
  day: number,
  a: AirportTerminal,
  b: AirportTerminal,
  nm: number,
): number {
  const pressure = gatewayPressure(a, b);
  const gatewayQuality = (tierScore(tierOf(a)) + tierScore(tierOf(b))) / 6;
  const distanceBand =
    nm >= DYNAMIC_INTL_LONG_HAUL_MIN_NM
      ? 0.9
      : nm >= 700
        ? 1
        : 0.82;
  const jitter = hashUnit(`${world.seed}:${day}:lane:${odKey(a.icao, b.icao)}`);
  return pressure * 5 + gatewayQuality * 2 + distanceBand + jitter * 1.5;
}

function buildCandidates(
  world: Pick<CareerEconomyWorld, 'airports' | 'seed'>,
  day: number,
): { countries: string[]; candidates: LaneCandidate[] } {
  const gateways = gatewayRows(world, day);
  const countries = [...gateways.keys()].sort();
  const candidates: LaneCandidate[] = [];
  for (let i = 0; i < countries.length; i += 1) {
    const countryA = countries[i]!;
    for (let j = i + 1; j < countries.length; j += 1) {
      const countryB = countries[j]!;
      const pairCandidates: LaneCandidate[] = [];
      for (const a of gateways.get(countryA) ?? []) {
        for (const b of gateways.get(countryB) ?? []) {
          const nm = greatCircleNm(a, b);
          if (
            nm < DYNAMIC_INTL_MIN_ROUTE_NM ||
            nm > DYNAMIC_INTL_MAX_ROUTE_NM
          ) {
            continue;
          }
          pairCandidates.push({
            a,
            b,
            countryA,
            countryB,
            countryPairKey: countryPairKey(countryA, countryB),
            odKey: odKey(a.icao, b.icao),
            nm,
            score: candidateScore(world, day, a, b, nm),
          });
        }
      }
      pairCandidates.sort(
        (a, b) => b.score - a.score || a.odKey.localeCompare(b.odKey),
      );
      candidates.push(
        ...pairCandidates.slice(0, DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR),
      );
    }
  }
  candidates.sort(
    (a, b) => b.score - a.score || a.odKey.localeCompare(b.odKey),
  );
  return { countries, candidates };
}

export function dynamicInternationalLaneTarget(countryCount: number): number {
  if (countryCount < 2) return 0;
  return Math.min(
    DYNAMIC_INTL_LANES_MAX,
    Math.max(
      DYNAMIC_INTL_LANES_MIN,
      Math.round(countryCount * DYNAMIC_INTL_LANES_PER_COUNTRY),
    ),
  );
}

export function selectDynamicInternationalLanes(
  world: Pick<CareerEconomyWorld, 'airports' | 'seed' | 'tick'>,
): InternationalLane[] {
  const day = Math.floor(Math.max(0, world.tick) / TICKS_PER_DAY);
  const { countries, candidates } = buildCandidates(world, day);
  const target = Math.min(
    dynamicInternationalLaneTarget(countries.length),
    candidates.length,
  );
  if (target <= 0) return [];

  const selected: LaneCandidate[] = [];
  const selectedOds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  const canSelect = (candidate: LaneCandidate): boolean =>
    !selectedOds.has(candidate.odKey) &&
    (countryCounts.get(candidate.countryA) ?? 0) <
      DYNAMIC_INTL_MAX_LANES_PER_COUNTRY &&
    (countryCounts.get(candidate.countryB) ?? 0) <
      DYNAMIC_INTL_MAX_LANES_PER_COUNTRY &&
    (pairCounts.get(candidate.countryPairKey) ?? 0) <
      DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR;

  const add = (candidate: LaneCandidate): boolean => {
    if (!canSelect(candidate) || selected.length >= target) return false;
    selected.push(candidate);
    selectedOds.add(candidate.odKey);
    countryCounts.set(
      candidate.countryA,
      (countryCounts.get(candidate.countryA) ?? 0) + 1,
    );
    countryCounts.set(
      candidate.countryB,
      (countryCounts.get(candidate.countryB) ?? 0) + 1,
    );
    pairCounts.set(
      candidate.countryPairKey,
      (pairCounts.get(candidate.countryPairKey) ?? 0) + 1,
    );
    return true;
  };

  // Fairness first: give every reachable country two active links before the
  // highest-pressure countries consume the global lane budget.
  for (let pass = 0; pass < DYNAMIC_INTL_MIN_LANES_PER_COUNTRY; pass += 1) {
    const rotation =
      countries.length > 0 ? hashSeed(`${world.seed}:${day}:country-order`) % countries.length : 0;
    const ordered = [
      ...countries.slice(rotation),
      ...countries.slice(0, rotation),
    ];
    for (const country of ordered) {
      if ((countryCounts.get(country) ?? 0) > pass) continue;
      const candidate = candidates.find(
        (row) =>
          (row.countryA === country || row.countryB === country) &&
          canSelect(row),
      );
      if (candidate) add(candidate);
    }
  }

  // Keep a real long-haul shelf instead of letting nearby pairs consume every
  // slot. The normal score fill below still decides the remainder.
  const longHaulTarget = Math.round(target * DYNAMIC_INTL_LONG_HAUL_SHARE);
  let longHaulSelected = selected.filter(
    (row) => row.nm >= DYNAMIC_INTL_LONG_HAUL_MIN_NM,
  ).length;
  if (longHaulSelected < longHaulTarget) {
    for (const candidate of candidates) {
      if (selected.length >= target || longHaulSelected >= longHaulTarget) break;
      if (candidate.nm < DYNAMIC_INTL_LONG_HAUL_MIN_NM) continue;
      if (add(candidate)) longHaulSelected += 1;
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= target) break;
    add(candidate);
  }

  return selected.map((row) => {
    const leftFirst = row.a.icao.localeCompare(row.b.icao) <= 0;
    const origin = leftFirst ? row.a : row.b;
    const dest = leftFirst ? row.b : row.a;
    const originCountryId = leftFirst ? row.countryA : row.countryB;
    const destCountryId = leftFirst ? row.countryB : row.countryA;
    return {
      id: `dyn_d${day}_${origin.icao.toLowerCase()}_${dest.icao.toLowerCase()}`,
      originCountryId,
      destCountryId,
      originIcao: origin.icao,
      destIcao: dest.icao,
      capacityKgPerDay: laneCapacityKgPerDay(origin, dest),
    };
  });
}

function isActiveLotStatus(status: string): boolean {
  return status === 'available' || status === 'reserved' || status === 'in_transit';
}

/**
 * Refresh once per economy day. Active-lot ODs survive as carry-over lanes so
 * an accepted or aging freight never becomes illegal at midnight.
 */
export function ensureDynamicInternationalLanes(
  world: CareerEconomyWorld,
): boolean {
  const day = Math.floor(Math.max(0, world.tick) / TICKS_PER_DAY);
  const currentPrefix = `dyn_d${day}_`;
  const carryPrefix = `carry_d${day}_`;
  const existing = world.internationalLanes ?? [];
  if (
    existing.some(
      (lane) =>
        lane.id.startsWith(currentPrefix) || lane.id.startsWith(carryPrefix),
    )
  ) {
    return false;
  }

  const dailyCandidates = selectDynamicInternationalLanes(world);
  const carryLanes: InternationalLane[] = [];
  const byOd = new Map<string, InternationalLane>();
  const countryByIcao = new Map(
    world.airports.map((ap) => [
      ap.icao.trim().toUpperCase(),
      countryIdFromRegion(ap.region ?? ''),
    ]),
  );
  const oldByOd = new Map(
    existing.map((lane) => [odKey(lane.originIcao, lane.destIcao), lane]),
  );

  for (const lot of world.lots ?? []) {
    if (!isActiveLotStatus(lot.status)) continue;
    const origin = lot.originIcao.trim().toUpperCase();
    const dest = lot.destIcao.trim().toUpperCase();
    const originCountryId = countryByIcao.get(origin);
    const destCountryId = countryByIcao.get(dest);
    if (
      !originCountryId ||
      !destCountryId ||
      originCountryId === destCountryId
    ) {
      continue;
    }
    const key = odKey(origin, dest);
    if (byOd.has(key)) continue;
    const old = oldByOd.get(key);
    const carryLane: InternationalLane = {
      id: `carry_d${day}_${origin.toLowerCase()}_${dest.toLowerCase()}`,
      originCountryId,
      destCountryId,
      originIcao: origin,
      destIcao: dest,
      capacityKgPerDay: old?.capacityKgPerDay ?? 30_000,
    };
    carryLanes.push(carryLane);
    byOd.set(key, carryLane);
  }

  const countryCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const lane of carryLanes) {
    countryCounts.set(
      lane.originCountryId,
      (countryCounts.get(lane.originCountryId) ?? 0) + 1,
    );
    countryCounts.set(
      lane.destCountryId,
      (countryCounts.get(lane.destCountryId) ?? 0) + 1,
    );
    const pair = countryPairKey(lane.originCountryId, lane.destCountryId);
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }

  const countries = [
    ...new Set(
      [...countryByIcao.values()].filter(
        (country) => /^[A-Z]{2}$/.test(country) && country !== 'XX',
      ),
    ),
  ].sort();
  const target = Math.max(
    carryLanes.length,
    dynamicInternationalLaneTarget(countries.length),
  );
  const selected: InternationalLane[] = [];
  const canAdd = (lane: InternationalLane): boolean => {
    const key = odKey(lane.originIcao, lane.destIcao);
    const pair = countryPairKey(lane.originCountryId, lane.destCountryId);
    return (
      !byOd.has(key) &&
      (countryCounts.get(lane.originCountryId) ?? 0) <
        DYNAMIC_INTL_MAX_LANES_PER_COUNTRY &&
      (countryCounts.get(lane.destCountryId) ?? 0) <
        DYNAMIC_INTL_MAX_LANES_PER_COUNTRY &&
      (pairCounts.get(pair) ?? 0) <
        DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR
    );
  };
  const add = (lane: InternationalLane): boolean => {
    if (
      carryLanes.length + selected.length >= target ||
      !canAdd(lane)
    ) {
      return false;
    }
    const key = odKey(lane.originIcao, lane.destIcao);
    const pair = countryPairKey(lane.originCountryId, lane.destCountryId);
    selected.push(lane);
    byOd.set(key, lane);
    countryCounts.set(
      lane.originCountryId,
      (countryCounts.get(lane.originCountryId) ?? 0) + 1,
    );
    countryCounts.set(
      lane.destCountryId,
      (countryCounts.get(lane.destCountryId) ?? 0) + 1,
    );
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    return true;
  };

  // Carry-over consumes the same caps, but countries without enough surviving
  // ODs get first choice from today's graph before pressure fills the remainder.
  for (let pass = 0; pass < DYNAMIC_INTL_MIN_LANES_PER_COUNTRY; pass += 1) {
    for (const country of countries) {
      if ((countryCounts.get(country) ?? 0) > pass) continue;
      const lane = dailyCandidates.find(
        (candidate) =>
          (candidate.originCountryId === country ||
            candidate.destCountryId === country) &&
          canAdd(candidate),
      );
      if (lane) add(lane);
    }
  }

  for (const lane of dailyCandidates) {
    if (carryLanes.length + selected.length >= target) break;
    add(lane);
  }

  world.internationalLanes = [...carryLanes, ...selected];
  return true;
}
