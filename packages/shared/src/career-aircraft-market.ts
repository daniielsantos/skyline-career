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
  AIRCRAFT_IMPORT_HANDLING_USD,
  AIRCRAFT_IMPORT_MAX_USD,
  AIRCRAFT_IMPORT_MIN_USD,
  AIRCRAFT_IMPORT_USD_PER_NM,
  computeFerryFeeUsd,
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
  hoursValueMult,
  resolveAircraftLeaseWeeklyUsd,
  resolveAircraftMsrpUsd,
  resolveDealerLeaseWeeklyUsd,
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
  countryIdForHubIcao,
  ensureAircraftRegistrations,
  normalizeAircraftRegistration,
  registrationForListingPurchase,
} from './career-aircraft-registration.js';
import {
  AIRCRAFT_MARKET_BROWSE_WORLD,
  collectPoolRegistrations,
  dealerInstancesForMarket,
  dealerInstancesWorldwide,
  ensureAircraftPoolCatalogSync,
  ensureWorldAircraftPool,
  ingestPlayerAircraftToDealerPool,
  instanceToListing,
  markDealerInstanceSold,
  resolveMarketCountryId,
  restockDealerAirframe,
} from './career-aircraft-pool.js';
import { countryIdFromRegion } from './career-partition.js';
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
  AIRCRAFT_LEASE_WEEKLY_RATE,
  AIRCRAFT_LEASE_MONTHLY_RATE,
  AIRCRAFT_MSRP_USD,
  CONDITION_PRICE_MULT,
  cargoMsrpMultiplier,
  hoursValueMult,
  resolveAircraftLeaseWeeklyUsd,
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

const TICKS_PER_WEEK = TICKS_PER_DAY * 7;
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

