import {
  CAREER_HUB_COORDS,
  hubTierOf,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import {
  AIRCRAFT_DELIVERY_MAX_USD,
  AIRCRAFT_DELIVERY_MIN_USD,
  AIRCRAFT_DELIVERY_USD_PER_NM,
  FERRY_CLASS_MULT,
  resolvePlayerFuelCapacityKg,
} from './career-fleet.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { assertFerryNotBush, isBushHub } from './career-bush.js';
import {
  applyAircraftHoursAfterMission,
  conditionPctsForListing,
  ensureAircraftConditionPcts,
  evaluateAircraftMaintenanceGate,
  hoursUntilInspection,
  INSPECTION_INTERVAL_HOURS,
} from './career-aircraft-maintenance.js';
import {
  AIRCRAFT_MSRP_USD,
  CONDITION_PRICE_MULT,
  resolveAircraftLeaseMonthlyUsd,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';
import { TICKS_PER_DAY } from './career-clock.js';
import { applyWalletDelta } from './career-ledger.js';
import {
  CARGO_OPS_DRY_IDS,
  normalizeCareerCargoOps,
} from './career-cargo-ops.js';
import {
  assertClassOpsUnlocked,
  syncClassOpsFromFleet,
} from './career-class-ops.js';
import {
  findCareerPlayerAirframe,
  listCareerPlayerAirframes,
} from './career-player-airframes.js';
import {
  allocateAircraftRegistration,
  collectUsedAircraftRegistrations,
  countryIdForHubIcao,
  ensureAircraftRegistrations,
  normalizeAircraftRegistration,
  registrationForListingPurchase,
} from './career-aircraft-registration.js';
import { economyDayIndex } from './career-weather.js';
import type {
  AircraftListing,
  AircraftListingKind,
  AircraftListingSource,
  AirframeCondition,
  CareerCargoOps,
  CareerMissionsState,
  FreighterClassId,
  NpcFreighter,
  PlayerAircraft,
} from './types/career-economy.js';

export {
  AIRCRAFT_LEASE_MONTHLY_RATE,
  AIRCRAFT_MSRP_USD,
  CONDITION_PRICE_MULT,
  cargoMsrpMultiplier,
  resolveAircraftLeaseMonthlyUsd,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';

export {
  applyAircraftHoursAfterMission,
  clearAircraftMaintenance,
  fuelBurnMultFromAircraft,
  fuelBurnMultFromCondition,
  padOfpBlockFuelKgForMx,
  inspectionCostUsd,
  maintenanceCostUsd,
  repairAircraftCondition,
  hoursUntilInspection,
  ensureAircraftConditionPcts,
  CRITICAL_CONDITION_PCT,
  MX_FUEL_BURN_MULT_MAX,
  INSPECTION_INTERVAL_HOURS,
  INSPECTION_INTERVAL_HOURS as MAINTENANCE_INTERVAL_HOURS,
} from './career-aircraft-maintenance.js';

const CLASS_ORDER: FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
];

const TICKS_PER_MONTH = TICKS_PER_DAY * 30;
const LISTING_LIFE_TICKS = TICKS_PER_DAY * 5;
const PLAYER_LISTING_LIFE_TICKS = TICKS_PER_DAY * 7;

/**
 * Clean Dry freights (general + supplies settlesOk) required before leasing.
 * Buy stays cash-only; Market browse stays open.
 */
export const LEASE_UNLOCK_CLEAN_DRY_SETTLES = 8;

export type AircraftLeaseUnlockProgress = {
  current: number;
  required: number;
  remaining: number;
  unlocked: boolean;
  hint: string;
};

/** Sum of clean Dry settles (general + supplies) from Cargo Ops. */
export function dryCleanSettlesOk(
  cargoOps: CareerCargoOps | undefined | null,
): number {
  const ops = normalizeCareerCargoOps(cargoOps ?? undefined);
  let sum = 0;
  for (const id of CARGO_OPS_DRY_IDS) {
    sum += ops.commodities[id]?.settlesOk ?? 0;
  }
  return sum;
}

export function isAircraftLeaseUnlocked(
  state: Pick<CareerMissionsState, 'cargoOps'>,
): boolean {
  return dryCleanSettlesOk(state.cargoOps) >= LEASE_UNLOCK_CLEAN_DRY_SETTLES;
}

export function aircraftLeaseUnlockProgress(
  state: Pick<CareerMissionsState, 'cargoOps'>,
): AircraftLeaseUnlockProgress {
  const required = LEASE_UNLOCK_CLEAN_DRY_SETTLES;
  const current = dryCleanSettlesOk(state.cargoOps);
  const unlocked = current >= required;
  const remaining = Math.max(0, required - current);
  const hint = unlocked
    ? `Lease unlocked (${current}/${required} clean Dry freights).`
    : `Lease locked — ${current}/${required} clean Dry freights. Finish Crew needed on time (score ≥70). Buy still requires the aircraft class to be unlocked.`;
  return { current, required, remaining, unlocked, hint };
}

function assertAircraftLeaseUnlocked(
  state: Pick<CareerMissionsState, 'cargoOps'>,
): void {
  const progress = aircraftLeaseUnlockProgress(state);
  if (progress.unlocked) return;
  throw new Error(
    `Lease unlocks after ${progress.required} clean Dry freights (on-time). Progress: ${progress.current}/${progress.required} — fly Crew needed or Dry lots.`,
  );
}

/**
 * Seed Dry settlesOk for tests / debug (does not touch rep).
 */
export function seedDryCleanSettlesForTests(
  state: CareerMissionsState,
  total: number,
): void {
  const ops = normalizeCareerCargoOps(state.cargoOps);
  const n = Math.max(0, Math.floor(total));
  const half = Math.floor(n / 2);
  ops.commodities.general.settlesOk = half;
  ops.commodities.supplies.settlesOk = n - half;
  state.cargoOps = ops;
}
/**
 * Estimated utilization while a player airframe is wet-leased out.
 * Calibrated so a 12‑mo term wears the asset without wiping it.
 */
export const LEASE_OUT_HOURS_PER_MONTH: Record<FreighterClassId, number> = {
  light_ga: 28,
  light_turboprop: 36,
  light_jet: 42,
  medium_piston: 44,
  narrow_freighter: 48,
  wide_freighter: 55,
};

function allocateAircraftRegistrationFromMarket(opts: {
  world: CareerEconomyWorld;
  basedIcao: string;
  used: Set<string>;
  seedHint: string;
  rng: () => number;
}): string {
  return allocateAircraftRegistration({
    countryId: countryIdForHubIcao(opts.basedIcao, opts.world),
    used: opts.used,
    rng: opts.rng,
    seedHint: opts.seedHint,
  });
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]!;
}

function listingSource(listing: AircraftListing): AircraftListingSource {
  return listing.source ?? 'generated';
}

function isPlayerListing(listing: AircraftListing): boolean {
  const src = listingSource(listing);
  return src === 'player_sale' || src === 'player_lease';
}

function maxCargoKgForAirframe(
  airframeTypeId: string | null | undefined,
): number | undefined {
  const cargo = findCareerPlayerAirframe(airframeTypeId)?.maxCargoKg;
  return typeof cargo === 'number' && Number.isFinite(cargo) && cargo > 0
    ? cargo
    : undefined;
}

export function aircraftMsrpUsd(
  classId: FreighterClassId,
  opts?: { maxCargoKg?: number | null; airframeTypeId?: string | null },
): number {
  return resolveAircraftMsrpUsd({
    aircraftClassId: classId,
    maxCargoKg:
      opts?.maxCargoKg ?? maxCargoKgForAirframe(opts?.airframeTypeId),
  });
}

export function aircraftLeaseMonthlyUsd(
  classId: FreighterClassId,
  opts?: { maxCargoKg?: number | null; airframeTypeId?: string | null },
): number {
  return resolveAircraftLeaseMonthlyUsd({
    aircraftClassId: classId,
    maxCargoKg:
      opts?.maxCargoKg ?? maxCargoKgForAirframe(opts?.airframeTypeId),
  });
}

export function fairValueUsd(
  classId: FreighterClassId,
  condition: AirframeCondition,
  opts?: { maxCargoKg?: number | null; airframeTypeId?: string | null },
): number {
  return Math.round(
    aircraftMsrpUsd(classId, opts) * CONDITION_PRICE_MULT[condition],
  );
}

export function sellBackValueUsd(aircraft: PlayerAircraft): number {
  const condition = aircraft.condition ?? 'good';
  return Math.round(
    fairValueUsd(aircraft.aircraftClassId, condition, {
      airframeTypeId: aircraft.airframeTypeId,
    }) * 0.7,
  );
}

const CLASS_LABEL_SHORT: Record<FreighterClassId, string> = {
  light_ga: 'Beechcraft Bonanza BE36',
  light_turboprop: 'Cessna 208 Caravan Cargo',
  light_jet: 'Learjet 35A',
  medium_piston: 'Douglas DC-6',
  narrow_freighter: 'Boeing 737-800 BCF',
  wide_freighter: 'McDonnell Douglas MD-11F',
};

/** Keep cargo/range in sync with CAREER_AIRCRAFT_CLASSES (avoid circular import). */
const CLASS_SPECS: Record<
  FreighterClassId,
  { maxCargoKg: number; maxRangeNm: number }
> = {
  light_ga: { maxCargoKg: 450, maxRangeNm: 800 },
  light_turboprop: { maxCargoKg: 1_704, maxRangeNm: 900 },
  light_jet: { maxCargoKg: 1_450, maxRangeNm: 2_000 },
  medium_piston: { maxCargoKg: 10_000, maxRangeNm: 2_200 },
  narrow_freighter: { maxCargoKg: 18_137, maxRangeNm: 2_500 },
  wide_freighter: { maxCargoKg: 90_000, maxRangeNm: 6_000 },
};

function classLabelShort(classId: FreighterClassId): string {
  return CLASS_LABEL_SHORT[classId];
}

function hubPool(world: CareerEconomyWorld): string[] {
  const majors: string[] = [];
  const regionals: string[] = [];
  const spokes: string[] = [];
  for (const ap of world.airports) {
    if (isBushHub(ap.icao)) continue;
    const tier = hubTierOf(ap);
    if (tier === 'major') majors.push(ap.icao);
    else if (tier === 'regional') regionals.push(ap.icao);
    else spokes.push(ap.icao);
  }
  return [...majors, ...majors, ...regionals, ...spokes.slice(0, 6)];
}

function pickBasedIcao(
  world: CareerEconomyWorld,
  rng: () => number,
  kind: AircraftListingKind,
  classId: FreighterClassId,
): string {
  const majors = world.airports.filter((a) => hubTierOf(a) === 'major');
  const regionals = world.airports.filter((a) => hubTierOf(a) === 'regional');
  const spokes = world.airports.filter(
    (a) => hubTierOf(a) === 'spoke' && !isBushHub(a.icao),
  );

  // Jets / large freighters almost always at majors.
  if (
    (classId === 'narrow_freighter' ||
      classId === 'wide_freighter' ||
      classId === 'light_jet' ||
      classId === 'medium_piston') &&
    majors.length > 0
  ) {
    if (rng() < 0.85 || regionals.length === 0) return pick(rng, majors).icao;
    return pick(rng, regionals).icao;
  }

  // Used at spokes more often (cheaper / scarcer vibe).
  if (kind === 'used' && spokes.length > 0 && rng() < 0.4) {
    return pick(rng, spokes).icao;
  }

  const pool = hubPool(world);
  if (pool.length === 0) {
    return Object.keys(CAREER_HUB_COORDS)[0] ?? 'SBGR';
  }
  return pick(rng, pool);
}

function pickKind(rng: () => number): AircraftListingKind {
  const roll = rng();
  if (roll < 0.3) return 'new';
  if (roll < 0.75) return 'used';
  return 'lease';
}

function pickCondition(
  rng: () => number,
  kind: AircraftListingKind,
  walletUsd: number,
): AirframeCondition {
  if (kind === 'new') return 'excellent';
  const roll = rng();
  // Excellent is scarce; low wallet leans tired/fair.
  if (walletUsd < 40_000) {
    if (roll < 0.06) return 'excellent';
    if (roll < 0.28) return 'good';
    if (roll < 0.65) return 'fair';
    return 'tired';
  }
  if (roll < 0.1) return 'excellent';
  if (roll < 0.45) return 'good';
  if (roll < 0.8) return 'fair';
  return 'tired';
}

function hoursFor(
  rng: () => number,
  kind: AircraftListingKind,
  condition: AirframeCondition,
): { hoursAirframe: number; hoursEngine: number } {
  if (kind === 'new') {
    const h = Math.round(rng() * 40);
    return { hoursAirframe: h, hoursEngine: Math.round(h * (0.85 + rng() * 0.15)) };
  }
  const base =
    condition === 'excellent'
      ? 400 + rng() * 800
      : condition === 'good'
        ? 1_200 + rng() * 2_000
        : condition === 'fair'
          ? 3_000 + rng() * 3_500
          : 6_000 + rng() * 5_000;
  const hoursAirframe = Math.round(base);
  const hoursEngine = Math.round(base * (0.55 + rng() * 0.4));
  return { hoursAirframe, hoursEngine };
}

function priceListing(
  kind: AircraftListingKind,
  classId: FreighterClassId,
  condition: AirframeCondition,
  basedIcao: string,
  world: CareerEconomyWorld,
  rng: () => number,
  maxCargoKg?: number,
): { askingUsd: number; leaseMonthlyUsd?: number; leaseTermMonths?: number } {
  const msrp = resolveAircraftMsrpUsd({
    aircraftClassId: classId,
    maxCargoKg,
  });
  const monthly = resolveAircraftLeaseMonthlyUsd({
    aircraftClassId: classId,
    maxCargoKg,
  });
  const spokeDiscount =
    hubTierOf(
      world.airports.find((a) => a.icao === basedIcao) ?? {
        icao: basedIcao,
        hubTier: 'spoke',
      },
    ) === 'spoke'
      ? 0.94
      : 1;

  if (kind === 'lease') {
    // Always two months up front; short career terms (not multi-year finance).
    const entryMonths = 2;
    const termMonths = rng() < 0.55 ? 6 : 12;
    return {
      askingUsd: Math.round(monthly * entryMonths),
      leaseMonthlyUsd: monthly,
      leaseTermMonths: termMonths,
    };
  }
  if (kind === 'new') {
    const noise = 0.97 + rng() * 0.06;
    return { askingUsd: Math.round(msrp * noise * spokeDiscount) };
  }
  const noise = 0.94 + rng() * 0.1;
  return {
    askingUsd: Math.round(
      msrp * CONDITION_PRICE_MULT[condition] * noise * spokeDiscount,
    ),
  };
}

export function generateAircraftMarketListings(opts: {
  world: CareerEconomyWorld;
  walletUsd: number;
  dayIndex: number;
  economyTick: number;
  usedRegistrations: Set<string>;
}): AircraftListing[] {
  const rng = mulberry32(
    hashSeed(`${opts.world.seed}:acf-market:d${opts.dayIndex}`),
  );
  const listings: AircraftListing[] = [];
  const used = opts.usedRegistrations;

  // Every enabled homologated player airframe is represented on each daily
  // board. Condition, location and sale kind still rotate by seed/day.
  const marketAirframes = listCareerPlayerAirframes();
  for (let i = 0; i < marketAirframes.length; i++) {
    const airframe = marketAirframes[i]!;
    const aircraftClassId = airframe.aircraftClassId;
    const kind = pickKind(rng);
    const condition = pickCondition(rng, kind, opts.walletUsd);
    const basedIcao = pickBasedIcao(opts.world, rng, kind, aircraftClassId);
    const hours = hoursFor(rng, kind, condition);
    const priced = priceListing(
      kind,
      aircraftClassId,
      condition,
      basedIcao,
      opts.world,
      rng,
      airframe.maxCargoKg,
    );
    const pcts = conditionPctsForListing(condition, kind, rng);
    const registration = allocateAircraftRegistrationFromMarket({
      world: opts.world,
      basedIcao,
      used,
      seedHint: `${opts.dayIndex}_${airframe.typeId}_${i}`,
      rng,
    });
    listings.push({
      id: `acfl_${opts.dayIndex}_${i}_${airframe.typeId}`,
      kind,
      aircraftClassId,
      airframeTypeId: airframe.typeId,
      label: airframe.label,
      registration,
      basedIcao,
      askingUsd: Math.max(500, priced.askingUsd),
      leaseMonthlyUsd: priced.leaseMonthlyUsd,
      leaseTermMonths: priced.leaseTermMonths,
      condition,
      hoursAirframe: hours.hoursAirframe,
      hoursEngine: hours.hoursEngine,
      airframeConditionPct: pcts.airframeConditionPct,
      engineConditionPct: pcts.engineConditionPct,
      expiresAtTick: opts.economyTick + LISTING_LIFE_TICKS,
      status: 'available',
      source: 'generated',
    });
  }

  return listings;
}

function preservePlayerListings(listings: AircraftListing[]): AircraftListing[] {
  return listings.filter(
    (l) => isPlayerListing(l) && (l.status === 'available' || l.status === 'reserved'),
  );
}

/** Score lower = more attractive to abstract NPC demand. */
function npcDemandScore(listing: AircraftListing): number {
  let score = listing.askingUsd;
  if (listing.aircraftClassId === 'light_ga') score *= 0.55;
  else if (listing.aircraftClassId === 'light_turboprop') score *= 0.7;
  else if (listing.aircraftClassId === 'light_jet') score *= 0.9;
  else if (listing.aircraftClassId === 'medium_piston') score *= 1.05;
  else if (listing.aircraftClassId === 'narrow_freighter') score *= 1.15;
  else score *= 1.35;
  if (listing.kind === 'used') score *= 0.85;
  if (listing.kind === 'lease') score *= 0.75;
  if (listing.condition === 'tired' || listing.condition === 'fair') score *= 0.9;
  if (listingSource(listing) === 'player_lease') score *= 0.8;
  return score;
}

function airportRegionOf(world: CareerEconomyWorld, icao: string): string | undefined {
  return world.airports.find((a) => a.icao === icao.toUpperCase())?.region;
}

/** Prefer same class + idle + free of another player lease; home region is a soft bonus. */
function pickLeaseOutLessee(
  world: CareerEconomyWorld,
  opts: {
    aircraftClassId: FreighterClassId;
    basedIcao: string;
    rng: () => number;
  },
): NpcFreighter | undefined {
  const region = airportRegionOf(world, opts.basedIcao);
  const free = (world.npcs ?? []).filter(
    (n) => !n.leasedPlayerAircraftId && !n.currentFlightId,
  );
  if (free.length === 0) return undefined;

  const ranked = [...free].sort((a, b) => {
    const aClass = a.aircraftClassId === opts.aircraftClassId ? 0 : 1;
    const bClass = b.aircraftClassId === opts.aircraftClassId ? 0 : 1;
    if (aClass !== bClass) return aClass - bClass;
    const aIdle = a.status === 'idle' ? 0 : 1;
    const bIdle = b.status === 'idle' ? 0 : 1;
    if (aIdle !== bIdle) return aIdle - bIdle;
    const aRegion = region && a.homeRegion === region ? 0 : 1;
    const bRegion = region && b.homeRegion === region ? 0 : 1;
    if (aRegion !== bRegion) return aRegion - bRegion;
    return a.id.localeCompare(b.id);
  });

  // Small noise among the top few same-class candidates.
  const sameClass = ranked.filter((n) => n.aircraftClassId === opts.aircraftClassId);
  const pool = (sameClass.length > 0 ? sameClass : ranked).slice(0, 4);
  return pool[Math.floor(opts.rng() * pool.length)] ?? pool[0];
}

function applyLeaseOutWear(
  aircraft: PlayerAircraft,
  fromTick: number,
  toTick: number,
): number {
  if (!(toTick > fromTick)) return 0;
  const months = (toTick - fromTick) / TICKS_PER_MONTH;
  const hours =
    Math.round(LEASE_OUT_HOURS_PER_MONTH[aircraft.aircraftClassId] * months * 10) / 10;
  if (hours <= 0) return 0;
  applyAircraftHoursAfterMission(aircraft, hours, { deferMaintenanceGate: true });
  return hours;
}

function syncLeaseOutLocation(
  aircraft: PlayerAircraft,
  world: CareerEconomyWorld,
  lesseeNpcId?: string,
): void {
  if (!lesseeNpcId) return;
  const npc = world.npcs.find((n) => n.id === lesseeNpcId);
  if (npc?.locationIcao) {
    aircraft.locationIcao = npc.locationIcao;
  }
}

function applyNpcTakeListing(
  state: CareerMissionsState,
  listing: AircraftListing,
  economyTick: number,
  world: CareerEconomyWorld,
  rng: () => number,
): void {
  const src = listingSource(listing);
  if (src === 'player_lease') {
    const aircraft = state.fleet.find((a) => a.id === listing.sellerAircraftId);
    if (
      !aircraft ||
      aircraft.status !== 'listed' ||
      listing.kind !== 'lease' ||
      !listing.leaseMonthlyUsd ||
      !listing.leaseTermMonths
    ) {
      listing.status = 'expired';
      return;
    }
    const deposit = listing.askingUsd;
    applyWalletDelta(state, {
      amountUsd: deposit,
      kind: 'lease_deposit',
      atTick: economyTick,
      aircraftId: aircraft.id,
      icao: listing.basedIcao || aircraft.locationIcao,
      note: listing.label,
    });
    aircraft.status = 'leased_out';
    aircraft.listedListingId = undefined;
    ensureAircraftConditionPcts(aircraft);

    const lessee = pickLeaseOutLessee(world, {
      aircraftClassId: aircraft.aircraftClassId,
      basedIcao: listing.basedIcao || aircraft.locationIcao,
      rng,
    });
    if (lessee) {
      lessee.leasedPlayerAircraftId = aircraft.id;
      if (!lessee.locationIcao) {
        lessee.locationIcao = listing.basedIcao || aircraft.locationIcao;
      }
      aircraft.locationIcao = lessee.locationIcao;
    }

    aircraft.leaseOut = {
      monthlyUsd: listing.leaseMonthlyUsd,
      nextDueTick: economyTick + TICKS_PER_MONTH,
      termEndsTick: economyTick + listing.leaseTermMonths * TICKS_PER_MONTH,
      depositUsd: deposit,
      listingId: listing.id,
      lesseeNpcId: lessee?.id,
      lesseeName: lessee?.name,
      startedAtTick: economyTick,
      lastWearTick: economyTick,
    };
    listing.status = 'sold';
    return;
  }
  // generated / player_sale — player_sale already paid at sell time.
  listing.status = 'sold';
}

function applyNpcDemand(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  day: number,
): number {
  if (state.aircraftMarketDemandDay === day) return 0;
  const rng = mulberry32(hashSeed(`${world.seed}:acf-demand:d${day}`));
  const takeCount = Math.floor(rng() * 3); // 0–2
  const available = (state.aircraftMarket ?? []).filter((l) => l.status === 'available');
  available.sort((a, b) => npcDemandScore(a) - npcDemandScore(b));
  let taken = 0;
  for (let i = 0; i < takeCount && i < available.length; i++) {
    applyNpcTakeListing(state, available[i]!, world.tick, world, rng);
    taken += 1;
  }
  state.aircraftMarketDemandDay = day;
  return taken;
}

function settleLeaseOutIncome(
  state: CareerMissionsState,
  economyTick: number,
  world?: CareerEconomyWorld,
): { earnedUsd: number; returned: string[]; wearHours: number } {
  let earnedUsd = 0;
  let wearHours = 0;
  const returned: string[] = [];
  for (const aircraft of state.fleet) {
    if (aircraft.status !== 'leased_out' || !aircraft.leaseOut) continue;
    const lease = aircraft.leaseOut;
    if (typeof lease.startedAtTick !== 'number') {
      lease.startedAtTick = lease.nextDueTick - TICKS_PER_MONTH;
    }
    if (typeof lease.lastWearTick !== 'number') {
      lease.lastWearTick = lease.startedAtTick;
    }

    if (world) {
      syncLeaseOutLocation(aircraft, world, lease.lesseeNpcId);
    }

    while (economyTick >= lease.nextDueTick && economyTick < lease.termEndsTick) {
      applyWalletDelta(state, {
        amountUsd: lease.monthlyUsd,
        kind: 'lease_out_income',
        atTick: economyTick,
        aircraftId: aircraft.id,
        icao: aircraft.locationIcao,
        note: lease.lesseeName ?? aircraft.label,
      });
      earnedUsd += lease.monthlyUsd;
      wearHours += applyLeaseOutWear(aircraft, lease.lastWearTick, lease.nextDueTick);
      lease.lastWearTick = lease.nextDueTick;
      lease.nextDueTick += TICKS_PER_MONTH;
    }

    if (economyTick >= lease.termEndsTick) {
      wearHours += applyLeaseOutWear(aircraft, lease.lastWearTick, lease.termEndsTick);
      lease.lastWearTick = lease.termEndsTick;
      if (world) {
        syncLeaseOutLocation(aircraft, world, lease.lesseeNpcId);
        if (lease.lesseeNpcId) {
          const npc = world.npcs.find((n) => n.id === lease.lesseeNpcId);
          if (npc && npc.leasedPlayerAircraftId === aircraft.id) {
            npc.leasedPlayerAircraftId = undefined;
          }
        }
      }
      aircraft.leaseOut = undefined;
      aircraft.status = 'parked';
      evaluateAircraftMaintenanceGate(aircraft);
      returned.push(aircraft.id);
    }
  }
  return { earnedUsd, returned, wearHours };
}

/** Ensure board exists for the current economy day; regenerates when the day rolls. */
export function ensureAircraftMarket(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): CareerMissionsState {
  const day = economyDayIndex(world.tick);
  const tick = world.tick;
  let listings = Array.isArray(state.aircraftMarket) ? [...state.aircraftMarket] : [];

  // Backfill boards created before concrete player airframes were introduced.
  listings = listings.map((listing) => {
    if (findCareerPlayerAirframe(listing.airframeTypeId)) return listing;
    const seller = listing.sellerAircraftId
      ? state.fleet.find((aircraft) => aircraft.id === listing.sellerAircraftId)
      : undefined;
    const sellerAirframe = findCareerPlayerAirframe(seller?.airframeTypeId);
    const candidates = listCareerPlayerAirframes(listing.aircraftClassId);
    const airframe =
      sellerAirframe ??
      (candidates.length > 0
        ? candidates[hashSeed(listing.id) % candidates.length]
        : undefined);
    return airframe
      ? {
          ...listing,
          airframeTypeId: airframe.typeId,
          label: airframe.label,
        }
      : listing;
  });

  // Expire stale rows (player listings expire too).
  listings = listings.map((l) => {
    if (l.status === 'available' && tick >= l.expiresAtTick) {
      if (listingSource(l) === 'player_lease' && l.sellerAircraftId) {
        const acf = state.fleet.find((a) => a.id === l.sellerAircraftId);
        if (acf && acf.status === 'listed') {
          acf.status = 'parked';
          acf.listedListingId = undefined;
        }
      }
      return { ...l, status: 'expired' as const };
    }
    return l;
  });

  const playerKeep = preservePlayerListings(listings);
  const generatedAvailable = listings.filter(
    (l) => listingSource(l) === 'generated' && l.status === 'available',
  );
  const generatedRows = listings.filter(
    (listing) => listingSource(listing) === 'generated',
  );
  const marketAirframes = listCareerPlayerAirframes();
  const marketAirframeIds = new Set(marketAirframes.map((airframe) => airframe.typeId));
  const generatedAirframeIds = new Set(
    generatedRows.map((listing) => listing.airframeTypeId),
  );
  const missingHomologatedAirframe = marketAirframes.some(
    (airframe) => !generatedAirframeIds.has(airframe.typeId),
  );
  // Renamed / disabled / removed SKUs leave stale generated rows until refresh.
  const staleDisabledAirframe = generatedRows.some(
    (listing) =>
      Boolean(listing.airframeTypeId) &&
      !marketAirframeIds.has(listing.airframeTypeId!),
  );

  const needRefresh =
    state.aircraftMarketDay !== day ||
    (generatedAvailable.length === 0 && playerKeep.length === 0) ||
    missingHomologatedAirframe ||
    staleDisabledAirframe;

  if (needRefresh) {
    const used = collectUsedAircraftRegistrations(state);
    const generated = generateAircraftMarketListings({
      world,
      walletUsd: state.walletUsd,
      dayIndex: day,
      economyTick: tick,
      usedRegistrations: used,
    });
    listings = [...generated, ...playerKeep];
    state.aircraftMarket = listings;
    state.aircraftMarketDay = day;
  } else {
    state.aircraftMarket = listings;
    state.aircraftMarketDay = day;
  }

  ensureAircraftRegistrations(state, world);
  applyNpcDemand(state, world, day);
  return state;
}

export function listAircraftMarket(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): AircraftListing[] {
  ensureAircraftMarket(state, world);
  return (state.aircraftMarket ?? []).filter((l) => l.status === 'available');
}

function nextAircraftId(
  state: CareerMissionsState,
  classId: FreighterClassId,
  airframeTypeId?: string,
): string {
  const stem = (airframeTypeId ?? classId).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const prefix = `acf_${stem}_`;
  let max = 0;
  for (const a of state.fleet) {
    if (!a.id.startsWith(prefix)) continue;
    const n = Number(a.id.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

function buildAircraftFromListing(
  state: CareerMissionsState,
  listing: AircraftListing,
  ownership: 'owned' | 'leased',
  economyTick: number,
): PlayerAircraft {
  const capacity = resolvePlayerFuelCapacityKg(
    listing.airframeTypeId,
    listing.aircraftClassId,
  );
  const interval = INSPECTION_INTERVAL_HOURS[listing.aircraftClassId];
  const hoursAirframe = listing.hoursAirframe;
  const pcts =
    typeof listing.airframeConditionPct === 'number'
      ? {
          airframeConditionPct: listing.airframeConditionPct,
          engineConditionPct: listing.engineConditionPct ?? listing.airframeConditionPct,
        }
      : conditionPctsForListing(listing.condition, listing.kind);
  const hoursSinceInspection = Math.min(
    interval * 0.9,
    Math.max(0, hoursAirframe % interval),
  );
  const aircraft: PlayerAircraft = {
    id: nextAircraftId(state, listing.aircraftClassId, listing.airframeTypeId),
    aircraftClassId: listing.aircraftClassId,
    airframeTypeId: listing.airframeTypeId,
    label:
      findCareerPlayerAirframe(listing.airframeTypeId)?.label ??
      listing.label ??
      classLabelShort(listing.aircraftClassId),
    registration:
      normalizeAircraftRegistration(listing.registration) ??
      registrationForListingPurchase(listing, state),
    locationIcao: listing.basedIcao,
    fuelKg: Math.round(capacity * 0.4),
    fuelCapacityKg: capacity,
    status: 'parked',
    ownership,
    condition: listing.condition,
    hoursAirframe,
    hoursEngine: listing.hoursEngine,
    airframeConditionPct: pcts.airframeConditionPct,
    engineConditionPct: pcts.engineConditionPct,
    hoursSinceInspection,
  };
  ensureAircraftConditionPcts(aircraft);
  if (
    hoursUntilInspection(aircraft) <= 0 ||
    (aircraft.airframeConditionPct ?? 100) < 40 ||
    (aircraft.engineConditionPct ?? 100) < 40
  ) {
    aircraft.status = 'maintenance';
  }
  if (ownership === 'leased' && listing.leaseMonthlyUsd && listing.leaseTermMonths) {
    aircraft.lease = {
      monthlyUsd: listing.leaseMonthlyUsd,
      nextDueTick: economyTick + TICKS_PER_MONTH,
      termEndsTick: economyTick + listing.leaseTermMonths * TICKS_PER_MONTH,
      buyoutUsd: Math.round(
        fairValueUsd(listing.aircraftClassId, listing.condition, {
          airframeTypeId: listing.airframeTypeId,
        }) * 0.85,
      ),
      listingId: listing.id,
    };
  }
  return aircraft;
}

/** Prefer pilot location, else home hub — where dealer delivery parks the airframe. */
export function resolveAircraftDeliveryIcao(
  state: CareerMissionsState,
): string {
  const pilot = (state.pilotIcao ?? '').trim().toUpperCase();
  if (pilot) return pilot;
  return (state.homeHubIcao ?? '').trim().toUpperCase();
}

export type AircraftDeliveryQuote = {
  listingId: string;
  basedIcao: string;
  deliverToIcao: string;
  distanceNm: number;
  deliveryFeeUsd: number;
  /** True when based ≠ deliver target (fee may still be 0 only if same ICAO). */
  needed: boolean;
};

export function computeAircraftDeliveryFeeUsd(opts: {
  distanceNm: number;
  aircraftClassId: FreighterClassId;
}): number {
  const distanceNm = Math.max(0, opts.distanceNm);
  if (distanceNm <= 0) return 0;
  const raw =
    distanceNm *
    AIRCRAFT_DELIVERY_USD_PER_NM *
    FERRY_CLASS_MULT[opts.aircraftClassId];
  return Math.min(
    AIRCRAFT_DELIVERY_MAX_USD,
    Math.max(AIRCRAFT_DELIVERY_MIN_USD, Math.round(raw)),
  );
}

export function quoteAircraftDelivery(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  listingId: string,
  deliverToIcao?: string,
): AircraftDeliveryQuote {
  ensureAircraftMarket(state, world);
  const listing = state.aircraftMarket?.find((l) => l.id === listingId);
  if (!listing || listing.status !== 'available') {
    throw new Error(`Listing ${listingId} is not available`);
  }
  return quoteAircraftDeliveryForListing(world, state, listing, deliverToIcao);
}

export function quoteAircraftDeliveryForListing(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  listing: AircraftListing,
  deliverToIcao?: string,
): AircraftDeliveryQuote {
  const to = (
    deliverToIcao?.trim() ||
    resolveAircraftDeliveryIcao(state)
  ).toUpperCase();
  if (!to) {
    throw new Error('No delivery destination — select a starter hub first');
  }
  if (!CAREER_HUB_COORDS[to] && !world.airports.some((a) => a.icao === to)) {
    throw new Error(`Unknown delivery airport: ${to}`);
  }
  const from = listing.basedIcao.trim().toUpperCase();
  assertFerryNotBush(from, to);
  if (from === to) {
    return {
      listingId: listing.id,
      basedIcao: from,
      deliverToIcao: to,
      distanceNm: 0,
      deliveryFeeUsd: 0,
      needed: false,
    };
  }
  const distanceNm =
    hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to);
  if (distanceNm === undefined) {
    throw new Error(`No delivery route ${from}→${to}`);
  }
  return {
    listingId: listing.id,
    basedIcao: from,
    deliverToIcao: to,
    distanceNm,
    deliveryFeeUsd: computeAircraftDeliveryFeeUsd({
      distanceNm,
      aircraftClassId: listing.aircraftClassId,
    }),
    needed: true,
  };
}

export type AircraftAcquireOpts = {
  /** Park at pilot/home hub for a dealer delivery fee (cheaper than self-ferry). */
  deliver?: boolean;
  /** Override delivery destination (defaults to pilotIcao ?? homeHubIcao). */
  deliverToIcao?: string;
};

export function purchaseAircraftListing(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  listingId: string,
  opts?: AircraftAcquireOpts,
): {
  state: CareerMissionsState;
  aircraft: PlayerAircraft;
  debitUsd: number;
  deliveryFeeUsd: number;
} {
  ensureAircraftMarket(state, world);
  const listing = state.aircraftMarket?.find((l) => l.id === listingId);
  if (!listing || listing.status !== 'available') {
    throw new Error(`Listing ${listingId} is not available`);
  }
  if (listing.kind === 'lease') {
    throw new Error('Use signLease for lease listings');
  }
  if (listingSource(listing) === 'player_lease') {
    throw new Error('Cannot purchase your own lease listing');
  }
  if (!state.hubSelected) {
    throw new Error('Select a starter hub before buying aircraft');
  }
  assertClassOpsUnlocked(state.classOps, listing.aircraftClassId);

  let deliveryFeeUsd = 0;
  let deliverTo = listing.basedIcao.trim().toUpperCase();
  if (opts?.deliver) {
    const dq = quoteAircraftDeliveryForListing(
      world,
      state,
      listing,
      opts.deliverToIcao,
    );
    deliveryFeeUsd = dq.deliveryFeeUsd;
    deliverTo = dq.deliverToIcao;
  }

  const debitUsd = listing.askingUsd + deliveryFeeUsd;
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Needs $${debitUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  const aircraft = buildAircraftFromListing(state, listing, 'owned', world.tick);
  if (opts?.deliver && deliverTo !== listing.basedIcao.trim().toUpperCase()) {
    aircraft.locationIcao = deliverTo;
  }
  listing.status = 'sold';
  applyWalletDelta(state, {
    amountUsd: -listing.askingUsd,
    kind: 'aircraft_buy',
    atTick: world.tick,
    aircraftId: aircraft.id,
    icao: listing.basedIcao,
    note: listing.label,
  });
  if (deliveryFeeUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -deliveryFeeUsd,
      kind: 'aircraft_delivery',
      atTick: world.tick,
      aircraftId: aircraft.id,
      icao: deliverTo,
      note: `${listing.basedIcao}→${deliverTo}`,
    });
  }
  state.fleet = [...state.fleet, aircraft];
  state.classOps = syncClassOpsFromFleet(state.classOps, state.fleet);
  return { state, aircraft, debitUsd, deliveryFeeUsd };
}

export function signAircraftLease(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  listingId: string,
  opts?: AircraftAcquireOpts,
): {
  state: CareerMissionsState;
  aircraft: PlayerAircraft;
  debitUsd: number;
  deliveryFeeUsd: number;
} {
  ensureAircraftMarket(state, world);
  const listing = state.aircraftMarket?.find((l) => l.id === listingId);
  if (!listing || listing.status !== 'available') {
    throw new Error(`Listing ${listingId} is not available`);
  }
  if (listing.kind !== 'lease') {
    throw new Error('Listing is not a lease');
  }
  if (listingSource(listing) === 'player_lease') {
    throw new Error('Cannot lease your own listing — wait for market demand or unlist');
  }
  if (!state.hubSelected) {
    throw new Error('Select a starter hub before leasing aircraft');
  }
  assertAircraftLeaseUnlocked(state);
  assertClassOpsUnlocked(state.classOps, listing.aircraftClassId);

  let deliveryFeeUsd = 0;
  let deliverTo = listing.basedIcao.trim().toUpperCase();
  if (opts?.deliver) {
    const dq = quoteAircraftDeliveryForListing(
      world,
      state,
      listing,
      opts.deliverToIcao,
    );
    deliveryFeeUsd = dq.deliveryFeeUsd;
    deliverTo = dq.deliverToIcao;
  }

  const debitUsd = listing.askingUsd + deliveryFeeUsd;
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Lease entry $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  const aircraft = buildAircraftFromListing(state, listing, 'leased', world.tick);
  if (opts?.deliver && deliverTo !== listing.basedIcao.trim().toUpperCase()) {
    aircraft.locationIcao = deliverTo;
  }
  listing.status = 'sold';
  applyWalletDelta(state, {
    amountUsd: -listing.askingUsd,
    kind: 'aircraft_lease_sign',
    atTick: world.tick,
    aircraftId: aircraft.id,
    icao: listing.basedIcao,
    note: listing.label,
  });
  if (deliveryFeeUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -deliveryFeeUsd,
      kind: 'aircraft_delivery',
      atTick: world.tick,
      aircraftId: aircraft.id,
      icao: deliverTo,
      note: `${listing.basedIcao}→${deliverTo}`,
    });
  }
  state.fleet = [...state.fleet, aircraft];
  state.classOps = syncClassOpsFromFleet(state.classOps, state.fleet);
  return { state, aircraft, debitUsd, deliveryFeeUsd };
}

