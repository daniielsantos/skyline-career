/**
 * Daily dynamic international freight lanes.
 *
 * Every country is eligible, but only a bounded gateway graph is active on a
 * given economy day. Selection follows live surplus/shortage pressure, keeps
 * hub-count–proportional country caps (+ pair caps), and retains lanes that
 * still own active lots.
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

/**
 * Absolute gateway ceiling (proportional budget never exceeds this).
 * @deprecated Prefer {@link intlGatewayBudget}; kept for Pulse/docs aliases.
 */
export const DYNAMIC_INTL_GATEWAYS_PER_COUNTRY = 24;
export const DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MIN = 2;
export const DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MAX = 24;
/** ~1 gateway per 12 cargo hubs (ceil), clamped to min/max. */
export const DYNAMIC_INTL_GATEWAYS_HUBS_PER_SLOT = 12;

export const DYNAMIC_INTL_MIN_LANES_PER_COUNTRY = 2;
/**
 * Absolute per-country lane ceiling (proportional budget never exceeds this).
 * Soft cap so US/BR can densify without one country eating the whole graph.
 */
export const DYNAMIC_INTL_MAX_LANES_PER_COUNTRY = 120;
export const DYNAMIC_INTL_LANES_PER_COUNTRY_MIN = 2;
export const DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX = 120;

/** Neighbor densify without opening every OD (Ship B alvo). */
export const DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR = 5;
export const DYNAMIC_INTL_LANES_MIN = 96;
/** Ship B alvo: world graph teto. */
export const DYNAMIC_INTL_LANES_MAX = 1_000;
/** Ship B alvo: target ≈ countryCount × this, clipped by LANES_MAX. */
export const DYNAMIC_INTL_LANES_PER_COUNTRY = 5.5;
/**
 * Regional intl band ceiling (neighbor / same-continent scale).
 * Product 2026-09-18: most lanes should sit at or below this nm.
 */
export const DYNAMIC_INTL_REGIONAL_MAX_NM = 2_500;
/** Below this, short cross-border hops get a mild score penalty. */
export const DYNAMIC_INTL_REGIONAL_MIN_NM = 400;
/** Ultra / intercontinental trunk floor. */
export const DYNAMIC_INTL_ULTRA_MIN_NM = 4_000;
/** Soft floor: keep a thin Wide/ocean shelf after regional fill. */
export const DYNAMIC_INTL_ULTRA_SHARE_MIN = 0.08;
/** Hard ceiling: ultra lanes must not dominate the daily graph. */
export const DYNAMIC_INTL_ULTRA_SHARE_MAX = 0.18;
/** Soft floor: majority of daily lanes should be regional-band. */
export const DYNAMIC_INTL_REGIONAL_SHARE_MIN = 0.55;
/**
 * @deprecated Alias of {@link DYNAMIC_INTL_REGIONAL_MAX_NM} (legacy long-haul floor nm).
 */
export const DYNAMIC_INTL_LONG_HAUL_MIN_NM = DYNAMIC_INTL_REGIONAL_MAX_NM;
/**
 * @deprecated Was long-haul floor share; now mirrors ultra ceiling for pulse/docs.
 */
export const DYNAMIC_INTL_LONG_HAUL_SHARE = DYNAMIC_INTL_ULTRA_SHARE_MAX;
export const DYNAMIC_INTL_MIN_ROUTE_NM = 60;
export const DYNAMIC_INTL_MAX_ROUTE_NM = 6_500;

/**
 * Order directed intl formation attempts so every origin country gets interleaved
 * turns (shortest-first within country). Pure nm-sort worldwide lets short-border
 * countries burn global INTL skipAll before longer regional ODs elsewhere —
 * starving `pilot-intl` shelves for BR/US/AU/… alike.
 */
export function orderIntlDirsOriginRoundRobin<
  T extends {
    originCountryId: string;
    nm: number;
    originIcao: string;
    destIcao: string;
  },