/** Dev Mode gate copy — lease open without writing Dry settle progress. */
export function aircraftLeaseUnlockProgressDevOpen(
  state: Pick<CareerMissionsState, 'cargoOps'>,
): AircraftLeaseUnlockProgress {
  const base = aircraftLeaseUnlockProgress(state);
  if (base.unlocked) return base;
  return {
    ...base,
    unlocked: true,
    remaining: 0,
    hint: `Lease unlocked (Dev Mode). Progress ${base.current}/${base.required} clean Dry freights.`,
  };
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

export function aircraftLeaseWeeklyUsd(
  classId: FreighterClassId,
  opts?: { maxCargoKg?: number | null; airframeTypeId?: string | null },
): number {
  return resolveAircraftLeaseWeeklyUsd({
    aircraftClassId: classId,
    maxCargoKg:
      opts?.maxCargoKg ?? maxCargoKgForAirframe(opts?.airframeTypeId),
  });
}

/** @deprecated Alias — installment is weekly. */
export function aircraftLeaseMonthlyUsd(
  classId: FreighterClassId,
  opts?: { maxCargoKg?: number | null; airframeTypeId?: string | null },
): number {
  return aircraftLeaseWeeklyUsd(classId, opts);
}

export function fairValueUsd(
  classId: FreighterClassId,
  condition: AirframeCondition,
  opts?: {
    maxCargoKg?: number | null;
    airframeTypeId?: string | null;
    hoursAirframe?: number | null;
    hoursEngine?: number | null;
  },
): number {
  return Math.round(
    aircraftMsrpUsd(classId, opts) *
      CONDITION_PRICE_MULT[condition] *
      hoursValueMult({
        aircraftClassId: classId,
        hoursAirframe: opts?.hoursAirframe,
        hoursEngine: opts?.hoursEngine,
      }),
  );
}

/** Instant dealer trade-in as a fraction of fair value. */
export const DEALER_TRADE_IN_FRAC = 0.5;
export const PLAYER_SALE_ASK_MIN_MULT = 0.5;
export const PLAYER_SALE_ASK_MAX_MULT = 2;

export function sellBackValueUsd(aircraft: PlayerAircraft): number {
  const condition = aircraft.condition ?? 'good';
  return Math.round(
    fairValueUsd(aircraft.aircraftClassId, condition, {
      airframeTypeId: aircraft.airframeTypeId,
      hoursAirframe: aircraft.hoursAirframe,
      hoursEngine: aircraft.hoursEngine,
    }) * DEALER_TRADE_IN_FRAC,
  );
}

export function clampPlayerSaleAskingUsd(
  askingUsd: number,
  fairUsd: number,
): number {
  const fair = Math.max(500, fairUsd);
  const lo = Math.max(500, Math.round(fair * PLAYER_SALE_ASK_MIN_MULT));
  const hi = Math.max(lo, Math.round(fair * PLAYER_SALE_ASK_MAX_MULT));
  if (!Number.isFinite(askingUsd)) return fair;
  return Math.min(hi, Math.max(lo, Math.round(askingUsd)));
}

/** Player may list lease weekly 0.6–1.8× catalog; term 1–3 months. */
export const PLAYER_LEASE_WEEKLY_MIN_MULT = 0.6;
export const PLAYER_LEASE_WEEKLY_MAX_MULT = 1.8;
/** @deprecated Alias for weekly mult. */
export const PLAYER_LEASE_MONTHLY_MIN_MULT = PLAYER_LEASE_WEEKLY_MIN_MULT;
/** @deprecated Alias for weekly mult. */
export const PLAYER_LEASE_MONTHLY_MAX_MULT = PLAYER_LEASE_WEEKLY_MAX_MULT;
export const PLAYER_LEASE_TERM_MIN_MONTHS = 1;
export const PLAYER_LEASE_TERM_MAX_MONTHS = 3;
/** NPC only takes 0.7–1.3× catalog weekly and 1–3 month terms. */
export const NPC_LEASE_WEEKLY_MIN_MULT = 0.7;
export const NPC_LEASE_WEEKLY_MAX_MULT = 1.3;
/** @deprecated Alias for weekly mult. */
export const NPC_LEASE_MONTHLY_MIN_MULT = NPC_LEASE_WEEKLY_MIN_MULT;
/** @deprecated Alias for weekly mult. */
export const NPC_LEASE_MONTHLY_MAX_MULT = NPC_LEASE_WEEKLY_MAX_MULT;
export const NPC_LEASE_TERM_MIN_MONTHS = 1;
export const NPC_LEASE_TERM_MAX_MONTHS = 3;
/** Up-front deposit = this many weeks of the weekly installment. */
export const PLAYER_LEASE_DEPOSIT_WEEKS = 4;
/** @deprecated Use PLAYER_LEASE_DEPOSIT_WEEKS. */
export const PLAYER_LEASE_DEPOSIT_MONTHS = PLAYER_LEASE_DEPOSIT_WEEKS;

export function clampPlayerLeaseWeeklyUsd(
  weeklyUsd: number,
  catalogWeeklyUsd: number,
): number {
  const catalog = Math.max(1, Math.round(catalogWeeklyUsd));
  const lo = Math.max(1, Math.round(catalog * PLAYER_LEASE_WEEKLY_MIN_MULT));
  const hi = Math.max(lo, Math.round(catalog * PLAYER_LEASE_WEEKLY_MAX_MULT));
  if (!Number.isFinite(weeklyUsd)) return catalog;
  return Math.min(hi, Math.max(lo, Math.round(weeklyUsd)));
}

/** @deprecated Alias — values are weekly. */
export function clampPlayerLeaseMonthlyUsd(
  monthlyUsd: number,
  catalogMonthlyUsd: number,
): number {
  return clampPlayerLeaseWeeklyUsd(monthlyUsd, catalogMonthlyUsd);
}

export function clampPlayerLeaseTermMonths(termMonths: number): number {
  const n = Math.round(termMonths);
  if (!Number.isFinite(n)) return 3;
  return Math.min(
    PLAYER_LEASE_TERM_MAX_MONTHS,
    Math.max(PLAYER_LEASE_TERM_MIN_MONTHS, n),
  );
}

export function npcPlayerLeaseAcceptable(opts: {
  monthlyUsd: number;
  termMonths: number;
  catalogMonthlyUsd: number;
}): boolean {
  const catalog = Math.max(1, opts.catalogMonthlyUsd);
  const ratio = opts.monthlyUsd / catalog;
  if (ratio < NPC_LEASE_WEEKLY_MIN_MULT || ratio > NPC_LEASE_WEEKLY_MAX_MULT) {
    return false;
  }
  const term = Math.round(opts.termMonths);
  return term >= NPC_LEASE_TERM_MIN_MONTHS && term <= NPC_LEASE_TERM_MAX_MONTHS;
}

/** Cheaper vs catalog → more likely; still 0 outside NPC band. */
export function npcPlayerLeaseAcceptChance(opts: {
  monthlyUsd: number;
  termMonths: number;
  catalogMonthlyUsd: number;
}): number {
  if (!npcPlayerLeaseAcceptable(opts)) return 0;
  const catalog = Math.max(1, opts.catalogMonthlyUsd);
  const ratio = opts.monthlyUsd / catalog;
  if (ratio <= 0.85) return 0.8;
  if (ratio <= 1.0) return 0.55;
  if (ratio <= 1.15) return 0.28;
  return 0.12;
}

const CLASS_LABEL_SHORT: Record<FreighterClassId, string> = {
  light_ga: 'Bonanza A36/A36TC Professional',
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
  hours?: { hoursAirframe: number; hoursEngine: number },
): { askingUsd: number; leaseMonthlyUsd?: number; leaseTermMonths?: number } {
  const msrp = resolveAircraftMsrpUsd({
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
    // Deposit = 4 weeks; short career terms (1–3 months).
    const entryWeeks = PLAYER_LEASE_DEPOSIT_WEEKS;
    const roll = rng();
    const termMonths = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 3;
    const weekly = resolveDealerLeaseWeeklyUsd({
      aircraftClassId: classId,
      maxCargoKg,
      condition,
      hoursAirframe: hours?.hoursAirframe,
      hoursEngine: hours?.hoursEngine,
    });
    return {
      askingUsd: Math.round(weekly * entryWeeks),
      leaseMonthlyUsd: weekly,
      leaseTermMonths: termMonths,
    };
  }
  if (kind === 'new') {
    const noise = 0.97 + rng() * 0.06;
    return { askingUsd: Math.round(msrp * noise * spokeDiscount) };
  }
  const noise = 0.94 + rng() * 0.1;
  const ageMult = hoursValueMult({
    aircraftClassId: classId,
    hoursAirframe: hours?.hoursAirframe,
    hoursEngine: hours?.hoursEngine,
  });
  return {
    askingUsd: Math.round(
      msrp * CONDITION_PRICE_MULT[condition] * noise * spokeDiscount * ageMult,
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
      hours,
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

/** Score lower = more attractive to abstract NPC demand (leases). */
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

/** NPC buy chance for player_sale — ask relative to fair value. */
export function npcPlayerSaleAcceptChance(
  askingUsd: number,
  fairUsd: number,
): number {
  const fair = Math.max(1, fairUsd);
  const ratio = askingUsd / fair;
  if (ratio <= 0.9) return 0.85;
  if (ratio <= 1.0) return 0.55;
  if (ratio <= 1.1) return 0.3;
  if (ratio <= 1.2) return 0.12;
  return 0.02;
}

function listingListedAtTick(listing: AircraftListing): number {
  return Math.max(0, listing.expiresAtTick - PLAYER_LISTING_LIFE_TICKS);
}

/** Min economy days a player sale must sit before NPC demand considers it. */
export const PLAYER_SALE_NPC_MIN_DAYS = 1;

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
  if (src === 'player_sale') {
    const aircraft = state.fleet.find((a) => a.id === listing.sellerAircraftId);
    if (
      !aircraft ||
      aircraft.status !== 'listed' ||
      listing.kind === 'lease'
    ) {
      listing.status = 'expired';
      return;
    }
    applyWalletDelta(state, {
      amountUsd: listing.askingUsd,
      kind: 'aircraft_sell',
      atTick: economyTick,
      aircraftId: aircraft.id,
      icao: listing.basedIcao || aircraft.locationIcao,
      note: listing.label,
    });
    ensureAircraftConditionPcts(aircraft);
    const countryId = countryIdForHubIcao(
      listing.basedIcao || aircraft.locationIcao,
      world,
    );
    ingestPlayerAircraftToDealerPool({
      world,
      aircraft,
      countryId,
    });
    state.fleet = state.fleet.filter((a) => a.id !== aircraft.id);
    state.classOps = syncClassOpsFromFleet(state.classOps, state.fleet);
    listing.status = 'sold';
    return;
  }
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
    if (!lessee) return;
    lessee.leasedPlayerAircraftId = aircraft.id;
    if (!lessee.locationIcao) {
      lessee.locationIcao = listing.basedIcao || aircraft.locationIcao;
    }
    aircraft.locationIcao = lessee.locationIcao;

    aircraft.leaseOut = {
      monthlyUsd: listing.leaseMonthlyUsd,
      nextDueTick: economyTick + TICKS_PER_WEEK,
      termEndsTick: economyTick + listing.leaseTermMonths * TICKS_PER_MONTH,
      depositUsd: deposit,
      listingId: listing.id,
      lesseeNpcId: lessee.id,
      lesseeName: lessee.name,
      startedAtTick: economyTick,
      lastWearTick: economyTick,
    };
    listing.status = 'sold';
    return;
  }
  listing.status = 'sold';
}

function applyNpcDemand(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  day: number,
): number {
  if (state.aircraftMarketDemandDay === day) return 0;
  const rng = mulberry32(hashSeed(`${world.seed}:acf-demand:d${day}`));
  const takeBudget = Math.floor(rng() * 3); // 0–2
  const tick = world.tick;
  const minSaleAgeTicks = PLAYER_SALE_NPC_MIN_DAYS * TICKS_PER_DAY;
  let taken = 0;

  const saleCandidates = (state.aircraftMarket ?? []).filter((l) => {
    if (l.status !== 'available' || listingSource(l) !== 'player_sale') {
      return false;
    }
    return tick - listingListedAtTick(l) >= minSaleAgeTicks;
  });
  saleCandidates.sort((a, b) => {
    const fairA = fairValueUsd(a.aircraftClassId, a.condition, {
      airframeTypeId: a.airframeTypeId,
      hoursAirframe: a.hoursAirframe,
      hoursEngine: a.hoursEngine,
    });
    const fairB = fairValueUsd(b.aircraftClassId, b.condition, {
      airframeTypeId: b.airframeTypeId,
      hoursAirframe: b.hoursAirframe,
      hoursEngine: b.hoursEngine,
    });
    return a.askingUsd / Math.max(1, fairA) - b.askingUsd / Math.max(1, fairB);
  });
  for (const listing of saleCandidates) {
    if (taken >= takeBudget) break;
    const fair = fairValueUsd(listing.aircraftClassId, listing.condition, {
      airframeTypeId: listing.airframeTypeId,
      hoursAirframe: listing.hoursAirframe,
      hoursEngine: listing.hoursEngine,
    });
    if (rng() > npcPlayerSaleAcceptChance(listing.askingUsd, fair)) continue;
    applyNpcTakeListing(state, listing, tick, world, rng);
    if (listing.status === 'sold') taken += 1;
  }

  const leaseBudget = takeBudget - taken;
  if (leaseBudget > 0) {
    const leases = (state.aircraftMarket ?? []).filter(
      (l) =>
        l.status === 'available' && listingSource(l) === 'player_lease',
    );
    leases.sort((a, b) => npcDemandScore(a) - npcDemandScore(b));
    for (const listing of leases) {
      if (taken >= takeBudget) break;
      const catalog = aircraftLeaseMonthlyUsd(listing.aircraftClassId, {
        airframeTypeId: listing.airframeTypeId,
      });
      const chance = npcPlayerLeaseAcceptChance({
        monthlyUsd: listing.leaseMonthlyUsd ?? catalog,
        termMonths: listing.leaseTermMonths ?? 3,
        catalogMonthlyUsd: catalog,
      });
      if (chance <= 0 || rng() > chance) continue;
      applyNpcTakeListing(state, listing, tick, world, rng);
      if (listing.status === 'sold') taken += 1;
    }
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
      lease.startedAtTick = lease.nextDueTick - TICKS_PER_WEEK;
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
      lease.nextDueTick += TICKS_PER_WEEK;
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
  ensureWorldAircraftPool(world);
  ensureAircraftPoolCatalogSync(world, state);

  let listings = Array.isArray(state.aircraftMarket)
    ? [...state.aircraftMarket]
    : [];

  // Backfill boards created before concrete player airframes were introduced.
  listings = listings.map((listing) => {
    if (listingSource(listing) !== 'generated') return listing;
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

  // Expire stale player listings.
  listings = listings.map((l) => {
    if (l.status === 'available' && tick >= l.expiresAtTick) {
      if (isPlayerListing(l) && l.sellerAircraftId) {
        const acf = state.fleet.find((a) => a.id === l.sellerAircraftId);
        if (acf && acf.status === 'listed') {
          acf.status = 'parked';
          acf.listedListingId = undefined;
        }
        return { ...l, status: 'expired' as const };
      }
    }
    return l;
  });

  const playerKeep = preservePlayerListings(listings);
  const marketCountryId = resolveMarketCountryId(world, state);
  const dealerListings = dealerInstancesForMarket(world, marketCountryId, tick).map(
    (inst) => instanceToListing(world, inst, tick),
  );

  state.aircraftMarket = [...dealerListings, ...playerKeep];
  state.aircraftMarketDay = day;

  ensureAircraftRegistrations(state, world);
  applyNpcDemand(state, world, day);
  return state;
}

/** Radius for the Airframes “Near me” filter. */
export const AIRCRAFT_MARKET_NEAR_NM = 400;

export const CROSS_BORDER_AIRCRAFT_ACQUIRE =
  'Cross-border purchase is not available yet — import and ferry come later.';

function applyAcquireRepositionCharges(
  state: CareerMissionsState,
  opts: {
    world: CareerEconomyWorld;
    listing: AircraftListing;
    aircraft: PlayerAircraft;
    crossBorder: boolean;
    deliverTo: string;
    deliveryFeeUsd: number;
    importFeeUsd: number;
  },
): void {
  const { listing, aircraft, deliverTo, deliveryFeeUsd, importFeeUsd } = opts;
  if (deliveryFeeUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -deliveryFeeUsd,
      kind: 'aircraft_delivery',
      atTick: opts.world.tick,
      aircraftId: aircraft.id,
      icao: deliverTo,
      note: `${listing.basedIcao}→${deliverTo}`,
    });
  }
  if (importFeeUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -importFeeUsd,
      kind: 'aircraft_import',
      atTick: opts.world.tick,
      aircraftId: aircraft.id,
      icao: deliverTo,
      note: `${listing.basedIcao}→${deliverTo}`,
    });
  }
}

function markListingSold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  listing: AircraftListing,
): void {
  const boardListing = state.aircraftMarket?.find((l) => l.id === listing.id);
  if (boardListing && boardListing.status === 'available') {
    boardListing.status = 'sold';
  }
  markDealerInstanceSold(world, listing.id);
}

export function isCrossBorderAircraftListing(
  world: CareerEconomyWorld,
  state: Pick<CareerMissionsState, 'homeHubIcao'>,
  listing: Pick<AircraftListing, 'countryId' | 'basedIcao'>,
): boolean {
  const home = resolveMarketCountryId(world, state);
  const listingCountry = listingCountryId(world, listing);
  return Boolean(listingCountry && listingCountry !== home);
}

function stampListingGeo(
  world: CareerEconomyWorld,
  listing: AircraftListing,
): AircraftListing {
  const icao = listing.basedIcao.trim().toUpperCase();
  const ap = world.airports.find((a) => a.icao.toUpperCase() === icao);
  const countryId =
    listing.countryId?.trim().toUpperCase() ||
    (ap?.region ? countryIdFromRegion(ap.region) : undefined);
  const region = listing.region ?? ap?.region;
  if (listing.countryId === countryId && listing.region === region) {
    return listing;
  }
  return { ...listing, countryId, region };
}

export function listingCountryId(
  world: CareerEconomyWorld,
  listing: Pick<AircraftListing, 'countryId' | 'basedIcao'>,
): string | undefined {
  const tagged = listing.countryId?.trim().toUpperCase();
  if (tagged) return tagged;
  const icao = listing.basedIcao.trim().toUpperCase();
  const ap = world.airports.find((a) => a.icao.toUpperCase() === icao);
  if (ap?.region) return countryIdFromRegion(ap.region);
  return undefined;
}

/** Ferry due when returning a lease away from where possession started. */
export function quoteLeaseReturnRepositionFee(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  aircraft: PlayerAircraft,
): {
  feeUsd: number;
  fromIcao: string;
  toIcao: string;
  distanceNm: number;
  needed: boolean;
} {
  const lease = aircraft.lease;
  if (!lease) {
    return {
      feeUsd: 0,
      fromIcao: aircraft.locationIcao,
      toIcao: aircraft.locationIcao,
      distanceNm: 0,
      needed: false,
    };
  }
  const to = (lease.startIcao ?? aircraft.locationIcao).trim().toUpperCase();
  const from = aircraft.locationIcao.trim().toUpperCase();
  if (!from || from === to) {
    return { feeUsd: 0, fromIcao: from, toIcao: to, distanceNm: 0, needed: false };
  }
  assertFerryNotBush(from, to);
  const distanceNm =
    hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to);
  if (distanceNm === undefined) {
    throw new Error(`No lease return route ${from}→${to}`);
  }
  const fee = computeFerryFeeUsd({
    distanceNm,
    aircraftClassId: aircraft.aircraftClassId,
    ferrySoftNmUsed: state.ferrySoftNmUsed,
  });
  return {
    feeUsd: fee.ferryFeeUsd,
    fromIcao: from,
    toIcao: to,
    distanceNm,
    needed: true,
  };
}