export function sellPlayerAircraft(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick: number,
): { state: CareerMissionsState; creditUsd: number; listing: AircraftListing } {
  const idx = state.fleet.findIndex((a) => a.id === aircraftId);
  if (idx < 0) throw new Error(`Unknown aircraft ${aircraftId}`);
  const aircraft = state.fleet[idx]!;
  if (aircraft.status === 'assigned') {
    throw new Error('Cannot sell an aircraft assigned to a mission');
  }
  if (aircraft.status === 'listed') {
    throw new Error('Unlist the aircraft before selling');
  }
  if (aircraft.status === 'leased_out') {
    throw new Error('Cannot sell an aircraft that is leased out');
  }
  if (aircraft.ownership === 'leased') {
    throw new Error('Cannot sell a leased aircraft — return or buy out the lease');
  }
  if (countOwned(state) <= 1) {
    throw new Error(
      'Keep at least one owned aircraft — buy another before selling this one',
    );
  }
  const creditUsd = sellBackValueUsd(aircraft);
  const askingUsd = Math.round(creditUsd * 1.05);
  ensureAircraftConditionPcts(aircraft);
  const listing: AircraftListing = {
    id: `acfl_sale_${aircraft.id}_${economyTick}`,
    kind: 'used',
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    label:
      findCareerPlayerAirframe(aircraft.airframeTypeId)?.label ??
      aircraft.label,
    registration: normalizeAircraftRegistration(aircraft.registration) ?? undefined,
    basedIcao: aircraft.locationIcao,
    askingUsd: Math.max(500, askingUsd),
    condition: aircraft.condition ?? 'good',
    hoursAirframe: aircraft.hoursAirframe ?? 0,
    hoursEngine: aircraft.hoursEngine ?? 0,
    airframeConditionPct: aircraft.airframeConditionPct,
    engineConditionPct: aircraft.engineConditionPct,
    expiresAtTick: economyTick + PLAYER_LISTING_LIFE_TICKS,
    status: 'available',
    source: 'player_sale',
    sellerAircraftId: aircraft.id,
  };
  state.fleet = state.fleet.filter((a) => a.id !== aircraftId);
  applyWalletDelta(state, {
    amountUsd: creditUsd,
    kind: 'aircraft_sell',
    atTick: economyTick,
    aircraftId: aircraft.id,
    icao: aircraft.locationIcao,
    note: aircraft.label,
  });
  state.aircraftMarket = [...(state.aircraftMarket ?? []), listing];
  return { state, creditUsd, listing };
}