>(dirs: readonly T[]): T[] {
  if (dirs.length <= 1) return dirs.slice();
  const byCountry = new Map<string, T[]>();
  for (const dir of dirs) {
    const raw = dir.originCountryId.trim().toUpperCase();
    const key = /^[A-Z]{2}$/.test(raw) ? raw : 'XX';
    const list = byCountry.get(key);
    if (list) list.push(dir);
    else byCountry.set(key, [dir]);
  }
  for (const list of byCountry.values()) {
    list.sort(
      (a, b) =>
        a.nm - b.nm ||
        a.originIcao.localeCompare(b.originIcao) ||
        a.destIcao.localeCompare(b.destIcao),
    );
  }
  const countries = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));
  const heads = countries.map(() => 0);
  const queues = countries.map((c) => byCountry.get(c)!);
  const out: T[] = [];
  let remaining = dirs.length;
  while (remaining > 0) {
    let progressed = false;
    for (let i = 0; i < queues.length; i += 1) {
      const q = queues[i]!;
      const h = heads[i]!;
      if (h >= q.length) continue;
      out.push(q[h]!);
      heads[i] = h + 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return out;
}

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

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Gateway slots for a country from cargo hub count (non-bush).
 * ceil(hubN / 12), clamped to [2, 24].
 */
export function intlGatewayBudget(hubN: number): number {
  const n = Math.max(0, Math.floor(Number(hubN) || 0));
  return clampInt(
    Math.ceil(n / DYNAMIC_INTL_GATEWAYS_HUBS_PER_SLOT),
    DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MIN,
    DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MAX,
  );
}

/**
 * Max lane involvements (origin or dest) for a country.
 *
 * With world totals: each country gets a floor of 2, then a hub-share of the
 * remaining involvement pool (`2 × LANES_MAX − countries × 2`), clamped to
 * {@link DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX}. This keeps tiny countries
 * thin while letting BR/US absorb enough slots to fill the world teto.
 *
 * Without totals (unit/docs): legacy linear `round(2 + 0.14 × hubN)` capped 24.
 */
export function intlLaneBudget(
  hubN: number,
  opts?: { totalCargoHubs?: number; countryCount?: number },
): number {
  const n = Math.max(0, Math.floor(Number(hubN) || 0));
  const total = opts?.totalCargoHubs;
  const countries = opts?.countryCount;
  if (
    typeof total === 'number' &&
    total > 0 &&
    typeof countries === 'number' &&
    countries > 0
  ) {
    const base = DYNAMIC_INTL_LANES_PER_COUNTRY_MIN;
    const extraPool = Math.max(
      0,
      DYNAMIC_INTL_LANES_MAX * 2 - countries * base,
    );
    const extra = Math.round((n / total) * extraPool);
    return clampInt(
      base + extra,
      base,
      DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX,
    );
  }
  return clampInt(Math.round(2 + n * 0.14), 2, 24);
}

/** Non-bush cargo hub counts keyed by ISO country id. */
export function cargoHubCountByCountry(
  world: Pick<CareerEconomyWorld, 'airports'>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ap of world.airports) {
    if (ap.bush === true || ap.bushTripOnly === true) continue;
    const country = countryIdFromRegion(ap.region ?? '');
    if (!/^[A-Z]{2}$/.test(country) || country === 'XX') continue;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return counts;
}

function laneBudgetByCountry(
  hubCounts: Map<string, number>,
): Map<string, number> {
  let totalCargoHubs = 0;
  for (const n of hubCounts.values()) totalCargoHubs += n;
  const countryCount = hubCounts.size;
  const budgets = new Map<string, number>();
  for (const [country, hubN] of hubCounts) {
    budgets.set(
      country,
      intlLaneBudget(hubN, { totalCargoHubs, countryCount }),
    );
  }
  return budgets;
}

function gatewayPressure(a: AirportTerminal, b: AirportTerminal): number {
  let best = 0;
  for (const commodityId of LANE_COMMODITIES) {
    const stockA = a.inventory?.[commodityId];
    const stockB = b.inventory?.[commodityId];
    if (
      !stockA ||
      !stockB ||
      stockA.capacityKg <= 0 ||
      stockB.capacityKg <= 0
    ) {
      continue;
    }
    const fillA = stockA.stockKg / stockA.capacityKg;
    const fillB = stockB.stockKg / stockB.capacityKg;
    const aToB = Math.max(0, fillA - 0.5) * Math.max(0, 0.5 - fillB);
    const bToA = Math.max(0, fillB - 0.5) * Math.max(0, 0.5 - fillA);
    best = Math.max(best, aToB, bToA);
  }
  return Math.min(1, best * 8);
}

/**
 * Pacific remote US regions soft-capped inside the shared US intl gateway
 * budget. PR/VI stay uncapped (Caribbean feeders for SE). Without this,
 * 6 territory majors compete 1:1 with continentals for 12 slots and
 * `pilot-intl` at KMIA fills with PGSN/NSTU/PGUM/PHNL.
 */
export const US_PACIFIC_REMOTE_REGIONS = new Set([
  'US-AS',
  'US-MP',
  'US-GU',
  'US-HI',
]);

/** Max Pacific remote gateways inside the US country budget (of up to 24). */
export const US_PACIFIC_REMOTE_GATEWAY_SOFT_CAP = 2;

export function isUsPacificRemoteRegion(region: string): boolean {
  return US_PACIFIC_REMOTE_REGIONS.has(region.trim().toUpperCase());
}

function gatewayQuality(
  world: Pick<CareerEconomyWorld, 'seed'>,
  day: number,
  country: string,
  ap: AirportTerminal,
): number {
  return (
    tierScore(tierOf(ap)) * 10 +
    Math.max(1, ap.level ?? 1) +
    hashUnit(`${world.seed}:${day}:gateway:${country}:${ap.icao}`)
  );
}

/**
 * Ranked intl gateways for one country after budget (+ US Pacific soft-cap).
 * Exported for unit tests / diagnostics.
 */
export function selectCountryIntlGateways(
  world: Pick<CareerEconomyWorld, 'seed'>,
  country: string,
  hubs: AirportTerminal[],
  day: number,
): AirportTerminal[] {
  const ranked = [...hubs].sort(
    (a, b) =>
      gatewayQuality(world, day, country, b) -
        gatewayQuality(world, day, country, a) ||
      a.icao.localeCompare(b.icao),
  );
  const budget = intlGatewayBudget(ranked.length);
  if (country !== 'US') return ranked.slice(0, budget);

  const picked: AirportTerminal[] = [];
  let pacific = 0;
  for (const ap of ranked) {
    if (picked.length >= budget) break;
    const remote = isUsPacificRemoteRegion(ap.region ?? '');
    if (remote && pacific >= US_PACIFIC_REMOTE_GATEWAY_SOFT_CAP) continue;
    if (remote) pacific += 1;
    picked.push(ap);
  }
  return picked;
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
    const picked = selectCountryIntlGateways(world, country, rows, day);
    rows.length = 0;
    rows.push(...picked);
  }
  return byCountry;
}