function applyLeaseReturnRepositionCharge(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  aircraft: PlayerAircraft,
  economyTick: number,
): number {
  const quote = quoteLeaseReturnRepositionFee(world, state, aircraft);
  if (!quote.needed || quote.feeUsd <= 0) return 0;
  applyWalletDelta(state, {
    amountUsd: -quote.feeUsd,
    kind: 'ferry',
    atTick: economyTick,
    aircraftId: aircraft.id,
    icao: quote.toIcao,
    note: `lease return ${quote.fromIcao}→${quote.toIcao}`,
  });
  const feeDetail = computeFerryFeeUsd({
    distanceNm: quote.distanceNm,
    aircraftClassId: aircraft.aircraftClassId,
    ferrySoftNmUsed: state.ferrySoftNmUsed,
  });
  if (feeDetail.softNmApplied > 0) {
    state.ferrySoftNmUsed =
      Math.round(
        ((state.ferrySoftNmUsed ?? 0) + feeDetail.softNmApplied) * 100,
      ) / 100;
  }
  return quote.feeUsd;
}

function resolveAvailableMarketListing(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  listingId: string,
): AircraftListing {
  const onBoard = state.aircraftMarket?.find(
    (l) => l.id === listingId && l.status === 'available',
  );
  if (onBoard) return onBoard;
  const inst = (world.aircraftInstances ?? []).find(
    (row) => row.id === listingId && row.status === 'available',
  );
  if (inst) {
    return instanceToListing(world, inst, world.tick);
  }
  throw new Error(`Listing ${listingId} is not available`);
}