function ownedParkedCount(state: CareerMissionsState): number {
  return state.fleet.filter(
    (a) => (a.ownership ?? 'owned') === 'owned' && a.status === 'parked',
  ).length;
}

function countOwned(state: CareerMissionsState): number {
  return state.fleet.filter((a) => (a.ownership ?? 'owned') === 'owned').length;
}

export function listAircraftForLease(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick: number,
  opts?: { termMonths?: 6 | 12 },
): { state: CareerMissionsState; listing: AircraftListing } {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if ((aircraft.ownership ?? 'owned') !== 'owned') {
    throw new Error('Only owned aircraft can be listed for lease');
  }
  if (aircraft.status !== 'parked') {
    throw new Error('Aircraft must be parked to list for lease');
  }
  if (countOwned(state) < 2) {
    throw new Error('Need at least two owned aircraft to list one for lease');
  }
  const existingPlayerLease = (state.aircraftMarket ?? []).some(
    (l) => listingSource(l) === 'player_lease' && l.status === 'available',
  );
  if (existingPlayerLease) {
    throw new Error('You already have one aircraft listed for lease');
  }
  const monthly = aircraftLeaseMonthlyUsd(aircraft.aircraftClassId, {
    airframeTypeId: aircraft.airframeTypeId,
  });
  const termMonths = opts?.termMonths ?? 6;
  const listing: AircraftListing = {
    id: `acfl_lease_${aircraft.id}_${economyTick}`,
    kind: 'lease',
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    label:
      findCareerPlayerAirframe(aircraft.airframeTypeId)?.label ??
      aircraft.label,
    registration: normalizeAircraftRegistration(aircraft.registration) ?? undefined,
    basedIcao: aircraft.locationIcao,
    askingUsd: monthly,
    leaseMonthlyUsd: monthly,
    leaseTermMonths: termMonths,
    condition: aircraft.condition ?? 'good',
    hoursAirframe: aircraft.hoursAirframe ?? 0,
    hoursEngine: aircraft.hoursEngine ?? 0,
    expiresAtTick: economyTick + PLAYER_LISTING_LIFE_TICKS,
    status: 'available',
    source: 'player_lease',
    sellerAircraftId: aircraft.id,
  };
  aircraft.status = 'listed';
  aircraft.listedListingId = listing.id;
  state.aircraftMarket = [...(state.aircraftMarket ?? []), listing];
  return { state, listing };
}