function laneCapacityKgPerDay(a: AirportTerminal, b: AirportTerminal): number {
  const lowerTier = Math.min(tierScore(tierOf(a)), tierScore(tierOf(b)));
  const base = lowerTier >= 3 ? 90_000 : lowerTier >= 2 ? 55_000 : 30_000;
  const levelMult =
    0.85 + Math.min(5, ((a.level ?? 1) + (b.level ?? 1)) / 2) * 0.05;
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
  // Regional-first: neighbor-scale ODs beat oceans (product 2026-09-18).
  const distanceBand =
    nm >= DYNAMIC_INTL_ULTRA_MIN_NM
      ? 0.55
      : nm > DYNAMIC_INTL_REGIONAL_MAX_NM
        ? 0.78
        : nm >= DYNAMIC_INTL_REGIONAL_MIN_NM
          ? 1.15
          : 0.88;
  const jitter = hashUnit(`${world.seed}:${day}:lane:${odKey(a.icao, b.icao)}`);
  return pressure * 5 + gatewayQuality * 2 + distanceBand + jitter * 1.5;
}

function isRegionalBandNm(nm: number): boolean {
  return nm <= DYNAMIC_INTL_REGIONAL_MAX_NM;
}

function isUltraBandNm(nm: number): boolean {
  return nm >= DYNAMIC_INTL_ULTRA_MIN_NM;
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
  const hubCounts = cargoHubCountByCountry(world);
  const laneBudgets = laneBudgetByCountry(hubCounts);
  const countryCap = (country: string): number =>
    laneBudgets.get(country) ?? DYNAMIC_INTL_LANES_PER_COUNTRY_MIN;

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

  const ultraCount = (): number =>
    selected.filter((row) => isUltraBandNm(row.nm)).length;
  const regionalCount = (): number =>
    selected.filter((row) => isRegionalBandNm(row.nm)).length;
  const ultraCap = Math.max(1, Math.round(target * DYNAMIC_INTL_ULTRA_SHARE_MAX));
  const ultraMin = Math.max(1, Math.round(target * DYNAMIC_INTL_ULTRA_SHARE_MIN));
  const regionalMin = Math.round(target * DYNAMIC_INTL_REGIONAL_SHARE_MIN);

  const canSelect = (
    candidate: LaneCandidate,
    opts: { enforceUltraCap?: boolean } = {},
  ): boolean => {
    if (selectedOds.has(candidate.odKey)) return false;
    if (
      (countryCounts.get(candidate.countryA) ?? 0) >=
        countryCap(candidate.countryA) ||
      (countryCounts.get(candidate.countryB) ?? 0) >=
        countryCap(candidate.countryB) ||
      (pairCounts.get(candidate.countryPairKey) ?? 0) >=
        DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR
    ) {
      return false;
    }
    if (
      opts.enforceUltraCap !== false &&
      isUltraBandNm(candidate.nm) &&
      ultraCount() >= ultraCap
    ) {
      return false;
    }
    return true;
  };

  const add = (
    candidate: LaneCandidate,
    opts: { enforceUltraCap?: boolean } = {},
  ): boolean => {
    if (!canSelect(candidate, opts) || selected.length >= target) return false;
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

  const findForCountry = (
    country: string,
    preferRegional: boolean,
  ): LaneCandidate | undefined => {
    if (preferRegional) {
      const regional = candidates.find(
        (row) =>
          (row.countryA === country || row.countryB === country) &&
          isRegionalBandNm(row.nm) &&
          canSelect(row),
      );
      if (regional) return regional;
    }
    return candidates.find(
      (row) =>
        (row.countryA === country || row.countryB === country) &&
        canSelect(row),
    );
  };

  // Fairness first: prefer regional-band links per country before any distance.
  for (let pass = 0; pass < DYNAMIC_INTL_MIN_LANES_PER_COUNTRY; pass += 1) {
    const rotation =
      countries.length > 0
        ? hashSeed(`${world.seed}:${day}:country-order`) % countries.length
        : 0;
    const ordered = [
      ...countries.slice(rotation),
      ...countries.slice(0, rotation),
    ];
    for (const country of ordered) {
      if ((countryCounts.get(country) ?? 0) > pass) continue;
      const candidate = findForCountry(country, true);
      if (candidate) add(candidate);
    }
  }

  // Regional fill: push neighbor-scale ODs until the majority floor is met.
  if (regionalCount() < regionalMin) {
    for (const candidate of candidates) {
      if (selected.length >= target || regionalCount() >= regionalMin) break;
      if (!isRegionalBandNm(candidate.nm)) continue;
      add(candidate);
    }
  }

  // Thin ultra shelf for Wide/ocean careers — only after regional health.
  if (
    ultraCount() < ultraMin &&
    regionalCount() >= Math.min(regionalMin, selected.length)
  ) {
    for (const candidate of candidates) {
      if (selected.length >= target || ultraCount() >= ultraMin) break;
      if (!isUltraBandNm(candidate.nm)) continue;
      add(candidate, { enforceUltraCap: false });
    }
  }

  // Score fill remainder under ultra ceiling.
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
  const hubCounts = cargoHubCountByCountry(world);
  const laneBudgets = laneBudgetByCountry(hubCounts);
  const countryCap = (country: string): number =>
    laneBudgets.get(country) ?? DYNAMIC_INTL_LANES_PER_COUNTRY_MIN;

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
        countryCap(lane.originCountryId) &&
      (countryCounts.get(lane.destCountryId) ?? 0) <
        countryCap(lane.destCountryId) &&
      (pairCounts.get(pair) ?? 0) < DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR
    );
  };
  const add = (lane: InternationalLane): boolean => {
    if (carryLanes.length + selected.length >= target || !canAdd(lane)) {
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