export type ListAircraftMarketOpts = {
  /**
   * View another country's dealer stock (no foreign player board).
   * WORLD = all dealer pools + your own available sale/lease listings.
   * Acquire still stays home-only for foreign dealer stock.
   */
  browseCountryId?: string;
};

function availablePlayerMarketListings(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): AircraftListing[] {
  return (state.aircraftMarket ?? [])
    .filter((l) => l.status === 'available' && isPlayerListing(l))
    .map((l) => stampListingGeo(world, l));
}

export function listAircraftMarket(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts?: ListAircraftMarketOpts,
): AircraftListing[] {
  ensureAircraftMarket(state, world);
  const home = resolveMarketCountryId(world, state);
  const browse = (opts?.browseCountryId ?? home).trim().toUpperCase();
  if (browse === AIRCRAFT_MARKET_BROWSE_WORLD) {
    const dealers = dealerInstancesWorldwide(world, world.tick).map((inst) =>
      instanceToListing(world, inst, world.tick),
    );
    const mine = availablePlayerMarketListings(state, world);
    if (mine.length === 0) return dealers;
    const seen = new Set(dealers.map((l) => l.id));
    const extra = mine.filter((l) => !seen.has(l.id));
    return extra.length === 0 ? dealers : [...dealers, ...extra];
  }
  if (browse && browse !== home) {
    return dealerInstancesForMarket(world, browse, world.tick).map((inst) =>
      instanceToListing(world, inst, world.tick),
    );
  }
  return (state.aircraftMarket ?? [])
    .filter((l) => l.status === 'available')
    .map((l) => stampListingGeo(world, l));
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
      nextDueTick: economyTick + TICKS_PER_WEEK,
      termEndsTick: economyTick + listing.leaseTermMonths * TICKS_PER_MONTH,
      buyoutUsd: Math.round(
        fairValueUsd(listing.aircraftClassId, listing.condition, {
          airframeTypeId: listing.airframeTypeId,
          hoursAirframe: listing.hoursAirframe,
          hoursEngine: listing.hoursEngine,
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
  /** True when based ≠ deliver target (fee applies only when deliver/import checked). */
  needed: boolean;
  /** Cross-border import repositioning (F6). */
  crossBorder?: boolean;
};

export function computeAircraftImportFeeUsd(opts: {
  distanceNm: number;
  aircraftClassId: FreighterClassId;
}): number {
  const distanceNm = Math.max(0, opts.distanceNm);
  if (distanceNm <= 0) return 0;
  const raw =
    distanceNm *
      AIRCRAFT_IMPORT_USD_PER_NM *
      FERRY_CLASS_MULT[opts.aircraftClassId] +
    AIRCRAFT_IMPORT_HANDLING_USD;
  return Math.min(
    AIRCRAFT_IMPORT_MAX_USD,
    Math.max(AIRCRAFT_IMPORT_MIN_USD, Math.round(raw)),
  );
}

export function quoteAircraftImportForListing(
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
    throw new Error('No import destination — select a starter hub first');
  }
  if (!CAREER_HUB_COORDS[to] && !world.airports.some((a) => a.icao === to)) {
    throw new Error(`Unknown import airport: ${to}`);
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
      crossBorder: true,
    };
  }
  const distanceNm =
    hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to);
  if (distanceNm === undefined) {
    throw new Error(`No import route ${from}→${to}`);
  }
  return {
    listingId: listing.id,
    basedIcao: from,
    deliverToIcao: to,
    distanceNm,
    deliveryFeeUsd: computeAircraftImportFeeUsd({
      distanceNm,
      aircraftClassId: listing.aircraftClassId,
    }),
    needed: true,
    crossBorder: true,
  };
}