export function unlistAircraftForLease(
  state: CareerMissionsState,
  aircraftId: string,
): { state: CareerMissionsState } {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.status !== 'listed') {
    throw new Error('Aircraft is not listed for lease');
  }
  const listing = state.aircraftMarket?.find(
    (l) =>
      l.id === aircraft.listedListingId ||
      (listingSource(l) === 'player_lease' &&
        l.sellerAircraftId === aircraftId &&
        l.status === 'available'),
  );
  if (!listing || listing.status !== 'available') {
    throw new Error('Lease listing is no longer available to unlist');
  }
  listing.status = 'expired';
  aircraft.status = 'parked';
  aircraft.listedListingId = undefined;
  return { state };
}

/** Apply due lease payments / term ends / lease-out income using economy tick. */
export function settleAircraftMarketOps(
  state: CareerMissionsState,
  economyTick: number,
  world?: CareerEconomyWorld,
  opts?: {
    /** Max lease payment loops this call (default: unlimited). */
    maxInstallments?: number;
    /** If term ended, keep aircraft and mark soft end instead of removing. */
    deferTermRepossess?: boolean;
  },
): {
  paidUsd: number;
  repossessed: string[];
  termEndedSoft: string[];
  overdueIds: string[];
  installmentsPaid: number;
  leaseOutEarnedUsd: number;
  leaseOutReturned: string[];
  npcTaken?: number;
} {
  let paidUsd = 0;
  let installmentsPaid = 0;
  const repossessed: string[] = [];
  const termEndedSoft: string[] = [];
  const overdueIds: string[] = [];
  const keep: PlayerAircraft[] = [];
  const maxInstallments =
    typeof opts?.maxInstallments === 'number' && opts.maxInstallments >= 0
      ? Math.floor(opts.maxInstallments)
      : Number.POSITIVE_INFINITY;
  const deferTerm = opts?.deferTermRepossess === true;

  for (const aircraft of state.fleet) {
    if (aircraft.ownership !== 'leased' || !aircraft.lease) {
      keep.push(aircraft);
      continue;
    }
    const lease = aircraft.lease;
    let paidThisAcf = 0;
    while (
      economyTick >= lease.nextDueTick &&
      economyTick < lease.termEndsTick &&
      paidThisAcf < maxInstallments
    ) {
      if (state.walletUsd < lease.monthlyUsd) {
        aircraft.leaseOverdue = true;
        break;
      }
      applyWalletDelta(state, {
        amountUsd: -lease.monthlyUsd,
        kind: 'lease_payment',
        atTick: economyTick,
        aircraftId: aircraft.id,
        icao: aircraft.locationIcao,
        note: aircraft.label,
      });
      paidUsd += lease.monthlyUsd;
      paidThisAcf += 1;
      installmentsPaid += 1;
      lease.nextDueTick += TICKS_PER_MONTH;
      aircraft.leaseOverdue = false;
    }
    // More months due but capped — leave overdue so Hangar prompts payment.
    if (
      economyTick >= lease.nextDueTick &&
      economyTick < lease.termEndsTick &&
      paidThisAcf >= maxInstallments &&
      Number.isFinite(maxInstallments)
    ) {
      aircraft.leaseOverdue = true;
    }
    if (aircraft.leaseOverdue) {
      overdueIds.push(aircraft.id);
    }
    if (economyTick >= lease.termEndsTick) {
      if (deferTerm) {
        lease.termEndedSoft = true;
        aircraft.leaseOverdue = true;
        if (!overdueIds.includes(aircraft.id)) overdueIds.push(aircraft.id);
        termEndedSoft.push(aircraft.id);
        keep.push(aircraft);
        continue;
      }
      repossessed.push(aircraft.id);
      continue;
    }
    keep.push(aircraft);
  }
  state.fleet = keep;

  const leaseOut = settleLeaseOutIncome(state, economyTick, world);

  let npcTaken: number | undefined;
  if (world) {
    ensureAircraftMarket(state, world);
    npcTaken = undefined; // demand runs inside ensure once per day
  }

  return {
    paidUsd,
    repossessed,
    termEndedSoft,
    overdueIds,
    installmentsPaid,
    leaseOutEarnedUsd: leaseOut.earnedUsd,
    leaseOutReturned: leaseOut.returned,
    npcTaken,
  };
}

