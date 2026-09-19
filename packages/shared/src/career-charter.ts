/**
 * Charter passenger economy.
 *
 * Terminal passenger pools (waiting / attract) drive continuous offer formation
 * the way commodity stock imbalances drive freights. Never mutates freight
 * inventory, ShipmentLots, quotas, or NPC state.
 */

import { TICKS_PER_DAY, TICKS_PER_HOUR } from './career-clock.js';
import { countryIdFromRegion } from './career-partition.js';
import { orderIntlDirsOriginRoundRobin } from './career-international-lanes.js';
import { regionalWeatherIndex } from './career-weather.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CharterDemand,
  CharterHubState,
  CharterMissionIntent,
  CharterOffer,
  CharterSettlement,
  CharterTier,
  CharterUrgency,
} from './types/career-economy.js';

export const CHARTER_MIN_DISTANCE_NM = 80;
export const CHARTER_MAX_DISTANCE_NM = 2_000;
/** Soft upper bound for a single offer life (~24h). */
export const CHARTER_OFFER_LIFE_TICKS = TICKS_PER_DAY;
export const CHARTER_OFFER_LIFE_MIN_TICKS = 8 * TICKS_PER_HOUR;
export const CHARTER_OFFER_LIFE_MAX_TICKS = 24 * TICKS_PER_HOUR;
export const CHARTER_DEMAND_RETENTION_DAYS = 45;
export const CHARTER_BAGGAGE_KG_PER_PAX = 18;
/**
 * Soft ceiling on formed group size — matches the largest narrow Market
 * `maxPaxSeats` (Fenix A321 = 230). Fit still gates by airframe seats.
 */
export const CHARTER_GROUP_SIZE_MAX = 230;
/** Baggage kg ceiling = full narrow group × per-pax allowance. */
export const CHARTER_BAGGAGE_MAX_KG =
  CHARTER_GROUP_SIZE_MAX * CHARTER_BAGGAGE_KG_PER_PAX;
export const CHARTER_BOARD_MIN = 120;
/** Hard ceiling on live available offers (formation stops at target or this). */
export const CHARTER_BOARD_MAX = 4_000;
/**
 * Steady-state formation once the board is warm.
 * Sized so form×TTL can approach boardTarget (~hubs*2 / commodity-like)
 * — mean life ~16h ≈ 64 ticks → 48×64 ≈ 3k equilibrium.
 */
export const CHARTER_FORM_QUOTA_PER_TICK = 48;
/** Catch-up when the live board is below MIN. */
export const CHARTER_WARM_QUOTA_PER_TICK = 96;

/**
 * Classes that may accept charter offers.
 * Fit still gates by passenger config, seats, baggage, and range — so a
 * 2-seat GA only sees 1–2 pax groups while narrowbodies can take up to
 * {@link CHARTER_GROUP_SIZE_MAX}. Pure freighters in `narrow_freighter`
 * stay blocked without a passenger config.
 */
export const CHARTER_ELIGIBLE_AIRCRAFT_CLASSES = [
  'light_ga',
  'light_turboprop',
  'light_jet',
  'medium_piston',
  'narrow_freighter',
] as const;

export type CharterEligibleAircraftClass =
  (typeof CHARTER_ELIGIBLE_AIRCRAFT_CLASSES)[number];