function quoteAcquireRepositionForListing(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  listing: AircraftListing,
  deliverToIcao?: string,
): AircraftDeliveryQuote {
  if (isCrossBorderAircraftListing(world, state, listing)) {
    return quoteAircraftImportForListing(
      world,
      state,
      listing,
      deliverToIcao,
    );
  }
  return quoteAircraftDeliveryForListing(world, state, listing, deliverToIcao);
}

/** Domestic delivery or cross-border import quote for buy/lease UI. */
export function quoteAircraftRepositionForListing(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  listing: AircraftListing,
  deliverToIcao?: string,
): AircraftDeliveryQuote {
  return quoteAcquireRepositionForListing(
    world,
    state,
    listing,
    deliverToIcao,
  );
}

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
  const listing = resolveAvailableMarketListing(state, world, listingId);
  if (listing.kind === 'lease') {
    throw new Error('Use signLease for lease listings');
  }
  if (listingSource(listing) === 'player_lease') {
    throw new Error('Cannot purchase your own lease listing');
  }
  if (listingSource(listing) === 'player_sale') {
    throw new Error('Cannot purchase your own sale listing');
  }
  if (!state.hubSelected) {
    throw new Error('Select a starter hub before buying aircraft');
  }
  assertClassOpsUnlocked(state.classOps, listing.aircraftClassId);

  const crossBorder = isCrossBorderAircraftListing(world, state, listing);
  let deliveryFeeUsd = 0;
  let importFeeUsd = 0;
  let deliverTo = listing.basedIcao.trim().toUpperCase();
  if (opts?.deliver) {
    const dq = quoteAcquireRepositionForListing(
      world,
      state,
      listing,
      opts.deliverToIcao,
    );
    deliverTo = dq.deliverToIcao;
    if (crossBorder) {
      importFeeUsd = dq.deliveryFeeUsd;
    } else {
      deliveryFeeUsd = dq.deliveryFeeUsd;
    }
  }

  const repositionFeeUsd = deliveryFeeUsd + importFeeUsd;
  const debitUsd = listing.askingUsd + repositionFeeUsd;
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Needs $${debitUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  const aircraft = buildAircraftFromListing(state, listing, 'owned', world.tick);
  if (opts?.deliver && deliverTo !== listing.basedIcao.trim().toUpperCase()) {
    aircraft.locationIcao = deliverTo;
  }
  const boardListing = state.aircraftMarket?.find((l) => l.id === listing.id);
  if (boardListing && boardListing.status === 'available') {
    boardListing.status = 'sold';
  }
  markDealerInstanceSold(world, listing.id);
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
  if (importFeeUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -importFeeUsd,
      kind: 'aircraft_import',
      atTick: world.tick,
      aircraftId: aircraft.id,
      icao: deliverTo,
      note: `${listing.basedIcao}→${deliverTo}`,
    });
  }
  state.fleet = [...state.fleet, aircraft];
  state.classOps = syncClassOpsFromFleet(state.classOps, state.fleet);
  return {
    state,
    aircraft,
    debitUsd,
    deliveryFeeUsd: repositionFeeUsd,
  };
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
  const listing = resolveAvailableMarketListing(state, world, listingId);
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

  const crossBorder = isCrossBorderAircraftListing(world, state, listing);
  let deliveryFeeUsd = 0;
  let importFeeUsd = 0;
  let deliverTo = listing.basedIcao.trim().toUpperCase();
  if (opts?.deliver) {
    const dq = quoteAcquireRepositionForListing(
      world,
      state,
      listing,
      opts.deliverToIcao,
    );
    deliverTo = dq.deliverToIcao;
    if (crossBorder) {
      importFeeUsd = dq.deliveryFeeUsd;
    } else {
      deliveryFeeUsd = dq.deliveryFeeUsd;
    }
  }

  const repositionFeeUsd = deliveryFeeUsd + importFeeUsd;
  const debitUsd = listing.askingUsd + repositionFeeUsd;
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Lease entry $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  const aircraft = buildAircraftFromListing(state, listing, 'leased', world.tick);
  if (opts?.deliver && deliverTo !== listing.basedIcao.trim().toUpperCase()) {
    aircraft.locationIcao = deliverTo;
  }
  if (aircraft.lease) {
    aircraft.lease.startIcao = aircraft.locationIcao.trim().toUpperCase();
  }
  markListingSold(state, world, listing);
  applyWalletDelta(state, {
    amountUsd: -listing.askingUsd,
    kind: 'aircraft_lease_sign',
    atTick: world.tick,
    aircraftId: aircraft.id,
    icao: listing.basedIcao,
    note: listing.label,
  });
  applyAcquireRepositionCharges(state, {
    world,
    listing,
    aircraft,
    crossBorder,
    deliverTo,
    deliveryFeeUsd,
    importFeeUsd,
  });
  state.fleet = [...state.fleet, aircraft];
  state.classOps = syncClassOpsFromFleet(state.classOps, state.fleet);
  return { state, aircraft, debitUsd, deliveryFeeUsd: repositionFeeUsd };
}