export function buyOutAircraftLease(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick = 0,
): { state: CareerMissionsState; debitUsd: number } {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.ownership !== 'leased' || !aircraft.lease) {
    throw new Error('Aircraft is not under lease');
  }
  const debit = aircraft.lease.buyoutUsd ?? sellBackValueUsd(aircraft);
  if (state.walletUsd < debit) {
    throw new Error(
      `Buyout $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -debit,
    kind: 'aircraft_buyout',
    atTick: economyTick,
    aircraftId: aircraft.id,
    icao: aircraft.locationIcao,
    note: aircraft.label,
  });
  aircraft.ownership = 'owned';
  aircraft.lease = undefined;
  aircraft.leaseOverdue = false;
  return { state, debitUsd: debit };
}

/** Months still owed on a player lease (at least 1 while the term is active). */
export function leaseRemainingMonths(
  aircraft: PlayerAircraft,
  economyTick: number,
): number {
  const lease = aircraft.lease;
  if (!lease) return 0;
  const ticksLeft = lease.termEndsTick - economyTick;
  if (ticksLeft <= 0) return 0;
  return Math.max(1, Math.ceil(ticksLeft / TICKS_PER_MONTH));
}

/**
 * Early-return penalty: half the remaining months of rent, clamped to 1–3 months.
 * Deposit already paid is not refunded.
 */
export function quoteLeaseEarlyReturnUsd(
  aircraft: PlayerAircraft,
  economyTick: number,
): number {
  if (aircraft.ownership !== 'leased' || !aircraft.lease) {
    throw new Error('Aircraft is not under lease');
  }
  // Soft term-end after long AFK: lessor reclaim at $0 (no early-return penalty).
  if (aircraft.lease.termEndedSoft === true || economyTick >= aircraft.lease.termEndsTick) {
    return 0;
  }
  const remaining = leaseRemainingMonths(aircraft, economyTick);
  if (remaining <= 0) {
    throw new Error('Lease term already ended — the lessor will reclaim the airframe');
  }
  const monthsBilled = Math.min(3, Math.max(1, Math.ceil(remaining * 0.5)));
  return Math.round(aircraft.lease.monthlyUsd * monthsBilled);
}

/**
 * Return a leased airframe before term end. Pays the early-return penalty and
 * removes the aircraft from the fleet (same outcome as natural repossess).
 * Soft term-end (`termEndedSoft`) allows a free return even if leaseOverdue.
 */
export function returnAircraftLeaseEarly(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick = 0,
): { state: CareerMissionsState; debitUsd: number; remainingMonths: number } {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.ownership !== 'leased' || !aircraft.lease) {
    throw new Error('Aircraft is not under lease');
  }
  const softEnded =
    aircraft.lease.termEndedSoft === true ||
    economyTick >= aircraft.lease.termEndsTick;
  if (aircraft.leaseOverdue && !softEnded) {
    throw new Error(
      'Lease payment is overdue — clear the due month before returning early',
    );
  }
  if (aircraft.status === 'assigned') {
    throw new Error('Finish or cancel the assigned mission before returning the lease');
  }
  if (aircraft.status === 'listed') {
    throw new Error('Unlist the airframe before returning the lease');
  }
  if (aircraft.status !== 'parked' && aircraft.status !== 'maintenance') {
    throw new Error(`Cannot return lease while aircraft is ${aircraft.status}`);
  }

  const remainingMonths = softEnded
    ? 0
    : leaseRemainingMonths(aircraft, economyTick);
  const debit = quoteLeaseEarlyReturnUsd(aircraft, economyTick);
  if (debit > 0 && state.walletUsd < debit) {
    throw new Error(
      `Early return $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  if (debit > 0) {
    applyWalletDelta(state, {
      amountUsd: -debit,
      kind: 'lease_early_return',
      atTick: economyTick,
      aircraftId: aircraft.id,
      icao: aircraft.locationIcao,
      note: `${aircraft.label} · ${remainingMonths} mo left`,
    });
  }
  state.fleet = state.fleet.filter((a) => a.id !== aircraft.id);
  return { state, debitUsd: debit, remainingMonths };
}

export function estimateMissionBlockHours(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
  aircraftClassId: FreighterClassId,
): number {
  const nm = routeDistanceNm(world, originIcao, destIcao) ?? 0;
  const cruise =
    aircraftClassId === 'wide_freighter'
      ? 480
      : aircraftClassId === 'narrow_freighter' || aircraftClassId === 'light_jet'
        ? 430
        : aircraftClassId === 'medium_piston'
          ? 290
          : aircraftClassId === 'light_turboprop'
            ? 185
            : 170;
  return Math.max(0.5, Math.round((nm / cruise + 0.4) * 10) / 10);
}

export function assertAircraftDispatchable(aircraft: PlayerAircraft): void {
  if (aircraft.status === 'maintenance') {
    throw new Error(
      `Aircraft ${aircraft.id} is in maintenance — clear the shop visit first`,
    );
  }
  if (aircraft.status === 'listed') {
    throw new Error(
      `Aircraft ${aircraft.id} is listed on the Aircraft Market — unlist first`,
    );
  }
  if (aircraft.status === 'leased_out') {
    throw new Error(`Aircraft ${aircraft.id} is leased out to the market`);
  }
  if (aircraft.leaseOverdue) {
    throw new Error(`Aircraft ${aircraft.id} has an overdue lease payment`);
  }
  if (aircraft.status === 'assigned') {
    throw new Error(`Aircraft ${aircraft.id} is already assigned`);
  }
}

/** True when used asking price is below a typical new price for the airframe. */
export function listingIsCheaperThanNew(listing: AircraftListing): boolean {
  const msrp = aircraftMsrpUsd(listing.aircraftClassId, {
    airframeTypeId: listing.airframeTypeId,
  });
  if (listing.kind === 'new') return false;
  if (listing.kind === 'lease') {
    return (listing.askingUsd ?? 0) < msrp * 0.15;
  }
  return listing.askingUsd < msrp * 0.95;
}

export function listAircraftClassCatalog(): Array<{
  id: FreighterClassId;
  name: string;
  msrpUsd: number;
  leaseMonthlyUsd: number;
  maxCargoKg: number;
  maxRangeNm: number;
}> {
  return CLASS_ORDER.map((id) => ({
    id,
    name: CLASS_LABEL_SHORT[id],
    msrpUsd: AIRCRAFT_MSRP_USD[id],
    leaseMonthlyUsd: aircraftLeaseMonthlyUsd(id),
    maxCargoKg: CLASS_SPECS[id].maxCargoKg,
    maxRangeNm: CLASS_SPECS[id].maxRangeNm,
  }));
}

/** Test helper: force abstract demand against current available listings. */
export function __testApplyNpcDemand(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  day: number,
): number {
  state.aircraftMarketDemandDay = undefined;
  return applyNpcDemand(state, world, day);
}

export function __testOwnedParkedCount(state: CareerMissionsState): number {
  return ownedParkedCount(state);
}