export function isCharterEligibleAircraftClass(
  classId: string | null | undefined,
): classId is CharterEligibleAircraftClass {
  return (
    classId === 'light_ga' ||
    classId === 'light_turboprop' ||
    classId === 'light_jet' ||
    classId === 'medium_piston' ||
    classId === 'narrow_freighter'
  );
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceNm(a: AirportTerminal, b: AirportTerminal): number {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function demandId(originIcao: string, destIcao: string): string {
  return `charter-demand:${originIcao.toUpperCase()}:${destIcao.toUpperCase()}`;
}

function activeAirports(world: CareerEconomyWorld): AirportTerminal[] {
  return world.airports.filter(
    (ap) =>
      !ap.bushTripOnly &&
      Number.isFinite(ap.lat) &&
      Number.isFinite(ap.lon),
  );
}

function airportDemandWeight(airport: AirportTerminal): number {
  const tier = airport.hubTier === 'major' ? 4 : airport.hubTier === 'regional' ? 2 : 1;
  const level = clamp(Number(airport.level) || 1, 1, 5);
  const activity = clamp(Number(airport.activityScore) || 0, 0, 100);
  return tier * (0.8 + level * 0.12 + activity / 500);
}

function hubCapacityPax(airport: AirportTerminal): number {
  // Sized so majors can host a full narrow charter group; regionals/spokes
  // still feed the light/med bands without starving pool turnover.
  const base =
    airport.hubTier === 'major'
      ? 280
      : airport.hubTier === 'regional'
        ? 160
        : 64;
  const level = clamp(Number(airport.level) || 1, 1, 5);
  return Math.round(base * (0.85 + level * 0.05));
}

/** Soft pax capacity for a Terminal (waiting and attract share this ceiling). */
export function capacityPaxForAirport(airport: AirportTerminal): number {
  return hubCapacityPax(airport);
}

export type CharterHubPoolView = {
  waitingPax: number;
  attractPax: number;
  capacityPax: number;
  /** 0–1 fill of waiting vs capacity. */
  waitingFillPct: number;
  /** 0–1 fill of attract vs capacity. */
  attractFillPct: number;
  waitingBalance: 'surplus' | 'shortage' | 'balanced';
  attractBalance: 'surplus' | 'shortage' | 'balanced';
  /** Live charter offers originating here. */
  openOffersFrom: number;
  /** Live charter offers destined here. */
  openOffersTo: number;
};

function poolBalance(fill: number): 'surplus' | 'shortage' | 'balanced' {
  if (fill >= 0.58) return 'surplus';
  if (fill <= 0.42) return 'shortage';
  return 'balanced';
}

/** Read-only Terminal passenger pools for UI (does not seed or mutate hubs). */
export function readCharterHubPoolView(
  world: Pick<CareerEconomyWorld, 'charterHubs' | 'charterOffers' | 'tick'>,
  airport: AirportTerminal,
): CharterHubPoolView {
  const icao = airport.icao.trim().toUpperCase();
  const hub = (world.charterHubs ?? []).find(
    (row) => row.icao.trim().toUpperCase() === icao,
  );
  const capacityPax = Math.max(
    hubCapacityPax(airport),
    Math.floor(Number(hub?.capacityPax) || 0),
  );
  const waitingPax = clamp(Math.floor(Number(hub?.waitingPax) || 0), 0, capacityPax);
  const attractPax = clamp(Math.floor(Number(hub?.attractPax) || 0), 0, capacityPax);
  const waitingFillPct = capacityPax > 0 ? waitingPax / capacityPax : 0;
  const attractFillPct = capacityPax > 0 ? attractPax / capacityPax : 0;
  const open = (world.charterOffers ?? []).filter(
    (offer) =>
      offer.status === 'available' &&
      world.tick < offer.expiresAtTick,
  );
  return {
    waitingPax,
    attractPax,
    capacityPax,
    waitingFillPct,
    attractFillPct,
    waitingBalance: poolBalance(waitingFillPct),
    attractBalance: poolBalance(attractFillPct),
    openOffersFrom: open.filter((offer) => offer.originIcao === icao).length,
    openOffersTo: open.filter((offer) => offer.destIcao === icao).length,
  };
}

function chooseTier(rng: () => number, heat: number): CharterTier {
  const roll = rng() + heat / 500;
  if (roll >= 0.9) return 'executive';
  if (roll >= 0.48) return 'premium';
  return 'standard';
}

function chooseUrgency(rng: () => number, heat: number): CharterUrgency {
  const roll = rng() + heat / 400;
  if (roll >= 1.02) return 'urgent';
  if (roll >= 0.62) return 'priority';
  return 'normal';
}

function offerLifeTicks(rng: () => number, urgency: CharterUrgency): number {
  const span = CHARTER_OFFER_LIFE_MAX_TICKS - CHARTER_OFFER_LIFE_MIN_TICKS;
  let life = CHARTER_OFFER_LIFE_MIN_TICKS + Math.floor(rng() * (span + 1));
  if (urgency === 'urgent') life = Math.round(life * 0.72);
  else if (urgency === 'priority') life = Math.round(life * 0.88);
  return clamp(life, CHARTER_OFFER_LIFE_MIN_TICKS, CHARTER_OFFER_LIFE_MAX_TICKS);
}

/** Baggage allowance for the formed group (scales to {@link CHARTER_GROUP_SIZE_MAX}). */
export function charterBaggageKg(groupSize: number): number {
  const pax = clamp(
    Math.floor(Number(groupSize) || 1),
    1,
    CHARTER_GROUP_SIZE_MAX,
  );
  return Math.min(CHARTER_BAGGAGE_MAX_KG, pax * CHARTER_BAGGAGE_KG_PER_PAX);
}

/**
 * Effective pax weight for pay. Linear through 12 (GA/light jet parity), then
 * √ taper so a full narrow (~160–230) pays ~freight-band money — not 5–7×.
 */
export function charterPayPaxWeight(groupSize: number): number {
  const n = clamp(Math.floor(Number(groupSize) || 1), 1, CHARTER_GROUP_SIZE_MAX);
  if (n <= 12) return n;
  return 12 + Math.sqrt(n - 12) * 1.85;
}

/** Transparent trip quote; no freight value or commodity-price input. */
export function quoteCharterPayUsd(opts: {
  distanceNm: number;
  groupSize: number;
  urgency: CharterUrgency;
  tier: CharterTier;
  international: boolean;
}): number {
  const pax = charterPayPaxWeight(opts.groupSize);
  const distance = clamp(opts.distanceNm, CHARTER_MIN_DISTANCE_NM, CHARTER_MAX_DISTANCE_NM);
  const urgencyMult = { normal: 1, priority: 1.22, urgent: 1.48 }[opts.urgency];
  const tierMult = { standard: 1, premium: 1.35, executive: 1.8 }[opts.tier];
  const internationalMult = opts.international ? 1.2 : 1;
  const trip = 650 + pax * 85;
  const distancePay = distance * (3.6 + pax * 0.48);
  return Math.max(
    500,
    Math.round((trip + distancePay) * urgencyMult * tierMult * internationalMult),
  );
}

/**
 * Banded group size so the shelf stays GA-friendly while still spawning
 * med-piston / narrow loads when Terminal pools allow.
 *
 * Deep pools (avail ≥ 49): mostly narrow, then med — otherwise continuous
 * 1–12 drains keep majors forever below the med/narrow thresholds.
 * Mid pools (13–48): prefer med. Shallow: light only.
 */
export function pickCharterGroupSize(
  rng: () => number,
  waiting: number,
  attract: number,
): number {
  const avail = Math.min(
    CHARTER_GROUP_SIZE_MAX,
    Math.floor(waiting),
    Math.floor(attract),
  );
  if (avail < 1) return 0;
  const roll = rng();
  let lo = 1;
  let hi = Math.min(12, avail);
  if (avail >= 49) {
    if (roll < 0.55) {
      lo = 49;
      hi = avail;
    } else if (roll < 0.88) {
      lo = 13;
      hi = Math.min(48, avail);
    } else {
      lo = 1;
      hi = Math.min(12, avail);
    }
  } else if (avail >= 13) {
    if (roll < 0.62) {
      lo = 13;
      hi = avail;
    } else {
      lo = 1;
      hi = Math.min(12, avail);
    }
  }
  if (lo > hi) {
    lo = 1;
    hi = avail;
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function normalizeDemand(raw: CharterDemand): CharterDemand | null {
  const originIcao = String(raw.originIcao ?? '').trim().toUpperCase();
  const destIcao = String(raw.destIcao ?? '').trim().toUpperCase();
  if (!originIcao || !destIcao || originIcao === destIcao) return null;
  return Object.assign(raw, {
    id: String(raw.id || demandId(originIcao, destIcao)),
    originIcao,
    destIcao,
    pressure: clamp(Number(raw.pressure) || 0, 0, 100),
    international: raw.international === true,
    createdAtTick: Math.max(0, Math.floor(Number(raw.createdAtTick) || 0)),
    updatedAtTick: Math.max(0, Math.floor(Number(raw.updatedAtTick) || 0)),
    lastOfferedDay: Math.floor(Number(raw.lastOfferedDay) || 0),
    fulfilledGroups: Math.max(0, Math.floor(Number(raw.fulfilledGroups) || 0)),
    expiredGroups: Math.max(0, Math.floor(Number(raw.expiredGroups) || 0)),
  });
}

function normalizeOffer(raw: CharterOffer): CharterOffer | null {
  const originIcao = String(raw.originIcao ?? '').trim().toUpperCase();
  const destIcao = String(raw.destIcao ?? '').trim().toUpperCase();
  const groupSize = Math.floor(Number(raw.groupSize));
  if (!originIcao || !destIcao || groupSize < 1 || groupSize > CHARTER_GROUP_SIZE_MAX) {
    return null;
  }
  return Object.assign(raw, {
    ...raw,
    id: String(raw.id),
    demandId: String(raw.demandId || demandId(originIcao, destIcao)),
    originIcao,
    destIcao,
    groupSize,
    baggageKg:
      Number.isFinite(Number(raw.baggageKg)) && Number(raw.baggageKg) > 0
        ? clamp(Math.round(Number(raw.baggageKg)), 1, CHARTER_BAGGAGE_MAX_KG)
        : charterBaggageKg(groupSize),
    distanceNm: clamp(Number(raw.distanceNm) || 0, 0, CHARTER_MAX_DISTANCE_NM),
    payUsd: Math.max(0, Math.round(Number(raw.payUsd) || 0)),
    createdAtTick: Math.max(0, Math.floor(Number(raw.createdAtTick) || 0)),
    expiresAtTick: Math.max(0, Math.floor(Number(raw.expiresAtTick) || 0)),
  });
}

function normalizeHub(raw: CharterHubState): CharterHubState | null {
  const icao = String(raw.icao ?? '').trim().toUpperCase();
  if (!icao) return null;
  const capacityPax = Math.max(8, Math.floor(Number(raw.capacityPax) || 24));
  return Object.assign(raw, {
    icao,
    waitingPax: clamp(Math.floor(Number(raw.waitingPax) || 0), 0, capacityPax),
    attractPax: clamp(Math.floor(Number(raw.attractPax) || 0), 0, capacityPax),
    capacityPax,
    updatedAtTick: Math.max(0, Math.floor(Number(raw.updatedAtTick) || 0)),
  });
}

function availableOfferCount(world: CareerEconomyWorld): number {
  return (world.charterOffers ?? []).filter(
    (offer) => offer.status === 'available' && world.tick < offer.expiresAtTick,
  ).length;
}

function boardTarget(world: CareerEconomyWorld): number {
  const hubs = activeAirports(world).length;
  const countries = new Set(
    activeAirports(world)
      .map((ap) => countryIdFromRegion(ap.region))
      .filter(Boolean),
  ).size;
  // Scale with the map: ~2 offers / hub (commodity-like depth vs freights),
  // with a country floor so small saves still breathe. Caps keep charter
  // below the full freight board soft cap (~8.5k).
  const byHubs = Math.round(hubs * 2);
  const byCountries = Math.round(countries * 5);
  return clamp(
    Math.max(byHubs, byCountries),
    CHARTER_BOARD_MIN,
    CHARTER_BOARD_MAX,
  );
}

function hubFor(
  world: CareerEconomyWorld,
  airport: AirportTerminal,
): CharterHubState {
  const icao = airport.icao.toUpperCase();
  let hub = world.charterHubs!.find((row) => row.icao === icao);
  if (hub) {
    hub.capacityPax = Math.max(hub.capacityPax, hubCapacityPax(airport));
    return hub;
  }
  const capacityPax = hubCapacityPax(airport);
  const weight = airportDemandWeight(airport);
  const jitter = hashSeed(`${world.seed}:hub-seed:${icao}`) % 7;
  // Seed deep enough that med/narrow bands can unlock without waiting days.
  const seedFloor = Math.floor(capacityPax * 0.28);
  hub = {
    icao,
    waitingPax: clamp(
      Math.max(seedFloor, Math.floor(weight * 8 + jitter)),
      0,
      capacityPax,
    ),
    attractPax: clamp(
      Math.max(seedFloor, Math.floor(weight * 6 + (jitter % 5))),
      0,
      capacityPax,
    ),
    capacityPax,
    updatedAtTick: world.tick,
  };
  world.charterHubs!.push(hub);
  return hub;
}

function demandFor(
  world: CareerEconomyWorld,
  origin: AirportTerminal,
  dest: AirportTerminal,
): CharterDemand {
  const id = demandId(origin.icao, dest.icao);
  let row = world.charterDemand!.find((candidate) => candidate.id === id);
  if (row) return row;
  row = {
    id,
    originIcao: origin.icao,
    destIcao: dest.icao,
    pressure: 0,
    international:
      countryIdFromRegion(origin.region) !== countryIdFromRegion(dest.region),
    createdAtTick: world.tick,
    updatedAtTick: world.tick,
    lastOfferedDay: -1,
    fulfilledGroups: 0,
    expiredGroups: 0,
  };
  world.charterDemand!.push(row);
  return row;
}

function restoreOfferPax(world: CareerEconomyWorld, offer: CharterOffer): void {
  const byIcao = new Map(activeAirports(world).map((ap) => [ap.icao.toUpperCase(), ap]));
  const originAp = byIcao.get(offer.originIcao);
  const destAp = byIcao.get(offer.destIcao);
  if (originAp) {
    const hub = hubFor(world, originAp);
    hub.waitingPax = clamp(hub.waitingPax + offer.groupSize, 0, hub.capacityPax);
    hub.updatedAtTick = world.tick;
  }
  if (destAp) {
    const hub = hubFor(world, destAp);
    hub.attractPax = clamp(hub.attractPax + offer.groupSize, 0, hub.capacityPax);
    hub.updatedAtTick = world.tick;
  }
}

/** Fold legacy OD pressure into Terminal pools once, then clear the heat. */
function migrateLegacyPressureToHubs(world: CareerEconomyWorld): void {
  if ((world.charterHubs?.length ?? 0) > 0) return;
  const byIcao = new Map(activeAirports(world).map((ap) => [ap.icao.toUpperCase(), ap]));
  for (const demand of world.charterDemand ?? []) {
    if (demand.pressure < 4) continue;
    const originAp = byIcao.get(demand.originIcao);
    const destAp = byIcao.get(demand.destIcao);
    const pax = Math.max(1, Math.round(demand.pressure / 8));
    if (originAp) {
      const hub = hubFor(world, originAp);
      hub.waitingPax = clamp(hub.waitingPax + pax, 0, hub.capacityPax);
      hub.updatedAtTick = world.tick;
    }
    if (destAp) {
      const hub = hubFor(world, destAp);
      hub.attractPax = clamp(hub.attractPax + pax, 0, hub.capacityPax);
      hub.updatedAtTick = world.tick;
    }
    demand.pressure = clamp(demand.pressure * 0.25, 0, 100);
    demand.updatedAtTick = world.tick;
  }
}

/** Sanitize legacy/table rows without seeding or changing freight state. */
export function ensureCharterEconomy(world: CareerEconomyWorld): boolean {
  const demand = (world.charterDemand ?? [])
    .map(normalizeDemand)
    .filter((row): row is CharterDemand => row !== null);
  const offers = (world.charterOffers ?? [])
    .map(normalizeOffer)
    .filter((row): row is CharterOffer => row !== null);
  const hubsRaw = (world.charterHubs ?? [])
    .map(normalizeHub)
    .filter((row): row is CharterHubState => row !== null);
  const hubsByIcao = new Map<string, CharterHubState>();
  for (const hub of hubsRaw) {
    const prev = hubsByIcao.get(hub.icao);
    if (!prev) {
      hubsByIcao.set(hub.icao, hub);
      continue;
    }
    prev.waitingPax = clamp(prev.waitingPax + hub.waitingPax, 0, prev.capacityPax);
    prev.attractPax = clamp(prev.attractPax + hub.attractPax, 0, prev.capacityPax);
    prev.updatedAtTick = Math.max(prev.updatedAtTick, hub.updatedAtTick);
  }
  const hubs = [...hubsByIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
  const changed =
    !Array.isArray(world.charterDemand) ||
    !Array.isArray(world.charterOffers) ||
    !Array.isArray(world.charterHubs) ||
    demand.length !== (world.charterDemand?.length ?? 0) ||
    offers.length !== (world.charterOffers?.length ?? 0) ||
    hubs.length !== (world.charterHubs?.length ?? 0);
  world.charterDemand = demand;
  world.charterOffers = offers;
  world.charterHubs = hubs;
  migrateLegacyPressureToHubs(world);
  return changed;
}

/** Grow / soft-decay Terminal passenger pools each tick. */
export function tickCharterPools(world: CareerEconomyWorld): void {
  ensureCharterEconomy(world);
  const airports = activeAirports(world);
  const rng = mulberry32(hashSeed(`${world.seed}:charter-pools:${world.tick}`));
  for (const airport of airports) {
    const hub = hubFor(world, airport);
    const weight = airportDemandWeight(airport);
    const weather = regionalWeatherIndex(world, airport.region);
    const weatherBoost = weather === 'poor' ? 1.15 : weather === 'marginal' ? 1.05 : 1;
    // ~3× prior gain so majors can reach med/narrow band floors between forms.
    const waitingGain = weight * (0.11 + rng() * 0.16) * weatherBoost;
    const attractGain = weight * (0.09 + rng() * 0.14) * weatherBoost;
    hub.waitingPax = clamp(
      hub.waitingPax + waitingGain - hub.waitingPax * 0.003,
      0,
      hub.capacityPax,
    );
    hub.attractPax = clamp(
      hub.attractPax + attractGain - hub.attractPax * 0.003,
      0,
      hub.capacityPax,
    );
    // Soft floor ~20% capacity — continuous small-form drain otherwise keeps
    // min(waiting,attract) ≤12 forever and med/narrow bands never unlock.
    const floor = Math.floor(hub.capacityPax * 0.2);
    if (floor >= 13) {
      if (hub.waitingPax < floor) {
        hub.waitingPax = Math.min(
          floor,
          hub.waitingPax + Math.max(0.8, (floor - hub.waitingPax) * 0.06),
        );
      }
      if (hub.attractPax < floor) {
        hub.attractPax = Math.min(
          floor,
          hub.attractPax + Math.max(0.8, (floor - hub.attractPax) * 0.06),
        );
      }
    }
    // Keep integer people for formation math.
    hub.waitingPax = Math.floor(hub.waitingPax * 1000) / 1000;
    hub.attractPax = Math.floor(hub.attractPax * 1000) / 1000;
    hub.updatedAtTick = world.tick;
  }
}

/**
 * Form a few imbalance-driven offers this tick.
 * Returns how many new available offers were created.
 */
export function formCharterOffersForTick(
  world: CareerEconomyWorld,
  opts: { quota?: number } = {},
): number {
  ensureCharterEconomy(world);
  const available = availableOfferCount(world);
  const target = boardTarget(world);
  if (available >= CHARTER_BOARD_MAX || available >= target) return 0;

  const quota =
    opts.quota ??
    (available < CHARTER_BOARD_MIN
      ? CHARTER_WARM_QUOTA_PER_TICK
      : CHARTER_FORM_QUOTA_PER_TICK);
  const room = Math.min(quota, CHARTER_BOARD_MAX - available, target - available);
  if (room <= 0) return 0;

  const airports = activeAirports(world);
  const byCountry = new Map<string, AirportTerminal[]>();
  for (const ap of airports) {
    const country = countryIdFromRegion(ap.region);
    if (!country) continue;
    const rows = byCountry.get(country) ?? [];
    rows.push(ap);
    byCountry.set(country, rows);
  }
  for (const rows of byCountry.values()) {
    rows.sort((a, b) => a.icao.localeCompare(b.icao));
  }
  const countries = [...byCountry.keys()].sort();
  const openOd = new Set(
    world
      .charterOffers!.filter((offer) => offer.status === 'available' || offer.status === 'reserved')
      .map((offer) => demandId(offer.originIcao, offer.destIcao)),
  );

  const origins = airports
    .map((ap) => ({ ap, hub: hubFor(world, ap) }))
    .filter((row) => row.hub.waitingPax >= 1)
    .sort(
      (a, b) =>
        b.hub.waitingPax - a.hub.waitingPax ||
        a.ap.icao.localeCompare(b.ap.icao),
    );
  const dests = airports
    .map((ap) => ({ ap, hub: hubFor(world, ap) }))
    .filter((row) => row.hub.attractPax >= 1)
    .sort(
      (a, b) =>
        b.hub.attractPax - a.hub.attractPax ||
        a.ap.icao.localeCompare(b.ap.icao),
    );
  if (origins.length === 0 || dests.length === 0) return 0;

  const rng = mulberry32(hashSeed(`${world.seed}:charter-form:${world.tick}`));
  let formed = 0;
  // When the live board is intl-heavy, bias formation hard toward domestic —
  // but keep a floor for intl so a cold board (share=0) does not lock out
  // international until the first TTL wave.
  const liveDomesticAvailable = (world.charterOffers ?? []).filter(
    (offer) =>
      !offer.international &&
      offer.status === 'available' &&
      world.tick < offer.expiresAtTick,
  ).length;
  const domesticBoardShare =
    available > 0 ? liveDomesticAvailable / available : 0;
  const domesticDeficit = available > 0 && domesticBoardShare < 0.4;
  const wantedDomestic = Math.min(
    room,
    domesticDeficit
      ? Math.max(0, room - Math.max(1, Math.ceil(room * 0.15)))
      : Math.ceil(room * 0.7),
  );

  /** Domestic formation picks a country first (pool-weighted) so large maps
   * like BR are not starved by sampling only the top global hubs. Cap any
   * one country's live domestic share so small maps cannot monopolize slots. */
  const domesticCountryWeights: Array<{ country: string; weight: number }> = [];
  let totalDomesticWaiting = 0;
  for (const country of countries) {
    const local = byCountry.get(country) ?? [];
    if (local.length < 2) continue;
    let waiting = 0;
    let waitingHubs = 0;
    let attractHubs = 0;
    for (const ap of local) {
      const hub = hubFor(world, ap);
      if (hub.waitingPax >= 1) {
        waiting += hub.waitingPax;
        waitingHubs += 1;
      }
      if (hub.attractPax >= 1) attractHubs += 1;
    }
    if (waitingHubs < 1 || attractHubs < 1 || waiting < 1) continue;
    domesticCountryWeights.push({ country, weight: waiting });
    totalDomesticWaiting += waiting;
  }

  const liveDomesticByCountry = new Map<string, number>();
  let liveDomesticTotal = 0;
  for (const offer of world.charterOffers!) {
    if (
      offer.status !== 'available' &&
      offer.status !== 'reserved'
    ) {
      continue;
    }
    if (world.tick >= offer.expiresAtTick && offer.status === 'available') {
      continue;
    }
    if (offer.international) continue;
    const country = countryIdFromRegion(
      airports.find((ap) => ap.icao === offer.originIcao)?.region ?? '',
    );
    if (!country) continue;
    liveDomesticByCountry.set(
      country,
      (liveDomesticByCountry.get(country) ?? 0) + 1,
    );
    liveDomesticTotal += 1;
  }

  const pickDomesticCountry = (): string | null => {
    if (domesticCountryWeights.length === 0 || totalDomesticWaiting <= 0) {
      return null;
    }
    const projectedDomestic = liveDomesticTotal + 1;
    // Large home maps (BR/US) need room on the Domestic filter — 10%/8
    // capped them so the shelf looked empty while intl filled the board.
    const maxPerCountry = Math.max(
      28,
      Math.ceil(projectedDomestic * 0.25),
    );
    const topByPool = [...domesticCountryWeights]
      .sort(
        (a, b) =>
          b.weight - a.weight || a.country.localeCompare(b.country),
      )
      .slice(0, 20);
    // Force coverage of the largest pools first — otherwise RNG + early
    // lock-in can leave BR/US at 0 while a mid-size country fills the board.
    const starvedTop = topByPool.filter(
      (row) => (liveDomesticByCountry.get(row.country) ?? 0) === 0,
    );
    const underFloor = topByPool.filter(
      (row) => (liveDomesticByCountry.get(row.country) ?? 0) < 18,
    );
    const prefer =
      starvedTop.length > 0
        ? starvedTop
        : underFloor.length > 0 && rng() < 0.8
          ? underFloor
          : null;

    const scored: Array<{ country: string; weight: number }> = [];
    for (const row of prefer ?? domesticCountryWeights) {
      const live = liveDomesticByCountry.get(row.country) ?? 0;
      if (!prefer && live >= maxPerCountry) continue;
      if (prefer && live >= maxPerCountry) continue;
      const fairShare =
        (row.weight / totalDomesticWaiting) * Math.max(projectedDomestic, 1);
      const boost = live + 0.5 < fairShare * 0.5 ? 3 : live < fairShare ? 1.5 : 1;
      scored.push({ country: row.country, weight: row.weight * boost });
    }
    const pool =
      scored.length > 0
        ? scored
        : domesticCountryWeights.filter(
            (row) =>
              (liveDomesticByCountry.get(row.country) ?? 0) < maxPerCountry,
          );
    const finalPool = pool.length > 0 ? pool : domesticCountryWeights;
    let total = 0;
    for (const row of finalPool) total += row.weight;
    if (total <= 0) return null;
    let roll = rng() * total;
    for (const row of finalPool) {
      roll -= row.weight;
      if (roll <= 0) return row.country;
    }
    return finalPool[finalPool.length - 1]!.country;
  };

  const noteDomesticFormed = (originIcao: string): void => {
    const country = countryIdFromRegion(
      airports.find((ap) => ap.icao === originIcao)?.region ?? '',
    );
    if (!country) return;
    liveDomesticByCountry.set(
      country,
      (liveDomesticByCountry.get(country) ?? 0) + 1,
    );
    liveDomesticTotal += 1;
  };

  const tryPair = (
    origin: AirportTerminal,
    dest: AirportTerminal,
    international: boolean,
  ): boolean => {
    if (origin.icao === dest.icao) return false;
    const originCountry = countryIdFromRegion(origin.region);
    const destCountry = countryIdFromRegion(dest.region);
    if ((originCountry !== destCountry) !== international) return false;
    const distance = distanceNm(origin, dest);
    if (distance < CHARTER_MIN_DISTANCE_NM || distance > CHARTER_MAX_DISTANCE_NM) {
      return false;
    }
    const od = demandId(origin.icao, dest.icao);
    if (openOd.has(od)) return false;
    const originHub = hubFor(world, origin);
    const destHub = hubFor(world, dest);
    const waiting = Math.floor(originHub.waitingPax);
    const attract = Math.floor(destHub.attractPax);
    if (waiting < 1 || attract < 1) return false;

    const demand = demandFor(world, origin, dest);
    const heat =
      demand.pressure +
      waiting * 2 +
      attract +
      ([origin, dest].reduce((sum, airport) => {
        const weather = regionalWeatherIndex(world, airport.region);
        return sum + (weather === 'poor' ? 12 : weather === 'marginal' ? 4 : 0);
      }, 0));
    const offerRng = mulberry32(
      hashSeed(`${world.seed}:charter:${world.tick}:${demand.id}`),
    );
    const groupSize = pickCharterGroupSize(offerRng, waiting, attract);
    if (groupSize < 1) return false;
    const tier = chooseTier(offerRng, heat);
    const urgency = chooseUrgency(offerRng, heat);
    const life = offerLifeTicks(offerRng, urgency);

    originHub.waitingPax = clamp(originHub.waitingPax - groupSize, 0, originHub.capacityPax);
    destHub.attractPax = clamp(destHub.attractPax - groupSize, 0, destHub.capacityPax);
    originHub.updatedAtTick = world.tick;
    destHub.updatedAtTick = world.tick;

    demand.pressure = clamp(demand.pressure + 1.5 + groupSize * 0.2, 0, 100);
    demand.updatedAtTick = world.tick;
    demand.lastOfferedDay = Math.floor(world.tick / TICKS_PER_DAY);

    const createdAtTick = world.tick;
    const offerId = `charter-offer:${createdAtTick}:${world.charterOffers!.length}:${origin.icao}:${dest.icao}`;
    world.charterOffers!.push({
      id: offerId,
      demandId: demand.id,
      originIcao: origin.icao,
      destIcao: dest.icao,
      groupSize,
      baggageKg: charterBaggageKg(groupSize),
      distanceNm: Math.round(distance),
      tier,
      urgency,
      international: demand.international,
      payUsd: quoteCharterPayUsd({
        distanceNm: distance,
        groupSize,
        urgency,
        tier,
        international: demand.international,
      }),
      createdAtTick,
      expiresAtTick: createdAtTick + life,
      status: 'available',
    });
    openOd.add(od);
    if (!international) noteDomesticFormed(origin.icao);
    return true;
  };

  let domesticFormed = 0;
  let intlFormed = 0;

  type HubRow = { ap: AirportTerminal; hub: CharterHubState };
  type IntlDir = {
    originCountryId: string;
    nm: number;
    originIcao: string;
    destIcao: string;
    origin: AirportTerminal;
    dest: AirportTerminal;
  };

  // Intl candidates: per-origin-country top waiting hubs × attract pool, then
  // origin-country round-robin so short-border hubs cannot monopolize intl slots.
  const originsByCountry = new Map<string, HubRow[]>();
  for (const row of origins) {
    const country = countryIdFromRegion(row.ap.region);
    if (!/^[A-Z]{2}$/.test(country)) continue;
    const list = originsByCountry.get(country);
    if (list) list.push(row);
    else originsByCountry.set(country, [row]);
  }
  const destPool = dests.slice(0, 64);
  const intlDirs: IntlDir[] = [];
  for (const [originCountry, localOrigins] of originsByCountry) {
    for (const originRow of localOrigins.slice(0, 8)) {
      let added = 0;
      for (const destRow of destPool) {
        if (added >= 4) break;
        const destCountry = countryIdFromRegion(destRow.ap.region);
        if (!destCountry || destCountry === originCountry) continue;
        const nm = distanceNm(originRow.ap, destRow.ap);
        if (nm < CHARTER_MIN_DISTANCE_NM || nm > CHARTER_MAX_DISTANCE_NM) {
          continue;
        }
        const od = demandId(originRow.ap.icao, destRow.ap.icao);
        if (openOd.has(od)) continue;
        intlDirs.push({
          originCountryId: originCountry,
          nm,
          originIcao: originRow.ap.icao.toUpperCase(),
          destIcao: destRow.ap.icao.toUpperCase(),
          origin: originRow.ap,
          dest: destRow.ap,
        });
        added += 1;
      }
    }
  }
  const intlQueue = orderIntlDirsOriginRoundRobin(intlDirs);
  let intlQueueIdx = 0;

  const tryNextIntl = (): boolean => {
    while (intlQueueIdx < intlQueue.length) {
      const dir = intlQueue[intlQueueIdx]!;
      intlQueueIdx += 1;
      if (tryPair(dir.origin, dir.dest, true)) return true;
    }
    return false;
  };

  for (let attempt = 0; attempt < room * 60 && formed < room; attempt += 1) {
    const wantDomestic = domesticFormed < wantedDomestic;
    if (wantDomestic) {
      const country = pickDomesticCountry();
      if (!country) continue;
      const local = byCountry.get(country) ?? [];
      const localOrigins = local
        .map((ap) => ({ ap, hub: hubFor(world, ap) }))
        .filter((row) => row.hub.waitingPax >= 1)
        .sort(
          (a, b) =>
            b.hub.waitingPax - a.hub.waitingPax ||
            a.ap.icao.localeCompare(b.ap.icao),
        );
      const localDests = local
        .map((ap) => ({ ap, hub: hubFor(world, ap) }))
        .filter((row) => row.hub.attractPax >= 1)
        .sort(
          (a, b) =>
            b.hub.attractPax - a.hub.attractPax ||
            a.ap.icao.localeCompare(b.ap.icao),
        );
      if (localOrigins.length === 0 || localDests.length === 0) continue;
      const originRow =
        localOrigins[Math.floor(rng() * Math.min(localOrigins.length, 16))]!;
      // Large countries (BR/US) often fail a random OD on range — pick a
      // distance-viable dest instead of wasting the domestic slot on BO/AU luck.
      const viableDests = localDests.filter((row) => {
        if (row.ap.icao === originRow.ap.icao) return false;
        const nm = distanceNm(originRow.ap, row.ap);
        return (
          nm >= CHARTER_MIN_DISTANCE_NM && nm <= CHARTER_MAX_DISTANCE_NM
        );
      });
      if (viableDests.length === 0) continue;
      const destRow =
        viableDests[Math.floor(rng() * Math.min(viableDests.length, 16))]!;
      if (tryPair(originRow.ap, destRow.ap, false)) {
        formed += 1;
        domesticFormed += 1;
      }
    } else {
      if (countries.length < 2) break;
      if (tryNextIntl()) {
        formed += 1;
        intlFormed += 1;
      } else {
        // Fair intl queue exhausted — leave remaining room to domestic fallback.
        break;
      }
    }
  }

  // Fallback: prefer unfinished domestic countries, then remaining fair intl.
  if (formed < room) {
    for (const { country } of domesticCountryWeights) {
      if (formed >= room) break;
      const local = byCountry.get(country) ?? [];
      const localOrigins = local
        .map((ap) => ({ ap, hub: hubFor(world, ap) }))
        .filter((row) => row.hub.waitingPax >= 1)
        .sort(
          (a, b) =>
            b.hub.waitingPax - a.hub.waitingPax ||
            a.ap.icao.localeCompare(b.ap.icao),
        )
        .slice(0, 12);
      const localDests = local
        .map((ap) => ({ ap, hub: hubFor(world, ap) }))
        .filter((row) => row.hub.attractPax >= 1)
        .sort(
          (a, b) =>
            b.hub.attractPax - a.hub.attractPax ||
            a.ap.icao.localeCompare(b.ap.icao),
        )
        .slice(0, 12);
      for (const originRow of localOrigins) {
        if (formed >= room) break;
        for (const destRow of localDests) {
          if (formed >= room) break;
          if (tryPair(originRow.ap, destRow.ap, false)) formed += 1;
        }
      }
    }
  }
  if (formed < room) {
    while (formed < room && tryNextIntl()) {
      formed += 1;
      intlFormed += 1;
    }
  }

  return formed;
}

/**
 * Test helper: grow Terminal pools and form up to the board target in one burst.
 * Production uses `tickCharterEconomy` (slow continuous path).
 */
export function generateDailyCharterOffers(
  world: CareerEconomyWorld,
  _day = Math.floor(world.tick / TICKS_PER_DAY),
): number {
  ensureCharterEconomy(world);
  for (const airport of activeAirports(world)) hubFor(world, airport);
  for (let i = 0; i < 12; i += 1) tickCharterPools(world);
  const before = availableOfferCount(world);
  formCharterOffersForTick(world, { quota: boardTarget(world) });
  return availableOfferCount(world) - before;
}

/** Expire open offers and return their passengers to Terminal pools. */
export function expireCharterOffers(world: CareerEconomyWorld): number {
  ensureCharterEconomy(world);
  const demandById = new Map(world.charterDemand!.map((row) => [row.id, row]));
  let expired = 0;
  for (const offer of world.charterOffers!) {
    if (offer.status !== 'available' || world.tick < offer.expiresAtTick) continue;
    offer.status = 'expired';
    restoreOfferPax(world, offer);
    const demand = demandById.get(offer.demandId);
    if (demand) {
      demand.pressure = clamp(demand.pressure + 4 + offer.groupSize * 0.8, 0, 100);
      demand.expiredGroups += 1;
      demand.updatedAtTick = world.tick;
    }
    expired += 1;
  }
  return expired;
}

function pruneCharterEconomy(world: CareerEconomyWorld): void {
  const offerCutoff = world.tick - 2 * TICKS_PER_DAY;
  world.charterOffers = world.charterOffers!.filter(
    (offer) =>
      offer.status === 'available' ||
      offer.status === 'reserved' ||
      offer.createdAtTick >= offerCutoff,
  );
  const activeDemandIds = new Set(world.charterOffers.map((offer) => offer.demandId));
  const demandCutoff = world.tick - CHARTER_DEMAND_RETENTION_DAYS * TICKS_PER_DAY;
  world.charterDemand = world.charterDemand!.filter(
    (row) =>
      activeDemandIds.has(row.id) ||
      row.pressure >= 8 ||
      row.updatedAtTick >= demandCutoff,
  );
  const liveIcaos = new Set(activeAirports(world).map((ap) => ap.icao.toUpperCase()));
  world.charterHubs = world.charterHubs!.filter(
    (hub) =>
      liveIcaos.has(hub.icao) &&
      (hub.waitingPax > 0.05 ||
        hub.attractPax > 0.05 ||
        hub.updatedAtTick >= world.tick - TICKS_PER_DAY * 7),
  );
}

/** Tick hook. Uses a charter-only seed and never consumes freight RNG. */
export function tickCharterEconomy(world: CareerEconomyWorld): void {
  ensureCharterEconomy(world);
  expireCharterOffers(world);
  tickCharterPools(world);
  formCharterOffersForTick(world);
  pruneCharterEconomy(world);
}

/** Reserve the entire passenger group and create a backward-compatible mission. */
export function reserveCharterOffer(
  world: CareerEconomyWorld,
  opts: {
    offerId: string;
    missionId: string;
    aircraftClassId?: CharterMissionIntent['aircraftClassId'];
    rolesPackRelPath?: string;
    aircraftId?: string;
    airframeTypeId?: string;
    airframeConfigurationId?: string;
  },
): CharterMissionIntent {
  ensureCharterEconomy(world);
  const offer = world.charterOffers!.find((row) => row.id === opts.offerId);
  if (!offer) throw new Error(`Unknown charter offer ${opts.offerId}`);
  if (offer.status !== 'available') {
    throw new Error(`Charter offer ${opts.offerId} is not available`);
  }
  if (world.tick >= offer.expiresAtTick) {
    expireCharterOffers(world);
    throw new Error(`Charter offer ${opts.offerId} has expired`);
  }
  offer.status = 'reserved';
  offer.missionId = opts.missionId;
  return {
    id: opts.missionId,
    missionType: 'charter',
    lots: [],
    shipmentLotId: `charter_${offer.id}`,
    commodityId: 'general',
    originIcao: offer.originIcao,
    destIcao: offer.destIcao,
    cargoKg: 0,
    pax: offer.groupSize,
    baggageKg: offer.baggageKg,
    aircraftClassId: opts.aircraftClassId ?? 'light_jet',
    ...(opts.aircraftId ? { aircraftId: opts.aircraftId } : {}),
    ...(opts.airframeTypeId ? { airframeTypeId: opts.airframeTypeId } : {}),
    ...(opts.airframeConfigurationId
      ? { airframeConfigurationId: opts.airframeConfigurationId }
      : {}),
    rolesPackRelPath: opts.rolesPackRelPath ?? 'profiles/ofp/light-jet-class.json',
    deadlineTick: offer.expiresAtTick,
    payUsd: offer.payUsd,
    urgency: offer.urgency === 'normal' ? 'normal' : 'urgent',
    reason: `Charter · ${offer.tier} · ${offer.groupSize} pax`,
    charterOfferId: offer.id,
    charterDemandId: offer.demandId,
    charterTier: offer.tier,
    status: 'accepted',
    acceptedAtTick: world.tick,
    distanceNm: offer.distanceNm,
  };
}

/** Charter settlement is independent of freight delivery and terminal stock. */
export function settleCharterMission(
  world: CareerEconomyWorld,
  mission: CharterMissionIntent,
  opts: {
    settledAtTick?: number;
    payoutUsd?: number;
    penaltyUsd?: number;
    lateTicks?: number;
    weatherBonusUsd?: number;
  } = {},
): { mission: CharterMissionIntent; settlement: CharterSettlement; walletCreditUsd: number } {
  ensureCharterEconomy(world);
  if (mission.missionType !== 'charter') throw new Error('Mission is not a charter');
  const offer = world.charterOffers!.find((row) => row.id === mission.charterOfferId);
  if (!offer) throw new Error(`Unknown charter offer ${mission.charterOfferId}`);
  if (offer.status !== 'reserved' || offer.missionId !== mission.id) {
    throw new Error(`Charter offer ${offer.id} is not reserved by mission ${mission.id}`);
  }
  const demand = world.charterDemand!.find((row) => row.id === offer.demandId);
  if (!demand) throw new Error(`Unknown charter demand ${offer.demandId}`);
  const settledAtTick = opts.settledAtTick ?? world.tick;
  const pressureBefore = demand.pressure;
  // Passengers were reserved from Terminal pools at formation — settle consumes them.
  demand.pressure = clamp(demand.pressure - (8 + offer.groupSize * 2.5), 0, 100);
  demand.fulfilledGroups += 1;
  demand.updatedAtTick = settledAtTick;
  offer.status = 'completed';
  const lateTicks =
    opts.lateTicks ?? Math.max(0, settledAtTick - mission.deadlineTick);
  const penaltyUsd = Math.max(0, Math.round(opts.penaltyUsd ?? 0));
  const payoutUsd = Math.max(
    0,
    Math.round(opts.payoutUsd ?? offer.payUsd - penaltyUsd),
  );
  const weatherBonusUsd = Math.max(
    0,
    Math.round(opts.weatherBonusUsd ?? 0),
  );
  const settledMission: CharterMissionIntent = {
    ...mission,
    status: 'settled',
    settledAtTick,
    payoutUsd,
    penaltyUsd,
    lateTicks,
    settledWeatherBonusUsd:
      weatherBonusUsd > 0 ? weatherBonusUsd : mission.settledWeatherBonusUsd,
  };
  return {
    mission: settledMission,
    walletCreditUsd: payoutUsd,
    settlement: {
      settlementType: 'charter',
      missionId: mission.id,
      offerId: offer.id,
      demandId: demand.id,
      passengerCount: offer.groupSize,
      baggageKg: offer.baggageKg,
      payoutUsd,
      settledAtTick,
      pressureBefore,
      pressureAfter: demand.pressure,
      penaltyUsd,
      lateTicks,
      onTime: lateTicks === 0,
      deliveredKg: 0,
      originStockAfterKg: 0,
      destStockAfterKg: 0,
      ...(weatherBonusUsd > 0 ? { weatherBonusUsd } : {}),
    },
  };
}

export interface ReleaseCharterOfferResult {
  offer: CharterOffer;
  releasedToAvailable: boolean;
}

/**
 * Release a whole reserved passenger group. Validation completes before any
 * mutation so callers cannot partially release an indivisible charter.
 */
export function releaseCharterOffer(
  world: CareerEconomyWorld,
  opts: {
    offerId: string;
    missionId: string;
    atTick?: number;
    /** Permanently withdraw the offer instead of returning it to the board. */
    cancelOffer?: boolean;
  },
): ReleaseCharterOfferResult {
  ensureCharterEconomy(world);
  const offer = world.charterOffers!.find((row) => row.id === opts.offerId);
  if (!offer) throw new Error(`Unknown charter offer ${opts.offerId}`);
  if (offer.status !== 'reserved' || offer.missionId !== opts.missionId) {
    throw new Error(`Charter offer ${offer.id} is not reserved by mission ${opts.missionId}`);
  }
  const atTick = opts.atTick ?? world.tick;
  const demand = world.charterDemand!.find((row) => row.id === offer.demandId);
  if (atTick >= offer.expiresAtTick && !demand) {
    throw new Error(`Unknown charter demand ${offer.demandId}`);
  }

  delete offer.missionId;
  if (opts.cancelOffer) {
    offer.status = 'cancelled';
    restoreOfferPax(world, offer);
    return { offer, releasedToAvailable: false };
  }
  if (atTick < offer.expiresAtTick) {
    offer.status = 'available';
    return { offer, releasedToAvailable: true };
  }
  offer.status = 'expired';
  restoreOfferPax(world, offer);
  demand!.pressure = clamp(demand!.pressure + 4 + offer.groupSize * 0.8, 0, 100);
  demand!.expiredGroups += 1;
  demand!.updatedAtTick = atTick;
  return { offer, releasedToAvailable: false };
}

/** Cancel the mission and release its complete passenger group atomically. */
export function cancelCharterMission(
  world: CareerEconomyWorld,
  mission: CharterMissionIntent,
  opts: { cancelledAtTick?: number; cancelOffer?: boolean } = {},
): { mission: CharterMissionIntent; offer: CharterOffer; releasedToAvailable: boolean } {
  if (mission.missionType !== 'charter') throw new Error('Mission is not a charter');
  if (mission.status === 'settled' || mission.status === 'cancelled') {
    throw new Error(`Mission ${mission.id} cannot be cancelled from ${mission.status}`);
  }
  const released = releaseCharterOffer(world, {
    offerId: mission.charterOfferId,
    missionId: mission.id,
    atTick: opts.cancelledAtTick,
    cancelOffer: opts.cancelOffer,
  });
  return {
    mission: {
      ...mission,
      status: 'cancelled',
    },
    offer: released.offer,
    releasedToAvailable: released.releasedToAvailable,
  };
}