function assertCanDisposeOwnedAircraft(
  state: CareerMissionsState,
  aircraft: PlayerAircraft,
): void {
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
}

/** Instant dealer trade-in at 50% fair. Restocks another unit of the same SKU. */
export function sellPlayerAircraft(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick: number,
  world: CareerEconomyWorld,
): {
  state: CareerMissionsState;
  creditUsd: number;
  restockId?: string;
} {
  const idx = state.fleet.findIndex((a) => a.id === aircraftId);
  if (idx < 0) throw new Error(`Unknown aircraft ${aircraftId}`);
  const aircraft = state.fleet[idx]!;
  assertCanDisposeOwnedAircraft(state, aircraft);
  const creditUsd = sellBackValueUsd(aircraft);
  ensureAircraftConditionPcts(aircraft);
  state.fleet = state.fleet.filter((a) => a.id !== aircraftId);
  applyWalletDelta(state, {
    amountUsd: creditUsd,
    kind: 'aircraft_sell',
    atTick: economyTick,
    aircraftId: aircraft.id,
    icao: aircraft.locationIcao,
    note: aircraft.label,
  });

  let restockId: string | undefined;
  const typeId = aircraft.airframeTypeId;
  if (typeId && findCareerPlayerAirframe(typeId)) {
    ensureWorldAircraftPool(world);
    const countryId = countryIdForHubIcao(aircraft.locationIcao, world);
    const used = collectPoolRegistrations(world);
    for (const acf of state.fleet) {
      const reg = normalizeAircraftRegistration(acf.registration);
      if (reg) used.add(reg);
    }
    const delayDays = Math.floor(
      mulberry32(hashSeed(`${world.seed}:tradein:${aircraft.id}:${economyTick}`))() *
        3,
    );
    const restock = restockDealerAirframe({
      world,
      countryId,
      airframeTypeId: typeId,
      aircraftClassId: aircraft.aircraftClassId,
      preferIcao: aircraft.locationIcao,
      availableAtTick: economyTick + delayDays * TICKS_PER_DAY,
      usedRegistrations: used,
    });
    restockId = restock.id;
  }
  return { state, creditUsd, restockId };
}

/** List owned airframe on the Market at a player-chosen ask. No cash until sold. */
export function listAircraftForSale(
  state: CareerMissionsState,
  aircraftId: string,
  economyTick: number,
  askingUsd: number,
): { state: CareerMissionsState; listing: AircraftListing } {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  assertCanDisposeOwnedAircraft(state, aircraft);
  if (aircraft.status !== 'parked' && aircraft.status !== 'maintenance') {
    throw new Error('Aircraft must be parked to list for sale');
  }
  const fair = fairValueUsd(aircraft.aircraftClassId, aircraft.condition ?? 'good', {
    airframeTypeId: aircraft.airframeTypeId,
    hoursAirframe: aircraft.hoursAirframe,
    hoursEngine: aircraft.hoursEngine,
  });
  const ask = clampPlayerSaleAskingUsd(askingUsd, fair);
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
    askingUsd: ask,
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
  aircraft.status = 'listed';
  aircraft.listedListingId = listing.id;
  state.aircraftMarket = [...(state.aircraftMarket ?? []), listing];
  return { state, listing };
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
  opts?: { termMonths?: number; monthlyUsd?: number },
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
  const catalogWeekly = aircraftLeaseWeeklyUsd(aircraft.aircraftClassId, {
    airframeTypeId: aircraft.airframeTypeId,
  });
  const monthly = clampPlayerLeaseWeeklyUsd(
    opts?.monthlyUsd ?? catalogWeekly,
    catalogWeekly,
  );
  const termMonths = clampPlayerLeaseTermMonths(opts?.termMonths ?? 3);
  const deposit = Math.max(1, Math.round(monthly * PLAYER_LEASE_DEPOSIT_WEEKS));
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
    askingUsd: deposit,
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
    throw new Error('Aircraft is not listed');
  }
  const listing = state.aircraftMarket?.find(
    (l) =>
      l.id === aircraft.listedListingId ||
      (isPlayerListing(l) &&
        l.sellerAircraftId === aircraftId &&
        l.status === 'available'),
  );
  if (!listing || listing.status !== 'available') {
    throw new Error('Listing is no longer available to unlist');
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
      lease.nextDueTick += TICKS_PER_WEEK;
      aircraft.leaseOverdue = false;
    }
    // More weeks due but capped — leave overdue so Hangar prompts payment.
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
      if (world) {
        const returnQuote = quoteLeaseReturnRepositionFee(world, state, aircraft);
        if (
          returnQuote.needed &&
          returnQuote.feeUsd > 0 &&
          state.walletUsd < returnQuote.feeUsd
        ) {
          lease.termEndedSoft = true;
          aircraft.leaseOverdue = true;
          if (!overdueIds.includes(aircraft.id)) overdueIds.push(aircraft.id);
          termEndedSoft.push(aircraft.id);
          keep.push(aircraft);
          continue;
        }
        applyLeaseReturnRepositionCharge(state, world, aircraft, economyTick);
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

/** Weeks still owed on a player lease (at least 1 while the term is active). */
export function leaseRemainingWeeks(
  aircraft: PlayerAircraft,
  economyTick: number,
): number {
  const lease = aircraft.lease;
  if (!lease) return 0;
  const ticksLeft = lease.termEndsTick - economyTick;
  if (ticksLeft <= 0) return 0;
  return Math.max(1, Math.ceil(ticksLeft / TICKS_PER_WEEK));
}

/** @deprecated Prefer leaseRemainingWeeks. */
export function leaseRemainingMonths(
  aircraft: PlayerAircraft,
  economyTick: number,
): number {
  return Math.max(1, Math.ceil(leaseRemainingWeeks(aircraft, economyTick) / 4));
}

/**
 * Early-return penalty: half the remaining weeks of rent, clamped to 1–4 weeks.
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
  const remaining = leaseRemainingWeeks(aircraft, economyTick);
  if (remaining <= 0) {
    throw new Error('Lease term already ended — the lessor will reclaim the airframe');
  }
  const weeksBilled = Math.min(4, Math.max(1, Math.ceil(remaining * 0.5)));
  return Math.round(aircraft.lease.monthlyUsd * weeksBilled);
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
  world?: CareerEconomyWorld,
): {
  state: CareerMissionsState;
  debitUsd: number;
  returnFerryUsd: number;
  remainingMonths: number;
} {
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
  const penaltyUsd = quoteLeaseEarlyReturnUsd(aircraft, economyTick);
  const returnQuote =
    world != null
      ? quoteLeaseReturnRepositionFee(world, state, aircraft)
      : { feeUsd: 0, needed: false };
  const returnFerryUsd =
    returnQuote.needed && returnQuote.feeUsd > 0 ? returnQuote.feeUsd : 0;
  const totalDebit = penaltyUsd + returnFerryUsd;
  if (totalDebit > 0 && state.walletUsd < totalDebit) {
    throw new Error(
      `Early return $${totalDebit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  if (penaltyUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -penaltyUsd,
      kind: 'lease_early_return',
      atTick: economyTick,
      aircraftId: aircraft.id,
      icao: aircraft.locationIcao,
      note: `${aircraft.label} · ${remainingMonths} mo left`,
    });
  }
  if (world && returnFerryUsd > 0) {
    applyLeaseReturnRepositionCharge(state, world, aircraft, economyTick);
  }
  state.fleet = state.fleet.filter((a) => a.id !== aircraft.id);
  return {
    state,
    debitUsd: totalDebit,
    returnFerryUsd,
    remainingMonths,
  };
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
