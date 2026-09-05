/**
 * Phase 2 — limited NPC freighter fleet competing for market lots.
 * Same capacity/range rules as the player; no wallet credit on settle.
 * Flight timing is wall-clock (ms); 15-min batches only decide new bids.
 */

import {
  hoursToMs,
  hoursToTicks,
  MS_PER_TICK,
  msToHours,
} from './career-clock.js';
import {
  applyFreightDelivery,
  airportByIcao,
  ensureAirportMroInventory,
  getCommodity,
  routeDistanceNm,
  shrinkLotAfterDelivery,
  SMALL_LOT_MAX_KG,
  LARGE_LOT_MIN_KG,
} from './career-economy.js';
import {
  bushRequiresLightGa,
  isBushFreightOdAllowed,
  isBushHub,
} from './career-bush.js';
import { applyNpcFuelUplift } from './career-fuel.js';
import { assertClassOpsUnlocked } from './career-class-ops.js';
import {
  hubLevelNpcBidMult,
  clampHubLevel,
} from './career-hub-level.js';
import {
  bumpLaneInboundIndex,
  ensureLaneInboundIndex,
  invalidateLaneInboundIndex,
  laneInboundKgFromIndex,
  type LaneInboundIndex,
} from './career-lane-index.js';
import {
  estimateRouteCargoLimit,
  getAircraftClass,
  listActivePlayerMissions,
  recomputeMissionTotals,
  reserveShipmentLot,
  syncPlayerInbound,
} from './career-mission.js';
import {
  findCareerPlayerAirframe,
  isCareerPlayerAirframeEnabled,
  listCareerPlayerAirframes,
  resolveAirframePerfForUi,
} from './career-player-airframes.js';
import { noteLotClaimed, noteNpcLeg, noteNpcRest } from './career-economy-flow.js';
import {
  CONTRACT_PILOT_FEE_MIN_USD,
  quoteContractPilotFeeUsd,
} from './career-contract-pilot-fee.js';
import {
  countryIdFromRegion,
  isDomesticOd,
  isInternationalOdAllowed,
} from './career-partition.js';
import { syncPilotIcaoTo } from './career-pilot-travel.js';
import {
  listHomologatedNpcAirframesForClass,
  npcAirframeIsHomologated,
  npcAirframeLabel,
  npcCanOfferContractPilot,
  npcMaxCargoKg,
  pickNpcAirframe,
} from './career-npc-airframes.js';
import {
  regionalWeatherBidMult,
  regionalWeatherIndex,
  type RegionalWeather,
} from './career-weather.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  FreighterClassId,
  MissionIntent,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  ShipmentLot,
} from './types/career-economy.js';

export {
  NPC_AIRFRAME_VARIANTS,
  findNpcAirframe,
  listHomologatedNpcAirframesForClass,
  listNpcAirframesForClass,
  npcAirframeIsHomologated,
  npcAirframeLabel,
  npcCanOfferContractPilot,
  npcMaxCargoKg,
  pickNpcAirframe,
  type NpcAirframeVariant,
} from './career-npc-airframes.js';

/**
 * Fleet size scales with mapped regions (not a fixed global cap).
 * ~11 ops/region: ~20 regions ≈ 220; 26 regions (with AR/CL) ≈ 286.
 */
export const NPCS_PER_REGION = 11;
export const NPC_FLEET_MIN = 40;

/** Class mix shares (sum = 1). Leaner light_ga — pulse showed GA idle on a large board. */
export const NPC_FLEET_CLASS_SHARES: ReadonlyArray<{
  aircraftClassId: FreighterClassId;
  share: number;
}> = [
  { aircraftClassId: 'light_ga', share: 0.14 },
  { aircraftClassId: 'light_turboprop', share: 0.26 },
  { aircraftClassId: 'light_jet', share: 0.12 },
  { aircraftClassId: 'medium_piston', share: 0.08 },
  { aircraftClassId: 'narrow_freighter', share: 0.26 },
  { aircraftClassId: 'wide_freighter', share: 0.14 },
] as const;

export type NpcFleetCompositionSlot = {
  aircraftClassId: FreighterClassId;
  count: number;
};

/** Unique non-empty region ids from a region list or airport rows. */
export function listNpcHomeRegions(
  regionsOrAirports: ReadonlyArray<string | { region?: string | null }>,
): string[] {
  const out = new Set<string>();
  for (const row of regionsOrAirports) {
    const region =
      typeof row === 'string' ? row.trim() : (row.region ?? '').trim();
    if (region) out.add(region);
  }
  return [...out].sort();
}

export function targetNpcFleetSize(regionCount: number): number {
  const regions = Math.max(0, Math.floor(regionCount));
  return Math.max(NPC_FLEET_MIN, regions * NPCS_PER_REGION);
}

/**
 * Resolve absolute class counts for a region count (largest-remainder on shares).
 */
export function resolveNpcFleetComposition(
  regionCount: number,
): NpcFleetCompositionSlot[] {
  const total = targetNpcFleetSize(regionCount);
  const rows = NPC_FLEET_CLASS_SHARES.map((slot) => {
    const exact = total * slot.share;
    return {
      aircraftClassId: slot.aircraftClassId,
      exact,
      count: Math.floor(exact),
      frac: exact - Math.floor(exact),
    };
  });
  let allocated = rows.reduce((n, r) => n + r.count, 0);
  const byFrac = [...rows].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.aircraftClassId.localeCompare(b.aircraftClassId);
  });
  let i = 0;
  while (allocated < total && byFrac.length > 0) {
    byFrac[i % byFrac.length]!.count += 1;
    allocated += 1;
    i += 1;
  }
  return rows.map((r) => ({
    aircraftClassId: r.aircraftClassId,
    count: r.count,
  }));
}

/**
 * @deprecated Prefer resolveNpcFleetComposition(regionCount). Reference mix
 * for a 20-region map (legacy absolute table size).
 */
export const NPC_FLEET_COMPOSITION: ReadonlyArray<NpcFleetCompositionSlot> =
  resolveNpcFleetComposition(20);

/**
 * @deprecated Prefer targetNpcFleetSize(regionCount). Reference size for
 * a 20-region map.
 */
export const NPC_FLEET_SIZE = targetNpcFleetSize(20);

/** Floor so Bonanza-class (450 kg) can bid true LTL; was 500 and excluded GA. */
export const NPC_MIN_BID_KG = 80;

/** Minimum airborne block so ultra-short hops aren't instant. */
const MIN_BLOCK_HOURS = 1;
/**
 * Post-arrival ground dwell (jittered ×0.55–1.45 → ~16–43 min).
 * Shorter than the old 1h base — pulse showed chronic turnaround thin-fleet.
 */
const TURNAROUND_HOURS = 0.5;
/** Economy-tick floor after block time (~30 min = 2 × 15-min batches). */
const TURNAROUND_MIN_TICKS = 2;

export {
  CONTRACT_PILOT_FEE_FRAC,
  CONTRACT_PILOT_FEE_MIN_USD,
  boardNetSortUsd,
  operatorFreightFromPilotFeeUsd,
  quoteContractPilotFeeUsd,
} from './career-contract-pilot-fee.js';
/** Min wall-clock hours an awaiting_pilot offer stays open. */
export const AWAITING_PILOT_MIN_HOURS = 3;
/** Max wall-clock hours an awaiting_pilot offer stays open. */
export const AWAITING_PILOT_MAX_HOURS = 8;
/**
 * Short hold when an active home country is below its starter crew floor —
 * recycles the slot if nobody accepts.
 */
export const AWAITING_PILOT_SHORT_MIN_HOURS = 0.5;
export const AWAITING_PILOT_SHORT_MAX_HOURS = 2;
/**
 * Chance a homologated NPC claim becomes a crew-needed offer instead of
 * departing immediately. High so early-game contract pilots see a live board.
 */
export const CONTRACT_PILOT_OFFER_CHANCE = 0.9;
/**
 * Classes a brand-new contract pilot can sit (Class Ops starters).
 * The global crew-needed cap used to be one bucket — Narrow/Wide filled it
 * and the empty-hangar starter stared at 737s they cannot fly.
 */
export const STARTER_CONTRACT_PILOT_CLASSES: ReadonlySet<FreighterClassId> =
  new Set(['light_ga', 'light_turboprop']);

export function isStarterContractPilotClass(
  classId: FreighterClassId | undefined,
): boolean {
  return classId != null && STARTER_CONTRACT_PILOT_CLASSES.has(classId);
}

export type ContractPilotOfferBand = 'starter' | 'other' | 'all';

/**
 * Cap concurrent crew-needed freight holds per region, per band.
 *
 * Each hold parks its NPC *and* its lot for 3–8h before the leg even departs.
 * Uncapped at a 0.9 offer chance this swallowed most of the fleet's duty time.
 * Starter and jet+ bands are counted separately so loosening GA contracts
 * does not re-park the heavy fleet.
 */
export const STARTER_CONTRACT_PILOT_OFFERS_PER_REGION = 0.4;
export const MIN_OPEN_STARTER_CONTRACT_PILOT_OFFERS = 8;
/** Jet / medium / narrow / wide band. */
export const MAX_OPEN_CONTRACT_PILOT_OFFERS_PER_REGION = 0.35;
/** Floor so small maps still show a live crew-needed board. */
export const MIN_OPEN_CONTRACT_PILOT_OFFERS = 4;

/**
 * Starter crew floor for the player's home country (SP) / company homes (MP).
 * Global 0.4×regions still applies elsewhere; this reserves local Fly slots.
 */
export const MIN_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY = 10;
/** Per extra company in that country (MP hook; SP companyCount=1 → floor 10). */
export const STARTER_CREW_OFFERS_PER_EXTRA_COMPANY = 4;
export const MAX_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY = 40;

function npcHomeRegionCount(world: CareerEconomyWorld): number {
  return new Set(world.airports.map((ap) => ap.region).filter(Boolean)).size;
}

export function maxOpenContractPilotOffers(
  world: CareerEconomyWorld,
  band: ContractPilotOfferBand = 'all',
): number {
  const regions = npcHomeRegionCount(world);
  const starter = Math.max(
    MIN_OPEN_STARTER_CONTRACT_PILOT_OFFERS,
    Math.round(regions * STARTER_CONTRACT_PILOT_OFFERS_PER_REGION),
  );
  const other = Math.max(
    MIN_OPEN_CONTRACT_PILOT_OFFERS,
    Math.round(regions * MAX_OPEN_CONTRACT_PILOT_OFFERS_PER_REGION),
  );
  if (band === 'starter') return starter;
  if (band === 'other') return other;
  return starter + other;
}

export function countOpenContractPilotOffers(
  world: CareerEconomyWorld,
  band: ContractPilotOfferBand = 'all',
): number {
  return world.npcFlights.filter((f) => {
    if (f.status !== 'awaiting_pilot' || isNpcRepositionFlight(f)) return false;
    if (band === 'all') return true;
    const starter = isStarterContractPilotClass(f.aircraftClassId);
    return band === 'starter' ? starter : !starter;
  }).length;
}

/** ISO country of a lot/flight origin hub (`BR`), or null if unknown. */
export function contractPilotOriginCountry(
  world: CareerEconomyWorld,
  originIcao: string,
): string | null {
  const ap = airportByIcao(world, originIcao.trim().toUpperCase());
  const region = (ap?.region ?? '').trim();
  if (!region) return null;
  const id = countryIdFromRegion(region);
  return /^[A-Z]{2}$/.test(id) && id !== 'XX' ? id : null;
}

/**
 * Countries that keep a starter crew floor. SP: `world.homeCountryId` only.
 * (MP later: company home countries.)
 */
export function activeContractPilotCountries(
  world: Pick<CareerEconomyWorld, 'homeCountryId'>,
): string[] {
  const home = (world.homeCountryId ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(home) ? [home] : [];
}

/**
 * Starter awaiting_pilot floor for one active country.
 * `companyCount` defaults to 1 (single-player / one company).
 */
export function starterContractPilotCountryFloor(companyCount = 1): number {
  const n = Math.max(1, Math.floor(companyCount));
  return Math.min(
    MAX_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY,
    MIN_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY +
      STARTER_CREW_OFFERS_PER_EXTRA_COMPANY * Math.max(0, n - 1),
  );
}

/** Open freight crew holds (not ferry) whose origin is in `countryId`. */
export function countOpenContractPilotOffersInCountry(
  world: CareerEconomyWorld,
  countryId: string,
  band: Exclude<ContractPilotOfferBand, 'all'> = 'starter',
): number {
  const want = countryId.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(want)) return 0;
  return world.npcFlights.filter((f) => {
    if (f.status !== 'awaiting_pilot' || isNpcRepositionFlight(f)) return false;
    const starter = isStarterContractPilotClass(f.aircraftClassId);
    if (band === 'starter' ? !starter : starter) return false;
    return contractPilotOriginCountry(world, f.originIcao) === want;
  }).length;
}

/** True when origin country is active and still under its starter floor. */
export function starterContractPilotCountryNeedsFloor(
  world: CareerEconomyWorld,
  originIcao: string,
  companyCountInCountry = 1,
): boolean {
  const country = contractPilotOriginCountry(world, originIcao);
  if (!country) return false;
  if (!activeContractPilotCountries(world).includes(country)) return false;
  const floor = starterContractPilotCountryFloor(companyCountInCountry);
  return (
    countOpenContractPilotOffersInCountry(world, country, 'starter') < floor
  );
}

/** Min wall-clock hours a reposition crew offer stays open. */
export const REPOSITION_AWAITING_MIN_HOURS = 0.5;
/** Max wall-clock hours a reposition crew offer stays open. */
export const REPOSITION_AWAITING_MAX_HOURS = 1.5;
/** Cap open jet+ reposition crew offers so the freight board isn't ferry spam. */
export const MAX_OPEN_REPOSITION_OFFERS = 3;
/** Reserved empty-return holds for light GA / turboprop (starter ferry). */
export const MAX_OPEN_STARTER_REPOSITION_OFFERS = 3;
/** Floor for empty-home ferry pilot fee (matches hangar ferry floor band). */
export const REPOSITION_PILOT_FEE_MIN_USD = 75;

/**
 * Full-rate Hangar ferry $/nm by class (FERRY_FEE_USD_PER_NM × FERRY_CLASS_MULT).
 * Mirrored here to avoid a career-npc ↔ career-fleet import cycle.
 */
const HANGAR_FERRY_FULL_USD_PER_NM: Record<FreighterClassId, number> = {
  light_ga: 2.5 * 0.85,
  light_turboprop: 2.5 * 1,
  light_jet: 2.5 * 1.5,
  medium_piston: 2.5 * 1.9,
  narrow_freighter: 2.5 * 2.2,
  wide_freighter: 2.5 * 4,
};

/**
 * Contract ferry pays the same $/nm as a full-rate Hangar ferry for that class
 * (no early soft-budget discount — that perk is only for owning/relocating).
 */
export function quoteRepositionPilotFeeUsd(
  distanceNm: number,
  aircraftClassId: FreighterClassId,
): number {
  const dist = Math.max(0, distanceNm);
  const rate = HANGAR_FERRY_FULL_USD_PER_NM[aircraftClassId] ?? 2.5;
  return Math.max(REPOSITION_PILOT_FEE_MIN_USD, Math.round(dist * rate));
}

export function isNpcRepositionFlight(
  flight: Pick<NpcFlight, 'kind'>,
): boolean {
  return flight.kind === 'reposition';
}

/**
 * Abstract shop interval (block hours) — aligned with player inspection gates,
 * slightly stretched so the board isn't permanently half-MX.
 */
export const NPC_MX_INTERVAL_HOURS: Record<FreighterClassId, number> = {
  light_ga: 90,
  light_turboprop: 110,
  light_jet: 150,
  medium_piston: 160,
  narrow_freighter: 180,
  wide_freighter: 220,
};

/** Ground shop dwell once MX is due. */
export const NPC_MX_SHOP_HOURS: Record<FreighterClassId, number> = {
  light_ga: 2,
  light_turboprop: 2.5,
  light_jet: 3,
  medium_piston: 3.5,
  narrow_freighter: 4,
  wide_freighter: 5.5,
};

/** Parts drawn from terminal MRO stock per shop visit (not freight). */
export const NPC_MX_PARTS_KG: Record<FreighterClassId, number> = {
  light_ga: 40,
  light_turboprop: 60,
  light_jet: 120,
  medium_piston: 160,
  narrow_freighter: 200,
  wide_freighter: 400,
};
/** Spread departures inside the same economy batch (wall-clock ms). */
const DEPART_STAGGER_MS = 25 * 60 * 1000;
/** Last economy batch of the leg counts as "arriving". */
const ARRIVING_WINDOW_MS = MS_PER_TICK;
/**
 * Duty / rest — pulse showed ~15–20 resting at 120 fleet was fine, but with
 * chronic low ready we give slightly longer duty windows and shorter rests.
 */
const MAX_DUTY_HOURS = 10.5;
/** A single long leg also forces rest after its turnaround. */
const LONG_LEG_DUTY_HOURS = 7;
const MIN_REST_HOURS = 10;
const MAX_REST_HOURS = 14;
const CRUISE_KT: Record<FreighterClassId, number> = {
  narrow_freighter: 430,
  wide_freighter: 480,
  medium_piston: 290,
  light_jet: 430,
  light_turboprop: 185,
  light_ga: 170,
};

const NPC_NAME_POOL = [
  'Skyhaul Express',
  'Pampas Air Cargo',
  'Atlantic Freighters',
  'Serra Logistics',
  'Costa Line Cargo',
  'Planalto Airlink',
  'Nordeste Haul',
  'Guarani Freight',
  'Tropic Lift',
  'Campo Verde Air',
  'Baía Cargo',
  'Andes Bridge Co',
  'Pantanal Hop',
  'Litoral Charter',
  'Cerrado Air Taxi',
  'Serra Bush Cargo',
  'Prairie Wing Cargo',
  'Gulfstream Freight',
  'Great Lakes Lift',
  'Sunbelt Haulers',
  'Cascade Air Cargo',
  'Desert West Freight',
  'Empire State Haul',
  'Heartland Freighters',
  'Pacific Rim Cargo',
  'Lone Star Airlink',
  'Appalachian Lift',
  'Bayou Charter Co',
  'Blue Ridge Freight',
  'Hudson Valley Cargo',
  'New England Airlift',
  'Midwest Cargo Link',
  'Mississippi Valley Air',
  'Rocky Mountain Freight',
  'Golden Gate Cargo',
  'Puget Sound Airlift',
  'Southern Cross Freight',
  'Rio Grande Logistics',
  'Ozark Cargo Lines',
  'Great Plains Air',
  'Coastal Bridge Cargo',
  'Frontier Freightways',
  'Metro Air Logistics',
  'Continental Cargo Co',
] as const;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash01(seed: string): number {
  return hashSeed(seed) / 4294967296;
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

function npcBidScore(args: {
  fillRatio: number;
  payScore: number;
  urgencyHot: boolean;
  expiryFrac: number;
  regionMatch: boolean;
  noise: number;
  busyPenalty: number;
  aggressiveness: number;
  /** Value/Heavy large-lot lift (electronics/machinery). */
  liftBonus?: number;
  /** Phase E2: heavy freighters deprioritize Value LTL. */
  ltlPenalty?: number;
}): number {
  const urgencyScore = args.urgencyHot
    ? 0.55 * args.aggressiveness
    : 0.12 * args.aggressiveness;
  const expiryScore = args.expiryFrac * (0.25 + 0.55 * args.aggressiveness);
  const regionScore = args.regionMatch ? 0.4 : 0;
  return (
    args.fillRatio * 0.85 +
    args.payScore * 0.55 +
    urgencyScore +
    expiryScore +
    regionScore +
    (args.liftBonus ?? 0) +
    args.noise -
    args.busyPenalty -
    (args.ltlPenalty ?? 0)
  );
}

/**
 * Prefer clearing large electronics/machinery (Phase D, strengthened in E2).
 */
export function valueHeavyNpcLiftBonus(
  lot: Pick<
    ShipmentLot,
    'commodityId' | 'quantityKg' | 'createdAtTick' | 'expiresAtTick'
  >,
  tick: number,
  aircraftClassId: FreighterClassId,
): number {
  if (lot.commodityId !== 'electronics' && lot.commodityId !== 'machinery') {
    return 0;
  }
  if (lot.quantityKg < LARGE_LOT_MIN_KG) return 0;
  const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
  const expiryFrac = 1 - Math.max(0, lot.expiresAtTick - tick) / life;
  let bonus = 0.55 + expiryFrac * 0.75;
  if (HEAVY_FREIGHTER_CLASSES.has(aircraftClassId)) bonus *= 1.35;
  return bonus;
}

/**
 * Phase E2: Narrow/Wide leave Value LTL for light classes / player so their
 * payload clears large lots (claimShare stuck ~0.33 with D lift alone).
 */
export function valueHeavyNpcLtlPenalty(
  lot: Pick<ShipmentLot, 'commodityId' | 'quantityKg'>,
  aircraftClassId: FreighterClassId,
): number {
  if (lot.commodityId !== 'electronics' && lot.commodityId !== 'machinery') {
    return 0;
  }
  if (lot.quantityKg >= LARGE_LOT_MIN_KG) return 0;
  if (!HEAVY_FREIGHTER_CLASSES.has(aircraftClassId)) return 0;
  return 0.55;
}

function lotAvailableKg(lot: ShipmentLot): number {
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function airportRegion(world: CareerEconomyWorld, icao: string): string | undefined {
  return airportByIcao(world, icao)?.region;
}

function flightArrivesAtMs(flight: NpcFlight): number {
  if (typeof flight.arrivesAtMs === 'number' && Number.isFinite(flight.arrivesAtMs)) {
    return flight.arrivesAtMs;
  }
  // Legacy fallback: approximate from tick fields using batch anchor
  return 0;
}

function flightDepartedAtMs(flight: NpcFlight): number {
  if (typeof flight.departedAtMs === 'number' && Number.isFinite(flight.departedAtMs)) {
    return flight.departedAtMs;
  }
  return 0;
}

function npcBusyUntilMs(npc: NpcFreighter): number {
  if (typeof npc.busyUntilMs === 'number' && Number.isFinite(npc.busyUntilMs)) {
    return npc.busyUntilMs;
  }
  return 0;
}

function npcRestUntilMs(npc: NpcFreighter): number {
  if (typeof npc.restUntilMs === 'number' && Number.isFinite(npc.restUntilMs)) {
    return npc.restUntilMs;
  }
  return 0;
}

function npcMxUntilMs(npc: NpcFreighter): number {
  if (typeof npc.mxUntilMs === 'number' && Number.isFinite(npc.mxUntilMs)) {
    return npc.mxUntilMs;
  }
  return 0;
}

/**
 * Ground hold (turnaround / rest / MX) is over when wall-clock says so, OR when
 * the economy tick has passed the stamped until-tick. Tick wins on drift:
 * busyUntilTick can be long expired while busyUntilMs was shifted into the future
 * (pulse sweeps / wall rewinds), which otherwise parks NPCs for days.
 */
function groundHoldExpired(
  untilMs: number,
  untilTick: number | undefined,
  nowMs: number,
  worldTick: number,
): boolean {
  if (typeof untilTick === 'number' && Number.isFinite(untilTick) && untilTick <= worldTick) {
    return true;
  }
  return untilMs <= nowMs;
}

/** True when the NPC could enter the bid pool at nowMs (idle / rest or turnaround done). */
export function isNpcReadyToBid(
  npc: NpcFreighter,
  nowMs: number,
  worldTick = Number.POSITIVE_INFINITY,
): boolean {
  if (npc.currentFlightId) return false;
  if (
    npc.status === 'maintenance' &&
    !groundHoldExpired(npcMxUntilMs(npc), npc.mxUntilTick, nowMs, worldTick)
  ) {
    return false;
  }
  if (
    npc.status === 'resting' &&
    !groundHoldExpired(npcRestUntilMs(npc), npc.restUntilTick, nowMs, worldTick)
  ) {
    return false;
  }
  if (
    npc.status === 'busy' &&
    !groundHoldExpired(npcBusyUntilMs(npc), npc.busyUntilTick, nowMs, worldTick)
  ) {
    return false;
  }
  return true;
}

/**
 * Fraction of home-region NPCs ready to bid (0 = all resting/busy, 1 = all ready).
 * Empty home region → 1 (neutral; no artificial scarcity).
 */
export function npcRegionBidCapacity(
  world: CareerEconomyWorld,
  region: string,
  nowMs = Date.now(),
): number {
  const home = (world.npcs ?? []).filter((n) => n.homeRegion === region);
  if (home.length === 0) return 1;
  let ready = 0;
  for (const npc of home) {
    if (isNpcReadyToBid(npc, nowMs, world.tick)) ready += 1;
  }
  return ready / home.length;
}

/**
 * Loaded legs a freighter completes per career day, averaged over duty and rest.
 * Duty caps at MAX_DUTY_HOURS with a 10–14h rest after, so a freighter is only
 * productive about half the day. Measured against the 7d pulse (286 NPCs lifting
 * ~6,200 t/day against ~5,300 t of nominal capacity).
 */
export const NPC_LEGS_PER_DAY_EST = 1.2;

/**
 * Freight one partition's home fleet can lift per career day.
 * Formation uses this so the board is sized by transport capacity instead of
 * by how much surplus the map happens to hold.
 */
export function partitionLiftableKgPerDay(
  world: CareerEconomyWorld,
  countryId: string,
  opts: { heavyOnly?: boolean } = {},
): number {
  let kg = 0;
  for (const npc of world.npcs ?? []) {
    if (countryIdFromRegion(npc.homeRegion ?? '') !== countryId) continue;
    if (opts.heavyOnly === true && !HEAVY_FREIGHTER_CLASSES.has(npc.aircraftClassId)) {
      continue;
    }
    kg += npcMaxCargoKg(npc);
  }
  return kg * NPC_LEGS_PER_DAY_EST;
}

/**
 * Classes that live on large/XL freight. They are only ~40% of the fleet by
 * headcount but the overwhelming majority of its lift, so the board needs a
 * heavy sub-target — a flat backoff starved them into a GA-only market.
 */
export const HEAVY_FREIGHTER_CLASSES: ReadonlySet<FreighterClassId> = new Set([
  'narrow_freighter',
  'wide_freighter',
]);

/**
 * One Wide freighter full load — saturation 1.0 at this inbound kg on a lane.
 * Was 28 t (Narrow-era); raised so a single Wide fill does not lock the OD.
 */
export const LANE_SATURATION_KG = 90_000;

export type { LaneInboundIndex };
export {
  bumpLaneInboundIndex,
  buildLaneInboundIndex,
  ensureLaneInboundIndex,
  invalidateLaneInboundIndex,
  laneInboundKgFromIndex,
} from './career-lane-index.js';

/**
 * kg currently in_flight on a specific origin→dest lane for a commodity.
 * Pass originIcao null/undefined to sum all inbound to dest (soft fill shadow).
 * NPC flights only — for soft-fill + player pending use `laneInboundKg`.
 */
export function npcLaneAirborneKg(
  world: CareerEconomyWorld,
  originIcao: string | null | undefined,
  destIcao: string,
  commodityId: CommodityId,
): number {
  const dest = destIcao.toUpperCase();
  const origin =
    typeof originIcao === 'string' && originIcao.length > 0
      ? originIcao.toUpperCase()
      : null;
  let kg = 0;
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'in_flight') continue;
    if (flight.commodityId !== commodityId) continue;
    if (flight.destIcao.toUpperCase() !== dest) continue;
    if (origin && flight.originIcao.toUpperCase() !== origin) continue;
    kg += Math.max(0, flight.cargoKg);
  }
  return kg;
}

/**
 * Player cargo already notified to dest (accepted / dispatched / in_flight).
 * Pass originIcao null/undefined to sum all player inbound to dest.
 */
export function playerLaneInboundKg(
  world: CareerEconomyWorld,
  originIcao: string | null | undefined,
  destIcao: string,
  commodityId: CommodityId,
): number {
  const dest = destIcao.toUpperCase();
  const origin =
    typeof originIcao === 'string' && originIcao.length > 0
      ? originIcao.toUpperCase()
      : null;
  let kg = 0;
  for (const pending of world.inboundPending ?? []) {
    if (pending.source !== 'player') continue;
    if (pending.commodityId !== commodityId) continue;
    if (pending.destIcao.toUpperCase() !== dest) continue;
    if (origin && pending.originIcao.toUpperCase() !== origin) continue;
    kg += Math.max(0, pending.cargoKg);
  }
  return kg;
}

/**
 * Soft-fill / lane contract: NPC airborne + player inbound pending.
 * Pass originIcao null/undefined to sum all inbound to dest.
 */
export function laneInboundKg(
  world: CareerEconomyWorld,
  originIcao: string | null | undefined,
  destIcao: string,
  commodityId: CommodityId,
): number {
  return laneInboundKgFromIndex(
    ensureLaneInboundIndex(world),
    originIcao,
    destIcao,
    commodityId,
  );
}

/** 0..1 lane saturation; 1 ≈ ≥90t inbound (NPC + player) on that OD+commodity. */
export function npcLaneSaturation(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
  commodityId: CommodityId,
): number {
  const airborne = laneInboundKg(world, originIcao, destIcao, commodityId);
  return Math.min(1, airborne / LANE_SATURATION_KG);
}

/** Capacity below this → UI "thin fleet" / richer freight chip. */
/** Ready-fraction below this → thin-fleet pressure (pay / UI). Softened from 0.45
 *  after pulse showed healthy ~55% util rarely leaves ≥45% ready. */
export const THIN_FLEET_CAPACITY = 0.35;
/** Saturation at/above this → UI "lane busy" chip (matches scarce-pay threshold). */
export const LANE_BUSY_SATURATION = 0.35;
/** Formation pay: `1 + (1 - readyFraction) * slope`. Thin regions must move the wallet. */
export const THIN_FLEET_PAY_SLOPE = 0.45;
/** Formation pay on busy lanes: `1 + saturation * slope` once laneBusy. */
export const LANE_BUSY_PAY_SLOPE = 0.28;

export type LotMarketPressure = {
  originRegion: string;
  originRegionCapacity: number;
  laneSaturation: number;
  thinFleet: boolean;
  laneBusy: boolean;
  /** Worse of origin/dest regional weather for this lane. */
  weather: RegionalWeather;
  /** True when idle age has raised freight above formation pay. */
  idleEscalated?: boolean;
  /** Current idle pay multiplier (>= 1). */
  idlePayMult?: number;
  /** Active regional demand shocks touching this OD. */
  demandShock?: boolean;
  /** Short shock labels for chips. */
  shockLabels?: string[];
  /** Combined freight pay multiplier from shocks (>= 1). */
  shockPayMult?: number;
  /** True when origin/dest countries differ. */
  international?: boolean;
};

export type RegionMarketPressure = {
  region: string;
  capacity: number;
  thinFleet: boolean;
  /** Any outbound OD+commodity from this region is at/above LANE_BUSY_SATURATION. */
  laneBusy: boolean;
  ready: number;
  total: number;
  resting: number;
  /** Abstract shop visits (MRO) — also off the bid pool. */
  maintenance: number;
  weather: RegionalWeather;
};

/** Home regions whose outbound lanes currently pay/score as busy. */
function busyOriginRegions(world: CareerEconomyWorld): Set<string> {
  const busy = new Set<string>();
  const seen = new Set<string>();
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'in_flight') continue;
    const origin = flight.originIcao.trim().toUpperCase();
    const dest = flight.destIcao.trim().toUpperCase();
    const key = `${origin}|${dest}|${flight.commodityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      npcLaneSaturation(world, origin, dest, flight.commodityId) <
      LANE_BUSY_SATURATION
    ) {
      continue;
    }
    const region = airportRegion(world, origin);
    if (region) busy.add(region);
  }
  return busy;
}

/** Player-facing pressure signals for one market lot (origin region + OD lane). */
export function describeLotMarketPressure(
  world: CareerEconomyWorld,
  lot: Pick<ShipmentLot, 'originIcao' | 'destIcao' | 'commodityId'>,
  nowMs = Date.now(),
): LotMarketPressure {
  const originRegion =
    airportRegion(world, lot.originIcao) ??
    world.airports.find((a) => a.icao === lot.originIcao.toUpperCase())?.region ??
    '';
  const destRegion = airportRegion(world, lot.destIcao) ?? '';
  const originRegionCapacity = originRegion
    ? npcRegionBidCapacity(world, originRegion, nowMs)
    : 1;
  const laneSaturation = npcLaneSaturation(
    world,
    lot.originIcao,
    lot.destIcao,
    lot.commodityId,
  );
  const originWx = originRegion
    ? regionalWeatherIndex(world, originRegion)
    : 'fair';
  const destWx = destRegion ? regionalWeatherIndex(world, destRegion) : 'fair';
  const weather =
    originWx === 'poor' || destWx === 'poor'
      ? 'poor'
      : originWx === 'marginal' || destWx === 'marginal'
        ? 'marginal'
        : 'fair';
  return {
    originRegion,
    originRegionCapacity,
    laneSaturation,
    thinFleet: originRegionCapacity < THIN_FLEET_CAPACITY,
    laneBusy: laneSaturation >= LANE_BUSY_SATURATION,
    weather,
  };
}

/** Per-home-region fleet readiness for the competing-fleet board. */
export function listRegionMarketPressure(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): RegionMarketPressure[] {
  ensureNpcFleet(world);
  const busyRegions = busyOriginRegions(world);
  const regions = [...new Set((world.npcs ?? []).map((n) => n.homeRegion))].sort();
  return regions.map((region) => {
    const home = world.npcs.filter((n) => n.homeRegion === region);
    let ready = 0;
    let resting = 0;
    let maintenance = 0;
    for (const npc of home) {
      if (npc.status === 'resting' && npcRestUntilMs(npc) > nowMs) resting += 1;
      if (npc.status === 'maintenance' && npcMxUntilMs(npc) > nowMs) maintenance += 1;
      if (isNpcReadyToBid(npc, nowMs, world.tick)) ready += 1;
    }
    const capacity = home.length === 0 ? 1 : ready / home.length;
    return {
      region,
      capacity,
      thinFleet: capacity < THIN_FLEET_CAPACITY,
      laneBusy: busyRegions.has(region),
      ready,
      total: home.length,
      resting,
      maintenance,
      weather: regionalWeatherIndex(world, region),
    };
  });
}

function needsCrewRest(npc: NpcFreighter): boolean {
  const duty = npc.dutyHoursAccum ?? 0;
  const lastLeg = npc.lastLegDutyHours ?? 0;
  return duty >= MAX_DUTY_HOURS || lastLeg >= LONG_LEG_DUTY_HOURS;
}

function estimateRestHours(dutyHours: number, rng: () => number): number {
  const base = Math.min(MAX_REST_HOURS, Math.max(MIN_REST_HOURS, dutyHours));
  const jittered = base * (0.9 + rng() * 0.2);
  return Math.min(MAX_REST_HOURS, Math.max(MIN_REST_HOURS * 0.9, jittered));
}

function beginCrewRest(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  nowMs: number,
): void {
  const duty = Math.max(npc.dutyHoursAccum ?? 0, npc.lastLegDutyHours ?? 0, MIN_REST_HOURS);
  const rng = mulberry32(hashSeed(`${world.seed}:${npc.id}:rest:${Math.floor(nowMs / 60_000)}`));
  const restHours = estimateRestHours(duty, rng);
  npc.status = 'resting';
  npc.currentFlightId = undefined;
  npc.busyUntilTick = undefined;
  npc.busyUntilMs = undefined;
  npc.restUntilMs = nowMs + hoursToMs(restHours);
  npc.restUntilTick = world.tick + hoursToTicks(restHours);
  noteNpcRest(world, restHours);
}

function clearCrewRest(npc: NpcFreighter): void {
  npc.status = 'idle';
  npc.restUntilMs = undefined;
  npc.restUntilTick = undefined;
  npc.dutyHoursAccum = 0;
  npc.lastLegDutyHours = undefined;
}

function mxIntervalHours(npc: NpcFreighter): number {
  const base = NPC_MX_INTERVAL_HOURS[npc.aircraftClassId];
  // Reliable operators stretch intervals a bit (better planned MX).
  return base * (0.9 + npc.reliability * 0.25);
}

function needsShopMx(npc: NpcFreighter): boolean {
  return (npc.hoursSinceMx ?? 0) >= mxIntervalHours(npc);
}

function pickNpcMxIcao(world: CareerEconomyWorld, npc: NpcFreighter): string {
  if (npc.locationIcao) {
    const known = world.airports.find(
      (a) => a.icao === npc.locationIcao!.toUpperCase(),
    );
    if (known && !isBushHub(known.icao)) return known.icao;
  }
  const home = world.airports.find(
    (a) => a.region === npc.homeRegion && !isBushHub(a.icao),
  );
  if (home) return home.icao;
  return world.airports.find((a) => !isBushHub(a.icao))?.icao ?? 'SBGR';
}

/**
 * Drain terminal MRO parts for an NPC shop visit.
 * Dry stock still grounds the aircraft longer (parts ferry delay) but takes 0 kg.
 */
export function drainNpcMroParts(
  world: CareerEconomyWorld,
  icao: string,
  requestedKg: number,
): { takenKg: number; scarcity: 'ok' | 'partial' | 'dry' } {
  const ap = world.airports.find((a) => a.icao === icao.toUpperCase());
  if (!ap) {
    return { takenKg: 0, scarcity: 'dry' };
  }
  ensureAirportMroInventory(ap);
  const stock = ap.inventory.mro_parts;
  if (!stock) {
    return { takenKg: 0, scarcity: 'dry' };
  }
  const want = Math.max(0, Math.round(requestedKg));
  const available = Math.max(0, Math.floor(stock.stockKg));
  const takenKg = Math.min(want, available);
  stock.stockKg = Math.max(0, stock.stockKg - takenKg);
  if (want > 0 && takenKg === 0) return { takenKg: 0, scarcity: 'dry' };
  if (takenKg < want) return { takenKg, scarcity: 'partial' };
  return { takenKg, scarcity: 'ok' };
}

function beginShopMx(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  nowMs: number,
): void {
  const icao = pickNpcMxIcao(world, npc);
  npc.locationIcao = icao;
  const rng = mulberry32(
    hashSeed(`${world.seed}:${npc.id}:mx:${Math.floor(nowMs / 60_000)}`),
  );
  const requested = NPC_MX_PARTS_KG[npc.aircraftClassId];
  const { scarcity } = drainNpcMroParts(world, icao, requested);
  let shopHours =
    NPC_MX_SHOP_HOURS[npc.aircraftClassId] * (0.85 + rng() * 0.3);
  if (scarcity === 'dry') shopHours *= 1.6;
  else if (scarcity === 'partial') shopHours *= 1.25;

  npc.status = 'maintenance';
  npc.currentFlightId = undefined;
  npc.busyUntilTick = undefined;
  npc.busyUntilMs = undefined;
  npc.restUntilMs = undefined;
  npc.restUntilTick = undefined;
  npc.mxUntilMs = nowMs + hoursToMs(shopHours);
  npc.mxUntilTick = world.tick + hoursToTicks(shopHours);
  npc.hoursSinceMx = 0;
}

/** End shop visit; may cascade into crew rest if duty is still high. */
function finishShopMx(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  nowMs: number,
): void {
  npc.mxUntilMs = undefined;
  npc.mxUntilTick = undefined;
  if (needsCrewRest(npc)) {
    beginCrewRest(world, npc, nowMs);
  } else {
    npc.status = 'idle';
  }
}

function releaseMxIfDue(world: CareerEconomyWorld, nowMs: number): void {
  for (const npc of world.npcs) {
    if (npc.status !== 'maintenance') continue;
    if (!groundHoldExpired(npcMxUntilMs(npc), npc.mxUntilTick, nowMs, world.tick)) {
      continue;
    }
    finishShopMx(world, npc, nowMs);
  }
}

/** End turnaround: shop MX if due, else crew rest, else idle. */
function finishTurnaround(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  nowMs: number,
): void {
  npc.busyUntilTick = undefined;
  npc.busyUntilMs = undefined;
  npc.currentFlightId = undefined;
  if (needsShopMx(npc)) {
    beginShopMx(world, npc, nowMs);
    return;
  }
  if (needsCrewRest(npc)) {
    beginCrewRest(world, npc, nowMs);
  } else {
    npc.status = 'idle';
  }
}

function releaseRestIfDue(world: CareerEconomyWorld, nowMs: number): void {
  for (const npc of world.npcs) {
    if (npc.status !== 'resting') continue;
    if (!groundHoldExpired(npcRestUntilMs(npc), npc.restUntilTick, nowMs, world.tick)) {
      continue;
    }
    clearCrewRest(npc);
  }
}

/** Block hours in air (cargo ETA); busy time adds turnaround after arrival. */
export function estimateNpcBlockHours(
  distanceNm: number,
  aircraftClassId: FreighterClassId,
): { flightHours: number; busyHours: number } {
  const cruise = CRUISE_KT[aircraftClassId] ?? 430;
  const rawHours = distanceNm / Math.max(1, cruise);
  // Tenth-hour resolution so similar routes don't all land on the same hour.
  const flightHours = Math.max(MIN_BLOCK_HOURS, Math.round(rawHours * 10) / 10);
  return { flightHours, busyHours: flightHours + TURNAROUND_HOURS };
}

/**
 * Delivery SLA for contract-pilot missions.
 * Lots can sit past `expiresAtTick` while `awaiting_pilot` is still open; copying
 * that expiry onto the mission made the player start already multi-hour late.
 * Floor is accept time + block (+ buffer); keep the lot expiry when it is stricter.
 */
export function contractPilotMissionDeadlineTick(opts: {
  worldTick: number;
  lotExpiresAtTick: number;
  distanceNm: number | undefined;
  aircraftClassId: FreighterClassId;
}): number {
  const dist = Math.max(0, opts.distanceNm ?? 0);
  const { flightHours } = estimateNpcBlockHours(dist, opts.aircraftClassId);
  const minWindowHours = Math.max(2, flightHours + 1.5);
  const fromAccept = opts.worldTick + hoursToTicks(minWindowHours);
  return Math.max(opts.lotExpiresAtTick, fromAccept);
}

function pickThinnestHomeRegion(
  regionList: string[],
  homeCounts: Map<string, number>,
): string {
  let best = regionList[0]!;
  let bestCount = homeCounts.get(best) ?? 0;
  for (let i = 1; i < regionList.length; i++) {
    const region = regionList[i]!;
    const count = homeCounts.get(region) ?? 0;
    if (
      count < bestCount ||
      (count === bestCount && region.localeCompare(best) < 0)
    ) {
      best = region;
      bestCount = count;
    }
  }
  return best;
}

export function seedNpcFleet(opts: {
  seed: string;
  regions: string[];
}): NpcFreighter[] {
  const rng = mulberry32(hashSeed(`${opts.seed}:npc-fleet`));
  const regions =
    opts.regions.length > 0
      ? listNpcHomeRegions(opts.regions)
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const names = [...NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = names[i]!;
    names[i] = names[j]!;
    names[j] = tmp;
  }

  const composition = resolveNpcFleetComposition(regions.length);
  const classOrder: FreighterClassId[] = [];
  for (const slot of composition) {
    for (let n = 0; n < slot.count; n++) {
      classOrder.push(slot.aircraftClassId);
    }
  }

  const homeCounts = new Map<string, number>(regions.map((r) => [r, 0]));
  const fleet: NpcFreighter[] = [];
  for (let i = 0; i < classOrder.length; i++) {
    const homeRegion = pickThinnestHomeRegion(regions, homeCounts);
    homeCounts.set(homeRegion, (homeCounts.get(homeRegion) ?? 0) + 1);
    fleet.push(
      makeNpcFreighter({
        id: `npc-${i + 1}`,
        name: names[i % names.length]!,
        aircraftClassId: classOrder[i]!,
        homeRegion,
        rng,
      }),
    );
  }
  return fleet;
}

function makeNpcFreighter(opts: {
  id: string;
  name: string;
  aircraftClassId: FreighterClassId;
  homeRegion: string;
  rng: () => number;
}): NpcFreighter {
  const interval = NPC_MX_INTERVAL_HOURS[opts.aircraftClassId];
  const airframe = pickNpcAirframe(opts.aircraftClassId, opts.rng);
  return {
    id: opts.id,
    name: opts.name,
    aircraftClassId: opts.aircraftClassId,
    airframeTypeId: airframe?.typeId,
    maxCargoKg: airframe?.maxCargoKg,
    homeRegion: opts.homeRegion,
    reliability: 0.45 + opts.rng() * 0.5,
    aggressiveness: 0.2 + opts.rng() * 0.7,
    feeBias: 0.75 + opts.rng() * 0.55,
    status: 'idle',
    // Desync shop calendars so the fleet does not all hit MX together.
    hoursSinceMx: Math.round(opts.rng() * interval * 0.55),
  };
}

/**
 * Assign airframe variants to NPCs missing a typeId, and remigrate abstract
 * typeIds to homologated player SKUs when that class now has Market entries.
 */
export function ensureNpcAirframes(
  world: CareerEconomyWorld,
  seed = world.seed,
): number {
  let assigned = 0;
  const homologCountByClass = new Map<string, number>();
  for (let i = 0; i < world.npcs.length; i++) {
    const npc = world.npcs[i]!;
    const needsAssign = !npc.airframeTypeId;
    let homologCount = homologCountByClass.get(npc.aircraftClassId);
    if (homologCount === undefined) {
      homologCount = listHomologatedNpcAirframesForClass(npc.aircraftClassId)
        .length;
      homologCountByClass.set(npc.aircraftClassId, homologCount);
    }
    const needsHomologation =
      Boolean(npc.airframeTypeId) &&
      homologCount > 0 &&
      !npcAirframeIsHomologated(npc.airframeTypeId);
    if (!needsAssign && !needsHomologation) continue;
    const rng = mulberry32(
      hashSeed(
        `${seed}:npc-airframe:${npc.id}${needsHomologation ? ':homo' : ''}`,
      ),
    );
    const airframe = pickNpcAirframe(npc.aircraftClassId, rng);
    if (!airframe) continue;
    npc.airframeTypeId = airframe.typeId;
    if (airframe.maxCargoKg !== undefined) {
      npc.maxCargoKg = airframe.maxCargoKg;
    } else {
      delete npc.maxCargoKg;
    }
    assigned += 1;
  }
  return assigned;
}

/** Ensure save has a fleet; seeds when missing / empty; tops up and prunes to target. */
export function ensureNpcFleet(
  world: CareerEconomyWorld,
  opts: { heal?: boolean } = {},
): void {
  if (!Array.isArray(world.npcFlights)) {
    world.npcFlights = [];
  }
  const heal = opts.heal !== false;
  if (!Array.isArray(world.npcs) || world.npcs.length === 0) {
    const regions = world.airports.map((a) => a.region);
    world.npcs = seedNpcFleet({ seed: world.seed, regions });
    world.npcFlights = world.npcFlights ?? [];
    if (heal) {
      const healNow = world.lastBatchAtMs ?? Date.now();
      settleNpcOpsDueCore(world, healNow);
      desyncClusteredTurnarounds(world);
    }
    return;
  }

  // Hot path: fleet already at composition / coverage / balance — skip
  // topUp/prune/rebalance (dominant cost with ~3.8k NPCs).
  if (!npcFleetStructureFresh(world)) {
    const regions = world.airports.map((a) => a.region);
    topUpNpcFleetComposition(world, regions);
    pruneNpcFleetComposition(world, regions);
    ensureNpcRegionCoverage(world, regions);
    rebalanceNpcHomeRegions(world, regions);
  }
  ensureNpcAirframes(world);
  backfillNpcDutyFromFlights(world);
  // Heal tick/ms drift before cosmetic desync so poisoned far-future holds
  // cannot fan out across a turnaround cluster.
  if (heal) {
    const healNow = world.lastBatchAtMs ?? Date.now();
    settleNpcOpsDueCore(world, healNow);
    desyncClusteredTurnarounds(world);
  }
}

/**
 * True when topUp/prune/coverage/rebalance would no-op for this world.
 * Class counts match region-scaled composition; every home region has ≥1 NPC;
 * richest−thinnest ≤ 1.
 */
function npcFleetStructureFresh(world: CareerEconomyWorld): boolean {
  const regionList = listNpcHomeRegions([
    ...new Set(
      world.airports.map((a) => a.region).filter((r): r is string => Boolean(r)),
    ),
  ]);
  if (regionList.length === 0) return true;
  const composition = resolveNpcFleetComposition(regionList.length);
  const classCounts = new Map<string, number>();
  const homeCounts = new Map<string, number>();
  for (const region of regionList) homeCounts.set(region, 0);
  for (const npc of world.npcs) {
    classCounts.set(
      npc.aircraftClassId,
      (classCounts.get(npc.aircraftClassId) ?? 0) + 1,
    );
    const home = (npc.homeRegion ?? '').trim();
    if (homeCounts.has(home)) {
      homeCounts.set(home, (homeCounts.get(home) ?? 0) + 1);
    }
  }
  for (const slot of composition) {
    if ((classCounts.get(slot.aircraftClassId) ?? 0) !== slot.count) {
      return false;
    }
  }
  let min = Number.POSITIVE_INFINITY;
  let max = -1;
  for (const region of regionList) {
    const count = homeCounts.get(region) ?? 0;
    if (count === 0) return false;
    if (count < min) min = count;
    if (count > max) max = count;
  }
  return max - min <= 1;
}

/**
 * Give every mapped region at least one home operator.
 * Map expansions (BR-N / BR-CO) otherwise leave new regions with an empty local
 * fleet forever, which keeps their lanes permanently "thin fleet".
 * Reassigns from the most crowded region and never touches an NPC in flight.
 */
export function ensureNpcRegionCoverage(
  world: CareerEconomyWorld,
  regions: string[],
): number {
  const regionList = [...new Set(regions)].filter((r) => Boolean(r));
  if (regionList.length === 0 || world.npcs.length < regionList.length) {
    return 0;
  }

  const byRegion = new Map<string, NpcFreighter[]>();
  for (const region of regionList) {
    byRegion.set(region, []);
  }
  for (const npc of world.npcs) {
    const bucket = byRegion.get(npc.homeRegion);
    if (bucket) bucket.push(npc);
  }

  let moved = 0;
  for (const region of regionList) {
    if ((byRegion.get(region) ?? []).length > 0) continue;

    let donorRegion: string | undefined;
    let donorCount = 1;
    for (const [candidate, members] of byRegion) {
      if (members.length > donorCount) {
        donorRegion = candidate;
        donorCount = members.length;
      }
    }
    if (!donorRegion) break;

    const donors = byRegion.get(donorRegion)!;
    // Stable pick: idle-first, then lowest id, so migrations stay deterministic.
    const ordered = [...donors].sort((a, b) => {
      const aFree = a.currentFlightId ? 1 : 0;
      const bFree = b.currentFlightId ? 1 : 0;
      if (aFree !== bFree) return aFree - bFree;
      return a.id.localeCompare(b.id);
    });
    const pick = ordered.find((npc) => !npc.currentFlightId);
    if (!pick) break;

    pick.homeRegion = region;
    donors.splice(donors.indexOf(pick), 1);
    byRegion.get(region)!.push(pick);
    moved += 1;
  }
  return moved;
}

/**
 * Top up the fleet toward the region-scaled composition target.
 * Only appends missing class slots. New homes prefer thin regions.
 */
export function topUpNpcFleetComposition(
  world: CareerEconomyWorld,
  regions: string[],
): void {
  const regionList =
    regions.length > 0
      ? listNpcHomeRegions(regions)
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const rng = mulberry32(hashSeed(`${world.seed}:npc-fleet-topup`));
  const usedNames = new Set(world.npcs.map((n) => n.name));
  let nextIndex = world.npcs.reduce((max, n) => {
    const m = /^npc-(\d+)$/.exec(n.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  const homeCounts = new Map<string, number>(regionList.map((r) => [r, 0]));
  for (const npc of world.npcs) {
    const region = (npc.homeRegion ?? '').trim();
    if (!regionList.includes(region)) continue;
    homeCounts.set(region, (homeCounts.get(region) ?? 0) + 1);
  }

  const composition = resolveNpcFleetComposition(regionList.length);
  for (const slot of composition) {
    const have = world.npcs.filter((n) => n.aircraftClassId === slot.aircraftClassId)
      .length;
    const missing = Math.max(0, slot.count - have);
    for (let i = 0; i < missing; i++) {
      nextIndex += 1;
      const name =
        NPC_NAME_POOL.find((n) => !usedNames.has(n)) ??
        `${slot.aircraftClassId}-${nextIndex}`;
      usedNames.add(name);
      const homeRegion = pickThinnestHomeRegion(regionList, homeCounts);
      homeCounts.set(homeRegion, (homeCounts.get(homeRegion) ?? 0) + 1);
      world.npcs.push(
        makeNpcFreighter({
          id: `npc-${nextIndex}`,
          name,
          aircraftClassId: slot.aircraftClassId,
          homeRegion,
          rng,
        }),
      );
    }
  }
}

function npcIsFleetPrunable(
  npc: NpcFreighter,
  holdingNpcIds: ReadonlySet<string>,
): boolean {
  if (npc.currentFlightId) return false;
  if (holdingNpcIds.has(npc.id)) return false;
  return true;
}

function holdingNpcIdsFromFlights(world: CareerEconomyWorld): Set<string> {
  const ids = new Set<string>();
  for (const flight of world.npcFlights ?? []) {
    if (flight.status === 'in_flight' || flight.status === 'awaiting_pilot') {
      ids.add(flight.npcId);
    }
  }
  return ids;
}

/**
 * Remove idle surplus NPCs so each class is at most its region-scaled target.
 * Never touches operators on an active / crew-needed flight.
 * Prefers pruning from the most crowded home regions.
 */
export function pruneNpcFleetComposition(
  world: CareerEconomyWorld,
  regions: string[],
): number {
  const regionList =
    regions.length > 0
      ? listNpcHomeRegions(regions)
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  if (regionList.length === 0 || world.npcs.length === 0) return 0;

  const composition = resolveNpcFleetComposition(regionList.length);
  const holding = holdingNpcIdsFromFlights(world);
  const homeCounts = new Map<string, number>(regionList.map((r) => [r, 0]));
  for (const npc of world.npcs) {
    const region = (npc.homeRegion ?? '').trim();
    if (!regionList.includes(region)) continue;
    homeCounts.set(region, (homeCounts.get(region) ?? 0) + 1);
  }

  const removeIds = new Set<string>();
  for (const slot of composition) {
    const ofClass = world.npcs.filter(
      (n) =>
        n.aircraftClassId === slot.aircraftClassId && !removeIds.has(n.id),
    );
    const excess = ofClass.length - slot.count;
    if (excess <= 0) continue;

    const candidates = ofClass
      .filter((n) => npcIsFleetPrunable(n, holding))
      .sort((a, b) => {
        const aHome = (a.homeRegion ?? '').trim();
        const bHome = (b.homeRegion ?? '').trim();
        const aCount = homeCounts.get(aHome) ?? 0;
        const bCount = homeCounts.get(bHome) ?? 0;
        if (bCount !== aCount) return bCount - aCount;
        return a.id.localeCompare(b.id);
      });

    for (let i = 0; i < excess && i < candidates.length; i++) {
      const npc = candidates[i]!;
      removeIds.add(npc.id);
      const home = (npc.homeRegion ?? '').trim();
      if (homeCounts.has(home)) {
        homeCounts.set(home, Math.max(0, (homeCounts.get(home) ?? 0) - 1));
      }
    }
  }

  if (removeIds.size === 0) return 0;
  world.npcs = world.npcs.filter((n) => !removeIds.has(n.id));
  return removeIds.size;
}

/**
 * Move idle NPCs from crowded home regions onto thinner ones until counts
 * differ by at most 1 (or no movable operators remain).
 */
export function rebalanceNpcHomeRegions(
  world: CareerEconomyWorld,
  regions: string[],
): number {
  const regionList =
    regions.length > 0
      ? listNpcHomeRegions(regions)
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  if (regionList.length < 2) return 0;

  const holding = holdingNpcIdsFromFlights(world);
  const byRegion = new Map<string, NpcFreighter[]>();
  for (const region of regionList) byRegion.set(region, []);
  for (const npc of world.npcs) {
    const region = (npc.homeRegion ?? '').trim();
    const bucket = byRegion.get(region);
    if (bucket) bucket.push(npc);
  }

  let moved = 0;
  // Bound iterations: at most one move per NPC.
  const maxMoves = world.npcs.length;
  for (let step = 0; step < maxMoves; step++) {
    let richest: string | undefined;
    let richestCount = -1;
    let thinnest: string | undefined;
    let thinnestCount = Number.POSITIVE_INFINITY;
    for (const region of regionList) {
      const count = byRegion.get(region)?.length ?? 0;
      if (
        count > richestCount ||
        (count === richestCount &&
          richest !== undefined &&
          region.localeCompare(richest) < 0)
      ) {
        richest = region;
        richestCount = count;
      }
      if (
        count < thinnestCount ||
        (count === thinnestCount &&
          thinnest !== undefined &&
          region.localeCompare(thinnest) < 0)
      ) {
        thinnest = region;
        thinnestCount = count;
      }
    }
    if (!richest || !thinnest || richest === thinnest) break;
    if (richestCount - thinnestCount <= 1) break;

    const donors = byRegion.get(richest)!;
    const pick = [...donors]
      .filter((n) => npcIsFleetPrunable(n, holding))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!pick) break;

    pick.homeRegion = thinnest;
    donors.splice(donors.indexOf(pick), 1);
    byRegion.get(thinnest)!.push(pick);
    moved += 1;
  }
  return moved;
}

/**
 * Legacy claims used whole-hour blocks, so several NPCs often share one busyUntilMs.
 * Spread turnaround-only peers so the board doesn't show identical "free in Xm".
 * Ignores absurd far-future holds (clock drift) so one poisoned stamp cannot fan out.
 */
function desyncClusteredTurnarounds(world: CareerEconomyWorld): void {
  const BUCKET_MS = 5 * 60 * 1000;
  const nowMs = world.lastBatchAtMs ?? Date.now();
  /** Turnaround is ~0.55–1.45h; allow slack before treating as corrupt. */
  const maxPlausibleBusyMs = nowMs + hoursToMs(3);
  const groups = new Map<number, NpcFreighter[]>();
  for (const npc of world.npcs) {
    if (npc.currentFlightId) continue;
    if (npc.status !== 'busy') continue;
    const until = npcBusyUntilMs(npc);
    if (until <= 0) continue;
    if (until > maxPlausibleBusyMs) continue;
    if (
      typeof npc.busyUntilTick === 'number' &&
      Number.isFinite(npc.busyUntilTick) &&
      npc.busyUntilTick <= world.tick
    ) {
      continue;
    }
    const key = Math.floor(until / BUCKET_MS);
    const bucket = groups.get(key) ?? [];
    bucket.push(npc);
    groups.set(key, bucket);
  }
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Anchor to the group's median busy time, then fan out (±20 min + small index skew).
    const sorted = group
      .map((n) => npcBusyUntilMs(n))
      .sort((a, b) => a - b);
    const anchor = sorted[Math.floor(sorted.length / 2)]!;
    for (let i = 0; i < group.length; i++) {
      const npc = group[i]!;
      const rng = mulberry32(hashSeed(`${world.seed}:${npc.id}:turnaround-desync`));
      const skewMs =
        Math.floor((rng() - 0.5) * 40 * 60 * 1000) + Math.min(i, 12) * 4 * 60 * 1000;
      npc.busyUntilMs = Math.min(maxPlausibleBusyMs, Math.max(nowMs + 60_000, anchor + skewMs));
    }
  }
}

/**
 * Older in-flight / turnaround NPCs may lack duty fields (claimed before rest shipped).
 * Reconstruct a minimum leg duty so crew-rest can still trigger.
 */
function backfillNpcDutyFromFlights(world: CareerEconomyWorld): void {
  for (const npc of world.npcs) {
    if (typeof npc.dutyHoursAccum === 'number' && Number.isFinite(npc.dutyHoursAccum)) {
      continue;
    }
    const flight = world.npcFlights.find(
      (f) => f.npcId === npc.id && f.status === 'in_flight',
    );
    if (flight) {
      const blockHours = Math.max(
        MIN_BLOCK_HOURS,
        msToHours(flightArrivesAtMs(flight) - flightDepartedAtMs(flight)),
      );
      const turnaroundHours = Math.max(
        0.4,
        msToHours(npcBusyUntilMs(npc) - flightArrivesAtMs(flight)),
      );
      const leg = blockHours + turnaroundHours;
      npc.lastLegDutyHours = leg;
      npc.dutyHoursAccum = leg;
      continue;
    }
    if (npc.status === 'busy') {
      // Turnaround without a live flight record — assume at least one short leg.
      npc.lastLegDutyHours = npc.lastLegDutyHours ?? 2.5;
      npc.dutyHoursAccum = npc.dutyHoursAccum ?? 2.5;
      continue;
    }
    npc.dutyHoursAccum = 0;
  }
}

function findLot(world: CareerEconomyWorld, lotId: string): ShipmentLot | undefined {
  return world.lots.find((l) => l.id === lotId);
}

function findActiveFlightForLot(
  world: CareerEconomyWorld,
  lotId: string,
): NpcFlight | undefined {
  return (
    world.npcFlights.find(
      (l) => l.lotId === lotId && l.status === 'awaiting_pilot',
    ) ??
    world.npcFlights.find(
      (l) => l.lotId === lotId && l.status === 'in_flight',
    )
  );
}

function isNpcFlightHoldingLot(flight: NpcFlight): boolean {
  return flight.status === 'in_flight' || flight.status === 'awaiting_pilot';
}

function awaitingPilotHoldHours(
  rng: () => number,
  opts?: { short?: boolean },
): number {
  if (opts?.short) {
    return (
      AWAITING_PILOT_SHORT_MIN_HOURS +
      rng() *
        (AWAITING_PILOT_SHORT_MAX_HOURS - AWAITING_PILOT_SHORT_MIN_HOURS)
    );
  }
  return (
    AWAITING_PILOT_MIN_HOURS +
    rng() * (AWAITING_PILOT_MAX_HOURS - AWAITING_PILOT_MIN_HOURS)
  );
}

function repositionAwaitingHoldHours(rng: () => number): number {
  return (
    REPOSITION_AWAITING_MIN_HOURS +
    rng() * (REPOSITION_AWAITING_MAX_HOURS - REPOSITION_AWAITING_MIN_HOURS)
  );
}

function countOpenRepositionOffers(
  world: CareerEconomyWorld,
  band: Exclude<ContractPilotOfferBand, 'all'> = 'other',
): number {
  return world.npcFlights.filter((f) => {
    if (f.status !== 'awaiting_pilot' || !isNpcRepositionFlight(f)) return false;
    const starter = isStarterContractPilotClass(f.aircraftClassId);
    return band === 'starter' ? starter : !starter;
  }).length;
}

function maxOpenRepositionOffers(
  band: Exclude<ContractPilotOfferBand, 'all'>,
): number {
  return band === 'starter'
    ? MAX_OPEN_STARTER_REPOSITION_OFFERS
    : MAX_OPEN_REPOSITION_OFFERS;
}

/** Closest mapped hub in the NPC's home region (for empty return). */
export function pickNpcHomeReturnIcao(
  world: CareerEconomyWorld,
  npc: Pick<NpcFreighter, 'homeRegion' | 'aircraftClassId'>,
  fromIcao: string,
  opts?: { maxRangeNm?: number },
): string | undefined {
  const home = (npc.homeRegion ?? '').trim();
  if (!home) return undefined;
  const from = fromIcao.trim().toUpperCase();
  const maxRange =
    typeof opts?.maxRangeNm === 'number' && Number.isFinite(opts.maxRangeNm)
      ? opts.maxRangeNm
      : getAircraftClass(npc.aircraftClassId).maxRangeNm;
  const candidates = world.airports.filter(
    (a) => a.region === home && !isBushHub(a.icao),
  );
  if (candidates.length === 0) return undefined;
  let best: (typeof candidates)[number] | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const ap of candidates) {
    if (ap.icao === from) return undefined; // already home
    const dist = routeDistanceNm(world, from, ap.icao);
    if (dist === undefined || dist <= 0) continue;
    if (dist > maxRange) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = ap;
    }
  }
  if (!best || !Number.isFinite(bestDist)) return undefined;
  return best.icao;
}

/**
 * After a freight delivery away from home, open a short Crew needed · reposition
 * hold. Expiry promotes to solo empty return (same awaiting_pilot loop).
 */
function tryCreateNpcRepositionOffer(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  fromIcao: string,
  nowMs: number,
  rng: () => number,
): NpcFlight | undefined {
  if (!npcCanOfferContractPilot(npc)) return undefined;
  if (npc.currentFlightId) return undefined;
  if (needsShopMx(npc)) return undefined;
  const repoBand = isStarterContractPilotClass(npc.aircraftClassId)
    ? 'starter'
    : 'other';
  if (countOpenRepositionOffers(world, repoBand) >= maxOpenRepositionOffers(repoBand)) {
    return undefined;
  }

  const origin = fromIcao.trim().toUpperCase();
  const originRegion = airportRegion(world, origin);
  if (!originRegion || originRegion === npc.homeRegion) return undefined;

  const destIcao = pickNpcHomeReturnIcao(world, npc, origin);
  if (!destIcao) return undefined;

  const destRegion = airportRegion(world, destIcao);
  if (
    destRegion &&
    !isDomesticOd(originRegion, destRegion) &&
    !isInternationalOdAllowed(world, origin, destIcao)
  ) {
    return undefined;
  }

  const dist = routeDistanceNm(world, origin, destIcao) ?? 0;
  if (dist < 40) return undefined;

  const pilotFeeUsd = quoteRepositionPilotFeeUsd(dist, npc.aircraftClassId);
  const holdHours = repositionAwaitingHoldHours(rng);
  const awaitingPilotUntilMs = nowMs + hoursToMs(holdHours);
  const lotId = `npc-repo-${npc.id}-${world.tick}-${Math.floor(rng() * 1e6)}`;
  const flightId = `npcf-repo-${world.tick}-${npc.id}-${lotId.slice(-8)}`;

  const lot: ShipmentLot = {
    id: lotId,
    commodityId: 'general',
    originIcao: origin,
    destIcao,
    quantityKg: 1,
    reservedKg: 1,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + Math.max(1, hoursToTicks(holdHours) + 1),
    payUsd: pilotFeeUsd,
    basePayUsd: pilotFeeUsd,
    urgency: 'normal',
    reason: `Reposition · ${npc.name} home (${npc.homeRegion})`,
    status: 'reserved',
  };
  world.lots.push(lot);

  const flight: NpcFlight = {
    id: flightId,
    npcId: npc.id,
    lotId,
    originIcao: origin,
    destIcao,
    commodityId: 'general',
    cargoKg: 0,
    payUsd: pilotFeeUsd,
    aircraftClassId: npc.aircraftClassId,
    departedAtTick: world.tick,
    arrivesAtTick: world.tick,
    departedAtMs: nowMs,
    arrivesAtMs: awaitingPilotUntilMs,
    status: 'awaiting_pilot',
    kind: 'reposition',
    awaitingPilotUntilMs,
    pilotFeeUsd,
  };

  npc.status = 'busy';
  npc.busyUntilTick = world.tick + hoursToTicks(holdHours);
  npc.busyUntilMs = awaitingPilotUntilMs;
  npc.currentFlightId = flight.id;
  world.npcFlights.push(flight);
  return flight;
}

function shouldOfferContractPilot(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  rng: () => number,
  opts?: {
    force?: boolean;
    originIcao?: string;
    companyCountInCountry?: number;
  },
): boolean {
  const force = opts?.force;
  if (force === true) return npcCanOfferContractPilot(npc);
  if (force === false) return false;
  if (!npcCanOfferContractPilot(npc)) return false;
  const band = isStarterContractPilotClass(npc.aircraftClassId)
    ? 'starter'
    : 'other';
  // Active home country below floor: open even when the global starter cap
  // is full. Above the floor, fall through to the normal global cap — no
  // hard country ceiling (crew-needed is unpaid deadhead for the player).
  if (
    band === 'starter' &&
    opts?.originIcao &&
    starterContractPilotCountryNeedsFloor(
      world,
      opts.originIcao,
      opts.companyCountInCountry ?? 1,
    )
  ) {
    return rng() < CONTRACT_PILOT_OFFER_CHANCE;
  }
  if (
    countOpenContractPilotOffers(world, band) >=
    maxOpenContractPilotOffers(world, band)
  ) {
    return false;
  }
  return rng() < CONTRACT_PILOT_OFFER_CHANCE;
}

/**
 * Promote an expired crew-needed hold into a normal NPC departure.
 */
function promoteAwaitingPilotFlight(
  world: CareerEconomyWorld,
  flight: NpcFlight,
  nowMs: number,
  rng: () => number,
): void {
  if (flight.status !== 'awaiting_pilot') return;

  const dist =
    routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? 0;
  const { flightHours } = estimateNpcBlockHours(dist, flight.aircraftClassId);
  const turnaroundHours = TURNAROUND_HOURS * (0.55 + rng() * 0.9);
  const departSkewMs = Math.floor(rng() * DEPART_STAGGER_MS);
  const departedAtMs = nowMs + departSkewMs;
  const arrivesAtMs = departedAtMs + hoursToMs(flightHours);
  const busyUntilMs = arrivesAtMs + hoursToMs(turnaroundHours);
  const flightTickHours = hoursToTicks(flightHours);
  const busyTickHours = Math.max(
    flightTickHours + TURNAROUND_MIN_TICKS,
    hoursToTicks(flightHours + turnaroundHours),
  );

  const fuel = applyNpcFuelUplift(world, {
    originIcao: flight.originIcao,
    destIcao: flight.destIcao,
    aircraftClassId: flight.aircraftClassId,
  });

  flight.status = 'in_flight';
  flight.departedAtTick = world.tick;
  flight.arrivesAtTick = world.tick + flightTickHours;
  flight.departedAtMs = departedAtMs;
  flight.arrivesAtMs = arrivesAtMs;
  flight.fuelUpliftKg = fuel.deliveredKg;
  flight.fuelCostUsd = fuel.costUsd;
  flight.fuelScarcity = fuel.scarcity;
  delete flight.awaitingPilotUntilMs;

  const lot = findLot(world, flight.lotId);
  if (lot && lot.reservedKg >= lot.quantityKg && lot.quantityKg > 0) {
    lot.status = 'in_transit';
  }

  const npc = world.npcs.find((n) => n.id === flight.npcId);
  if (npc) {
    npc.status = 'busy';
    npc.busyUntilTick = world.tick + busyTickHours;
    npc.busyUntilMs = busyUntilMs;
    npc.currentFlightId = flight.id;
    const legDuty = flightHours + turnaroundHours;
    npc.lastLegDutyHours = legDuty;
    npc.dutyHoursAccum = (npc.dutyHoursAccum ?? 0) + legDuty;
    noteNpcLeg(world, { flightHours, turnaroundHours });
  }
}

function promoteAwaitingPilotsDue(
  world: CareerEconomyWorld,
  nowMs: number,
  rng: () => number,
): number {
  let promoted = 0;
  for (const flight of world.npcFlights) {
    if (flight.status !== 'awaiting_pilot') continue;
    const until = flight.awaitingPilotUntilMs ?? 0;
    const distanceNm =
      routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? undefined;
    const unflyable =
      !isNpcRepositionFlight(flight) &&
      !contractPilotHasFlyableAirframe(flight, { distanceNm });
    if (!unflyable && until > 0 && nowMs < until) continue;
    promoteAwaitingPilotFlight(world, flight, nowMs, rng);
    promoted += 1;
  }
  return promoted;
}

function settleNpcFlight(world: CareerEconomyWorld, flight: NpcFlight, nowMs: number): void {
  if (flight.status === 'completed' || flight.status === 'awaiting_pilot') {
    return;
  }
  const isRepo = isNpcRepositionFlight(flight);
  const lot = findLot(world, flight.lotId);

  if (!isRepo) {
    applyFreightDelivery(world, {
      commodityId: flight.commodityId,
      originIcao: flight.originIcao,
      destIcao: flight.destIcao,
      kg: flight.cargoKg,
    });

    if (lot) {
      shrinkLotAfterDelivery(lot, flight.cargoKg, world);
    }
  } else if (lot) {
    lot.quantityKg = 0;
    lot.reservedKg = 0;
    lot.status = 'delivered';
  }

  flight.status = 'completed';
  const npc = world.npcs.find((n) => n.id === flight.npcId);
  if (npc) {
    npc.locationIcao = flight.destIcao;
    const blockHours = Math.max(
      MIN_BLOCK_HOURS,
      msToHours(flightArrivesAtMs(flight) - flightDepartedAtMs(flight)),
    );
    npc.hoursSinceMx = (npc.hoursSinceMx ?? 0) + blockHours;
    if (npc.currentFlightId === flight.id) {
      npc.currentFlightId = undefined;
    }

    if (!isRepo) {
      const repoRng = mulberry32(
        hashSeed(`${world.seed}:npc-repo:${npc.id}:${flight.id}:${nowMs}`),
      );
      const offered = tryCreateNpcRepositionOffer(
        world,
        npc,
        flight.destIcao,
        nowMs,
        repoRng,
      );
      if (offered) {
        return;
      }
    }

    if (groundHoldExpired(npcBusyUntilMs(npc), npc.busyUntilTick, nowMs, world.tick)) {
      finishTurnaround(world, npc, nowMs);
    }
  }
}

function releaseTurnaroundIfDue(world: CareerEconomyWorld, nowMs: number): void {
  for (const npc of world.npcs) {
    if (npc.currentFlightId) continue;
    if (npc.status !== 'busy') continue;
    if (!groundHoldExpired(npcBusyUntilMs(npc), npc.busyUntilTick, nowMs, world.tick)) {
      continue;
    }
    finishTurnaround(world, npc, nowMs);
  }
}

function awaitingPilotLotOnBoard(lot: ShipmentLot | undefined): boolean {
  return (
    lot != null && (lot.status === 'available' || lot.status === 'reserved')
  );
}

function recreateAwaitingPilotLot(
  world: CareerEconomyWorld,
  flight: NpcFlight,
  nowMs: number,
): ShipmentLot {
  const until =
    flight.awaitingPilotUntilMs ??
    flight.arrivesAtMs ??
    nowMs + hoursToMs(AWAITING_PILOT_MIN_HOURS);
  const holdMs = Math.max(hoursToMs(AWAITING_PILOT_SHORT_MIN_HOURS), until - nowMs);
  const holdHours = msToHours(holdMs);
  const holdTicks = Math.max(1, hoursToTicks(holdHours) + 1);
  const isRepo = isNpcRepositionFlight(flight);
  const npc = world.npcs.find((n) => n.id === flight.npcId);
  const distanceNm =
    routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? 0;
  const pilotFeeUsd =
    flight.pilotFeeUsd ??
    (isRepo
      ? quoteRepositionPilotFeeUsd(distanceNm, flight.aircraftClassId)
      : quoteContractPilotFeeUsd(flight.payUsd, {
          distanceNm,
          aircraftClassId: flight.aircraftClassId,
        }));
  const payUsd = isRepo ? pilotFeeUsd : flight.payUsd;
  const qty = isRepo ? 1 : Math.max(1, flight.cargoKg);
  return {
    id: flight.lotId,
    commodityId: isRepo ? 'general' : flight.commodityId,
    originIcao: flight.originIcao,
    destIcao: flight.destIcao,
    quantityKg: qty,
    reservedKg: qty,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + holdTicks,
    payUsd,
    basePayUsd: payUsd,
    urgency: 'normal',
    reason: isRepo
      ? `Reposition · ${npc?.name ?? flight.npcId} home (${npc?.homeRegion ?? '?'})`
      : 'Crew needed · contract hold',
    status: 'reserved',
  };
}

/**
 * Recreate board lots for awaiting_pilot flights whose shipment row was pruned
 * or expired — listMarketLots only walks lots, so orphans render as empty Crew.
 */
export function healAwaitingPilotBoardLots(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): number {
  let healed = 0;
  for (const flight of world.npcFlights) {
    if (flight.status !== 'awaiting_pilot') continue;
    const existing = findLot(world, flight.lotId);
    if (awaitingPilotLotOnBoard(existing)) continue;
    const rebuilt = recreateAwaitingPilotLot(world, flight, nowMs);
    if (existing) {
      Object.assign(existing, rebuilt);
    } else {
      world.lots.push(rebuilt);
    }
    healed += 1;
  }
  return healed;
}

/**
 * Settle NPC flights whose arrivesAtMs <= nowMs and free turnarounds / rest.
 * Idempotent — safe to call on every load / poll.
 * Does not call ensureNpcFleet (avoid recursion from fleet top-up heal).
 */
function settleNpcOpsDueCore(
  world: CareerEconomyWorld,
  nowMs: number,
): { settledFlights: number; promotedPilotOffers: number } {
  healAwaitingPilotBoardLots(world, nowMs);
  let settledFlights = 0;
  const promoteRng = mulberry32(
    hashSeed(`${world.seed}:awaiting-pilot-promote:${world.tick}:${nowMs}`),
  );
  const promotedPilotOffers = promoteAwaitingPilotsDue(world, nowMs, promoteRng);

  releaseMxIfDue(world, nowMs);
  releaseRestIfDue(world, nowMs);
  releaseTurnaroundIfDue(world, nowMs);

  for (const flight of world.npcFlights) {
    if (flight.status !== 'in_flight') continue;
    const arrives = flightArrivesAtMs(flight);
    if (arrives <= 0 || nowMs < arrives) continue;
    settleNpcFlight(world, flight, nowMs);
    settledFlights += 1;
  }

  world.npcFlights = world.npcFlights.filter(isNpcFlightHoldingLot);
  releaseTurnaroundIfDue(world, nowMs);
  releaseMxIfDue(world, nowMs);
  releaseRestIfDue(world, nowMs);
  return { settledFlights, promotedPilotOffers };
}

/**
 * Settle NPC flights whose arrivesAtMs <= nowMs and free turnarounds / rest.
 * Idempotent — safe to call on every load / poll.
 */
export function settleNpcOpsDue(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
  opts: { skipEnsure?: boolean } = {},
): { settledFlights: number; promotedPilotOffers: number } {
  // Default: ensure structure without nested heal settle (we settle once below).
  if (!opts.skipEnsure) {
    ensureNpcFleet(world, { heal: false });
  }
  // Flights leave in_flight here — drop lane index so the next formLots/bid rebuilds.
  invalidateLaneInboundIndex(world);
  const result = settleNpcOpsDueCore(world, nowMs);
  desyncClusteredTurnarounds(world);
  return result;
}

/** Route ops cargo ceiling for an NPC (fuel/MTOW), not structural max alone. */
function npcOperationalMaxCargoKg(
  npc: Pick<NpcFreighter, 'aircraftClassId' | 'maxCargoKg' | 'airframeTypeId'>,
  distanceNm: number,
  structuralMaxCargoKg?: number,
): number {
  const structural = Math.max(
    0,
    Math.floor(structuralMaxCargoKg ?? npcMaxCargoKg(npc)),
  );
  if (!(distanceNm > 0) || structural <= 0) return structural;
  const catalog = findCareerPlayerAirframe(npc.airframeTypeId);
  const route = estimateRouteCargoLimit(npc.aircraftClassId, distanceNm, structural, {
    oewKg: catalog?.oewKg,
    mtowKg: catalog?.mtowKg,
    fuelCapacityKg: catalog?.fuelCapacityKg,
    fuelBurnKgPerNm: catalog?.fuelBurnKgPerNm,
    airframeTypeId: catalog?.typeId ?? npc.airframeTypeId,
  });
  if (!route.fuelFeasible) return 0;
  return Math.max(0, Math.floor(route.operationalMaxCargoKg));
}

/** True when at least one homologated player airframe can lift >0 kg on this offer. */
export function contractPilotHasFlyableAirframe(
  flight: Pick<
    NpcFlight,
    | 'aircraftClassId'
    | 'cargoKg'
    | 'payUsd'
    | 'pilotFeeUsd'
    | 'originIcao'
    | 'destIcao'
    | 'kind'
  >,
  opts?: { distanceNm?: number },
): boolean {
  if (isNpcRepositionFlight(flight)) {
    return listContractPilotPickAirframes(flight, opts).some((a) => a.pilotFeeUsd > 0);
  }
  return listContractPilotPickAirframes(flight, opts).some((a) => a.liftKg > 0);
}

export function scoreLotForNpc(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  lot: ShipmentLot,
  rng: () => number,
  pre?: {
    aircraft: ReturnType<typeof getAircraftClass>;
    maxCargoKg: number;
    /** Lot ids with an open awaiting_pilot hold (built once per bid pass). */
    awaitingPilotLotIds?: ReadonlySet<string>;
    laneIndex?: LaneInboundIndex;
    /** When set, skips a second routeDistanceNm lookup. */
    distanceNm?: number;
    /** When set, skips npcOperationalMaxCargoKg (bid-pass cache). */
    operationalMaxCargoKg?: number;
  },
): number | null {
  // Player-exclusive Contract pool — other NPCs never bid while open.
  if (pre?.awaitingPilotLotIds) {
    if (pre.awaitingPilotLotIds.has(lot.id)) return null;
  } else if (
    world.npcFlights.some(
      (f) => f.lotId === lot.id && f.status === 'awaiting_pilot',
    )
  ) {
    return null;
  }
  const aircraft = pre?.aircraft ?? getAircraftClass(npc.aircraftClassId);
  const maxCargoKg = pre?.maxCargoKg ?? npcMaxCargoKg(npc);
  const avail = lotAvailableKg(lot);
  if (avail < NPC_MIN_BID_KG) return null;

  if (!isBushFreightOdAllowed(lot.originIcao, lot.destIcao)) return null;
  if (bushRequiresLightGa(lot.originIcao, lot.destIcao)) {
    if (npc.aircraftClassId !== 'light_ga') return null;
    // Player-first: NPCs do not take electronics outbound from bush strips.
    if (isBushHub(lot.originIcao) && lot.commodityId === 'electronics') {
      return null;
    }
  }

  const dist =
    typeof pre?.distanceNm === 'number' && Number.isFinite(pre.distanceNm)
      ? pre.distanceNm
      : routeDistanceNm(world, lot.originIcao, lot.destIcao);
  if (dist === undefined || dist > aircraft.maxRangeNm) return null;

  // Fuel/MTOW must allow a meaningful payload — class maxRange alone over-claims
  // long light-jet legs (e.g. KSFO→KCLE) where ops cargo is 0.
  const opsMax =
    typeof pre?.operationalMaxCargoKg === 'number' &&
    Number.isFinite(pre.operationalMaxCargoKg)
      ? pre.operationalMaxCargoKg
      : npcOperationalMaxCargoKg(npc, dist, maxCargoKg);
  if (opsMax < NPC_MIN_BID_KG) return null;
  // Light GA only books feeder LTL — nibbling 28 t electronics was a no-op.
  if (
    npc.aircraftClassId === 'light_ga' &&
    lot.quantityKg > SMALL_LOT_MAX_KG
  ) {
    return null;
  }

  const commodity = getCommodity(lot.commodityId);
  const payPerKg = lot.payUsd / Math.max(1, lot.quantityKg);
  const minPay = commodity.basePricePerKg * 0.35 * npc.feeBias;
  if (payPerKg < minPay) return null;

  const cargoKg = Math.min(avail, maxCargoKg, opsMax);
  const fillRatio = cargoKg / maxCargoKg;
  const payScore = Math.min(2.2, payPerKg / commodity.basePricePerKg);
  const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
  const ticksLeft = Math.max(0, lot.expiresAtTick - world.tick);
  const originRegion = airportRegion(world, lot.originIcao);
  const destRegion = airportRegion(world, lot.destIcao);
  const noise = (rng() - 0.5) * 0.22 * (1.05 - npc.reliability);
  const inboundKg = pre?.laneIndex
    ? laneInboundKgFromIndex(
        pre.laneIndex,
        lot.originIcao,
        lot.destIcao,
        lot.commodityId,
      )
    : laneInboundKg(world, lot.originIcao, lot.destIcao, lot.commodityId);
  const laneSat = Math.min(1, inboundKg / LANE_SATURATION_KG);
  // Leave crowded lanes for the player — Busy on the board should be a bid.
  const busyPenalty =
    laneSat >= LANE_BUSY_SATURATION ? laneSat * 0.65 : 0;

  return npcBidScore({
    fillRatio,
    payScore,
    urgencyHot: lot.urgency === 'urgent',
    expiryFrac: 1 - ticksLeft / life,
    regionMatch:
      originRegion === npc.homeRegion || destRegion === npc.homeRegion,
    noise,
    busyPenalty,
    aggressiveness: npc.aggressiveness,
    liftBonus: valueHeavyNpcLiftBonus(lot, world.tick, npc.aircraftClassId),
    ltlPenalty: valueHeavyNpcLtlPenalty(lot, npc.aircraftClassId),
  });
}

function claimLotForNpc(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  lot: ShipmentLot,
  batchNowMs: number,
  rng: () => number,
  opts?: { forceAwaitingPilot?: boolean; companyCountInCountry?: number },
): NpcFlight | undefined {
  const maxCargoKg = npcMaxCargoKg(npc);
  const avail = lotAvailableKg(lot);
  const dist = routeDistanceNm(world, lot.originIcao, lot.destIcao) ?? 0;
  const opsMax = npcOperationalMaxCargoKg(npc, dist, maxCargoKg);
  // Test/force path may book structural cargo; live bids already gated in score.
  const cargoKg = Math.min(
    avail,
    maxCargoKg,
    opts?.forceAwaitingPilot === true ? maxCargoKg : opsMax,
  );
  if (cargoKg <= 0) return undefined;

  const { flightHours } = estimateNpcBlockHours(dist, npc.aircraftClassId);
  const companyCountInCountry = opts?.companyCountInCountry ?? 1;
  const shortHold =
    isStarterContractPilotClass(npc.aircraftClassId) &&
    starterContractPilotCountryNeedsFloor(
      world,
      lot.originIcao,
      companyCountInCountry,
    );
  let offerPilot = shouldOfferContractPilot(world, npc, rng, {
    force: opts?.forceAwaitingPilot,
    originIcao: lot.originIcao,
    companyCountInCountry,
  });
  // Don't open a crew hold no homologated airframe can actually fly.
  if (offerPilot && opts?.forceAwaitingPilot !== true) {
    const draft: Pick<
      NpcFlight,
      | 'aircraftClassId'
      | 'cargoKg'
      | 'payUsd'
      | 'originIcao'
      | 'destIcao'
      | 'kind'
    > = {
      aircraftClassId: npc.aircraftClassId,
      cargoKg,
      payUsd: Math.max(
        1,
        Math.round(lot.payUsd * (cargoKg / Math.max(1, lot.quantityKg))),
      ),
      originIcao: lot.originIcao,
      destIcao: lot.destIcao,
    };
    if (!contractPilotHasFlyableAirframe(draft, { distanceNm: dist })) {
      offerPilot = false;
    }
  }

  let reserved;
  try {
    reserved = reserveShipmentLot(world, lot.id, cargoKg);
  } catch {
    return undefined;
  }

  if (lot.reservedKg >= lot.quantityKg && lot.quantityKg > 0) {
    // Keep awaiting_pilot holds on the market board (crew needed badge).
    if (!offerPilot) {
      lot.status = 'in_transit';
    } else if (lot.status === 'available') {
      lot.status = 'reserved';
    }
  }

  if (offerPilot) {
    const holdHours = awaitingPilotHoldHours(rng, { short: shortHold });
    const awaitingPilotUntilMs = batchNowMs + hoursToMs(holdHours);
    const pilotFeeUsd = quoteContractPilotFeeUsd(reserved.payUsd, {
      distanceNm: dist,
      aircraftClassId: npc.aircraftClassId,
    });
    const flight: NpcFlight = {
      id: `npcf-${world.tick}-${npc.id}-${lot.id.slice(0, 8)}`,
      npcId: npc.id,
      lotId: lot.id,
      originIcao: lot.originIcao,
      destIcao: lot.destIcao,
      commodityId: lot.commodityId,
      cargoKg: reserved.reservedKg,
      payUsd: reserved.payUsd,
      aircraftClassId: npc.aircraftClassId,
      departedAtTick: world.tick,
      arrivesAtTick: world.tick,
      departedAtMs: batchNowMs,
      arrivesAtMs: awaitingPilotUntilMs,
      status: 'awaiting_pilot',
      awaitingPilotUntilMs,
      pilotFeeUsd,
    };
    npc.status = 'busy';
    npc.busyUntilTick = world.tick + hoursToTicks(holdHours);
    npc.busyUntilMs = awaitingPilotUntilMs;
    npc.currentFlightId = flight.id;
    noteLotClaimed(world, lot.commodityId, reserved.reservedKg);
    world.npcFlights.push(flight);
    return flight;
  }

  // Immediate departure (legacy path).
  const turnaroundHours = TURNAROUND_HOURS * (0.55 + rng() * 0.9);
  const departSkewMs = Math.floor(rng() * DEPART_STAGGER_MS);
  const departedAtMs = batchNowMs + departSkewMs;
  const arrivesAtMs = departedAtMs + hoursToMs(flightHours);
  const busyUntilMs = arrivesAtMs + hoursToMs(turnaroundHours);
  const flightTickHours = hoursToTicks(flightHours);
  const busyTickHours = Math.max(
    flightTickHours + TURNAROUND_MIN_TICKS,
    hoursToTicks(flightHours + turnaroundHours),
  );

  const fuel = applyNpcFuelUplift(world, {
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    aircraftClassId: npc.aircraftClassId,
  });

  const flight: NpcFlight = {
    id: `npcf-${world.tick}-${npc.id}-${lot.id.slice(0, 8)}`,
    npcId: npc.id,
    lotId: lot.id,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    commodityId: lot.commodityId,
    cargoKg: reserved.reservedKg,
    payUsd: reserved.payUsd,
    aircraftClassId: npc.aircraftClassId,
    departedAtTick: world.tick,
    arrivesAtTick: world.tick + flightTickHours,
    departedAtMs,
    arrivesAtMs,
    status: 'in_flight',
    fuelUpliftKg: fuel.deliveredKg,
    fuelCostUsd: fuel.costUsd,
    fuelScarcity: fuel.scarcity,
  };

  npc.status = 'busy';
  npc.busyUntilTick = world.tick + busyTickHours;
  npc.busyUntilMs = busyUntilMs;
  npc.currentFlightId = flight.id;
  const legDuty = flightHours + turnaroundHours;
  npc.lastLegDutyHours = legDuty;
  npc.dutyHoursAccum = (npc.dutyHoursAccum ?? 0) + legDuty;
  noteLotClaimed(world, lot.commodityId, reserved.reservedKg);
  noteNpcLeg(world, { flightHours, turnaroundHours });
  world.npcFlights.push(flight);
  bumpLaneInboundIndex(
    ensureLaneInboundIndex(world),
    flight.originIcao,
    flight.destIcao,
    flight.commodityId,
    flight.cargoKg,
  );
  return flight;
}

/**
 * Test / Phase-3 helper: force a homologated NPC claim into awaiting_pilot.
 */
export function createNpcContractPilotOffer(
  world: CareerEconomyWorld,
  npcId: string,
  lotId: string,
  opts?: {
    nowMs?: number;
    rng?: () => number;
    /** Default true (test helper). */
    forceAwaitingPilot?: boolean;
    /** Exercise live caps / country floor (do not force the hold). */
    respectCaps?: boolean;
    companyCountInCountry?: number;
  },
): NpcFlight {
  ensureNpcFleet(world);
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc) throw new Error(`Unknown NPC ${npcId}`);
  if (!npcCanOfferContractPilot(npc)) {
    throw new Error(`NPC ${npcId} has no homologated airframe for contract pilot`);
  }
  const lot = findLot(world, lotId);
  if (!lot) throw new Error(`Unknown lot ${lotId}`);
  const nowMs = opts?.nowMs ?? world.lastBatchAtMs ?? Date.now();
  const rng = opts?.rng ?? mulberry32(hashSeed(`${world.seed}:offer:${npcId}:${lotId}`));
  const flight = claimLotForNpc(world, npc, lot, nowMs, rng, {
    forceAwaitingPilot: opts?.respectCaps
      ? undefined
      : (opts?.forceAwaitingPilot ?? true),
    companyCountInCountry: opts?.companyCountInCountry,
  });
  if (!flight || flight.status !== 'awaiting_pilot') {
    throw new Error(`Failed to create contract pilot offer for ${npcId} on ${lotId}`);
  }
  return flight;
}

/**
 * Test helper: force an empty home-region reposition crew offer from an ICAO.
 */
export function createNpcRepositionOffer(
  world: CareerEconomyWorld,
  npcId: string,
  fromIcao: string,
  opts?: { nowMs?: number; rng?: () => number },
): NpcFlight {
  ensureNpcFleet(world);
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc) throw new Error(`Unknown NPC ${npcId}`);
  if (!npcCanOfferContractPilot(npc)) {
    throw new Error(`NPC ${npcId} has no homologated airframe for contract pilot`);
  }
  npc.status = 'idle';
  npc.currentFlightId = undefined;
  npc.busyUntilMs = undefined;
  npc.busyUntilTick = undefined;
  npc.hoursSinceMx = 0;
  const nowMs = opts?.nowMs ?? world.lastBatchAtMs ?? Date.now();
  const rng =
    opts?.rng ??
    mulberry32(hashSeed(`${world.seed}:repo-offer:${npcId}:${fromIcao}`));
  const flight = tryCreateNpcRepositionOffer(
    world,
    npc,
    fromIcao,
    nowMs,
    rng,
  );
  if (!flight || flight.status !== 'awaiting_pilot') {
    throw new Error(
      `Failed to create reposition offer for ${npcId} from ${fromIcao}`,
    );
  }
  return flight;
}

function lotHasOpenAwaitingPilot(
  world: CareerEconomyWorld,
  lotId: string,
): boolean {
  return world.npcFlights.some(
    (f) => f.lotId === lotId && f.status === 'awaiting_pilot',
  );
}

function npcReadyForStarterFloorOffer(npc: NpcFreighter): boolean {
  if (!npcCanOfferContractPilot(npc)) return false;
  if (!isStarterContractPilotClass(npc.aircraftClassId)) return false;
  if (npc.status === 'idle' || npc.status === 'resting') return true;
  if (npc.status === 'busy' && !npc.currentFlightId) return true;
  return false;
}

function prepareNpcForFloorOffer(npc: NpcFreighter, originIcao: string): void {
  npc.status = 'idle';
  npc.locationIcao = originIcao;
  npc.currentFlightId = undefined;
  npc.busyUntilMs = undefined;
  npc.busyUntilTick = undefined;
}

function pickStarterFloorLot(
  world: CareerEconomyWorld,
  countryId: string,
  rng: () => number,
  opts?: { preferRegions?: string[] },
): ShipmentLot | undefined {
  const candidates = world.lots.filter((lot) => {
    if (lot.status !== 'available') return false;
    if (lot.reservedKg > 0) return false;
    const avail = lotAvailableKg(lot);
    if (avail < NPC_MIN_BID_KG) return false;
    if (contractPilotOriginCountry(world, lot.originIcao) !== countryId) {
      return false;
    }
    if (lotHasOpenAwaitingPilot(world, lot.id)) return false;
    const distanceNm = routeDistanceNm(world, lot.originIcao, lot.destIcao) ?? 0;
    if (distanceNm > starterContractPilotMaxRangeNm()) return false;
    for (const classId of STARTER_CONTRACT_PILOT_CLASSES) {
      if (distanceNm > getAircraftClass(classId).maxRangeNm) continue;
      if (
        contractPilotHasFlyableAirframe(
          {
            aircraftClassId: classId,
            cargoKg: Math.min(avail, 1_000),
            payUsd: lot.payUsd,
            originIcao: lot.originIcao,
            destIcao: lot.destIcao,
          },
          { distanceNm },
        )
      ) {
        return true;
      }
    }
    return false;
  });
  if (candidates.length === 0) return undefined;
  const prefer = opts?.preferRegions?.filter(Boolean) ?? [];
  if (prefer.length > 0) {
    const regional = candidates.filter((lot) => {
      const region = airportRegion(world, lot.originIcao);
      return region != null && prefer.includes(region);
    });
    if (regional.length > 0) {
      return regional[Math.floor(rng() * regional.length)];
    }
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

function pickStarterFloorNpc(
  world: CareerEconomyWorld,
  lot: ShipmentLot,
  rng: () => number,
): NpcFreighter | undefined {
  const originRegion = airportRegion(world, lot.originIcao);
  const distanceNm = routeDistanceNm(world, lot.originIcao, lot.destIcao) ?? 0;
  const avail = lotAvailableKg(lot);
  const candidates = world.npcs.filter((npc) => {
    if (!npcReadyForStarterFloorOffer(npc)) return false;
    const cargoKg = Math.min(avail, npcMaxCargoKg(npc));
    return contractPilotHasFlyableAirframe(
      {
        aircraftClassId: npc.aircraftClassId,
        cargoKg,
        payUsd: lot.payUsd,
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
      },
      { distanceNm },
    );
  });
  if (candidates.length === 0) return undefined;
  const homeMatch = originRegion
    ? candidates.filter((npc) => npc.homeRegion === originRegion)
    : [];
  const pool = homeMatch.length > 0 ? homeMatch : candidates;
  return pool[Math.floor(rng() * pool.length)];
}

function preferStarterFloorRegions(
  world: CareerEconomyWorld,
  countryId: string,
): string[] {
  const regions = new Set<string>();
  for (const npc of world.npcs) {
    const region = (npc.homeRegion ?? '').trim();
    if (!region) continue;
    if (countryIdFromRegion(region) === countryId) regions.add(region);
  }
  return [...regions];
}

/**
 * When the home-country starter crew floor is empty but NPCs are mid catch-up
 * (all busy in flight), open contract holds on live market lots so empty-hangar
 * players see Crew needed without waiting for the backlog to drain.
 */
export function topUpStarterContractPilotFloor(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): number {
  healAwaitingPilotBoardLots(world, nowMs);
  let added = 0;
  const rng = mulberry32(
    hashSeed(`${world.seed}:crew-floor:${world.tick}:${nowMs}`),
  );
  for (const countryId of activeContractPilotCountries(world)) {
    let need =
      starterContractPilotCountryFloor(1) -
      countOpenContractPilotOffersInCountry(world, countryId, 'starter');
    if (need <= 0) continue;
    const preferRegions = preferStarterFloorRegions(world, countryId);
    while (need > 0) {
      const lot = pickStarterFloorLot(world, countryId, rng, {
        preferRegions,
      });
      if (!lot) break;
      const npc = pickStarterFloorNpc(world, lot, rng);
      if (!npc) break;
      prepareNpcForFloorOffer(npc, lot.originIcao);
      try {
        createNpcContractPilotOffer(world, npc.id, lot.id, {
          nowMs,
          rng,
          forceAwaitingPilot: true,
          respectCaps: false,
        });
        added += 1;
        need -= 1;
      } catch {
        break;
      }
    }
  }
  return added;
}

/**
 * Player accepts a crew-needed offer with a homologated airframe of the same
 * class (not necessarily the NPC's SKU). Lift is capped by that airframe's
 * cargo ceiling. Any remainder stays on the board as the same Contract
 * (player-exclusive) until claimed again or the offer window expires — then
 * the operator departs alone with what's left.
 * `payUsd` on the player mission is the proportional pilot fee.
 */
export function acceptContractPilotOffer(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts: {
    npcFlightId?: string;
    lotId?: string;
    /** Homologated player SKU to fly (same class as the offer). */
    airframeTypeId: string;
    nowMs?: number;
    missionId?: string;
  },
): {
  mission: MissionIntent;
  pilotFeeUsd: number;
  grossPayUsd: number;
  npcName: string;
  airframeLabel: string;
  liftedKg: number;
  remainderKg: number;
  /**
   * True when leftover cargo stayed on the board as an open Contract
   * (player may claim again after finishing this mission, until the window).
   */
  remainderOpenOnBoard: boolean;
  /**
   * @deprecated Always false for freight Contracts — remainder stays claimable
   * instead of the NPC departing immediately. Kept for API compatibility.
   */
  npcDepartedWithRemainder: boolean;
  /** Prior pilot hub before operator-covered reposition (if moved). */
  pilotRelocatedFrom?: string;
} {
  // Resolve the offer before ensureNpcFleet — that settle path promotes
  // expired awaiting_pilot holds into NPC solo departures.
  const nowMs = opts.nowMs ?? Date.now();
  const flight =
    (opts.npcFlightId
      ? world.npcFlights.find((f) => f.id === opts.npcFlightId)
      : undefined) ??
    (opts.lotId
      ? world.npcFlights.find(
          (f) => f.lotId === opts.lotId && f.status === 'awaiting_pilot',
        )
      : undefined);
  if (!flight || flight.status !== 'awaiting_pilot') {
    throw new Error('No open crew-needed offer for that lot');
  }
  assertClassOpsUnlocked(state.classOps, flight.aircraftClassId);
  const until = flight.awaitingPilotUntilMs ?? 0;
  if (until > 0 && nowMs >= until) {
    throw new Error('Crew-needed offer expired — NPC is departing alone');
  }

  ensureNpcFleet(world);
  if (flight.status !== 'awaiting_pilot') {
    throw new Error('No open crew-needed offer for that lot');
  }

  const npc = world.npcs.find((n) => n.id === flight.npcId);
  if (!npc) {
    throw new Error(`Unknown operator ${flight.npcId}`);
  }

  const typeId = opts.airframeTypeId?.trim();
  if (!typeId) {
    throw new Error('airframeTypeId required — pick an aircraft of this class');
  }
  const airframe = findCareerPlayerAirframe(typeId);
  if (!airframe || !isCareerPlayerAirframeEnabled(airframe)) {
    throw new Error(`Unknown or disabled airframe ${typeId}`);
  }
  if (airframe.aircraftClassId !== flight.aircraftClassId) {
    throw new Error(
      `Airframe ${airframe.label} is ${airframe.aircraftClassId}, offer needs ${flight.aircraftClassId}`,
    );
  }

  const blocking = listActivePlayerMissions(state.missions).find(
    (m) => m.crewOperated !== true,
  );
  if (blocking) {
    throw new Error(
      `Finish or cancel ${blocking.id} in Dispatch before accepting another flight`,
    );
  }

  const lot = findLot(world, flight.lotId);
  if (!lot) {
    throw new Error(`Lot ${flight.lotId} no longer exists`);
  }

  const isRepo = isNpcRepositionFlight(flight);

  if (!isRepo && lot.reservedKg < flight.cargoKg) {
    throw new Error(
      `Lot reservation mismatch (reserved ${lot.reservedKg} kg, offer ${flight.cargoKg} kg)`,
    );
  }

  const offerCargoKg = flight.cargoKg;
  const offerPayUsd = flight.payUsd;
  const offerFeeUsd = isRepo
    ? (flight.pilotFeeUsd ??
      quoteRepositionPilotFeeUsd(
        routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? 0,
        flight.aircraftClassId,
      ))
    : quoteContractPilotFeeUsd(offerPayUsd, {
        distanceNm:
          routeDistanceNm(world, flight.originIcao, flight.destIcao) ??
          undefined,
        aircraftClassId: flight.aircraftClassId,
      });
  const distanceNm =
    routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? undefined;

  let liftedKg: number;
  let remainderKg: number;
  let pilotFeeUsd: number;
  let grossPayUsd: number;

  if (isRepo) {
    liftedKg = 0;
    remainderKg = 0;
    pilotFeeUsd = Math.max(REPOSITION_PILOT_FEE_MIN_USD, offerFeeUsd);
    grossPayUsd = pilotFeeUsd;
  } else {
    liftedKg = contractPilotLiftKg(
      airframe.typeId,
      flight.aircraftClassId,
      offerCargoKg,
      { distanceNm },
    );
    if (liftedKg <= 0) {
      throw new Error(
        `${airframe.label} cannot lift any of this ${offerCargoKg} kg offer`,
      );
    }
    remainderKg = offerCargoKg - liftedKg;
    const liftFrac = liftedKg / offerCargoKg;
    pilotFeeUsd = Math.max(
      CONTRACT_PILOT_FEE_MIN_USD,
      Math.round(offerFeeUsd * liftFrac),
    );
    grossPayUsd = Math.max(1, Math.round(offerPayUsd * liftFrac));
  }

  const missionId =
    opts.missionId?.trim() ||
    `msn_cp_${world.tick}_${flight.originIcao}_${flight.destIcao}_${Math.floor(Math.random() * 1e6)}`;

  // Reposition has no cargo SLA; freight uses a fair accept-time floor so an
  // already-expired lot does not auto-fail the pilot who just claimed the offer.
  const deadlineTick = contractPilotMissionDeadlineTick({
    worldTick: world.tick,
    lotExpiresAtTick: isRepo ? 0 : lot.expiresAtTick,
    distanceNm,
    aircraftClassId: flight.aircraftClassId,
  });

  const mission = recomputeMissionTotals({
    id: missionId,
    lots: isRepo
      ? []
      : [
          {
            shipmentLotId: flight.lotId,
            commodityId: flight.commodityId,
            cargoKg: liftedKg,
            payUsd: pilotFeeUsd,
            urgency: lot.urgency,
            reason: `${lot.reason} · contract ${npc.name}`,
            deadlineTick,
          },
        ],
    shipmentLotId: isRepo ? `deadhead_${flight.id}` : flight.lotId,
    commodityId: flight.commodityId,
    originIcao: flight.originIcao,
    destIcao: flight.destIcao,
    cargoKg: liftedKg,
    pax: 0,
    aircraftClassId: flight.aircraftClassId,
    airframeTypeId: airframe.typeId,
    rolesPackRelPath: airframe.rolesPackRelPath,
    deadlineTick,
    payUsd: pilotFeeUsd,
    urgency: lot.urgency,
    reason: isRepo
      ? `Reposition · contract ${npc.name} · ${flight.originIcao}→${flight.destIcao}`
      : `${lot.reason} · contract ${npc.name}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    contractPilot: true,
    ...(isRepo ? { contractPilotReposition: true } : {}),
    contractPilotFeeUsd: pilotFeeUsd,
    contractGrossPayUsd: grossPayUsd,
    operatorNpcId: npc.id,
    operatorNpcName: npc.name,
    npcFlightId: flight.id,
  });

  let remainderOpenOnBoard = false;
  if (!isRepo && remainderKg > 0) {
    // Keep the Contract open for further player claims until the window ends.
    const remFrac = remainderKg / offerCargoKg;
    flight.cargoKg = remainderKg;
    flight.payUsd = Math.max(1, Math.round(offerPayUsd * remFrac));
    flight.pilotFeeUsd = quoteContractPilotFeeUsd(flight.payUsd, {
      distanceNm,
      aircraftClassId: flight.aircraftClassId,
    });
    // Window / busy hold unchanged — do not promote to in_flight.
    if (lot.status === 'in_transit') {
      lot.status = 'reserved';
    }
    remainderOpenOnBoard = true;
  } else {
    world.npcFlights = world.npcFlights.filter((f) => f.id !== flight.id);
    if (npc.currentFlightId === flight.id) {
      npc.currentFlightId = undefined;
    }
    npc.status = 'idle';
    npc.busyUntilMs = undefined;
    npc.busyUntilTick = undefined;
    if (isRepo) {
      lot.quantityKg = 0;
      lot.reservedKg = 0;
      lot.status = 'delivered';
    }
  }

  state.missions = [...state.missions, mission];
  syncPlayerInbound(world, mission);

  // Operator covers deadhead to the offer origin (cash + time free).
  const priorPilot = (state.pilotIcao ?? '').trim().toUpperCase();
  const origin = flight.originIcao.trim().toUpperCase();
  let pilotRelocatedFrom: string | undefined;
  if (origin && priorPilot !== origin) {
    if (priorPilot) pilotRelocatedFrom = priorPilot;
    syncPilotIcaoTo(state, origin);
  }

  return {
    mission,
    pilotFeeUsd,
    grossPayUsd,
    npcName: npc.name,
    airframeLabel: airframe.label,
    liftedKg,
    remainderKg,
    remainderOpenOnBoard,
    npcDepartedWithRemainder: false,
    ...(pilotRelocatedFrom ? { pilotRelocatedFrom } : {}),
  };
}

/** Cargo kg a player airframe can take from a contract-pilot offer. */
export function contractPilotLiftKg(
  airframeTypeId: string,
  aircraftClassId: FreighterClassId,
  offerCargoKg: number,
  opts?: { distanceNm?: number },
): number {
  const classDef = getAircraftClass(aircraftClassId);
  const catalog = findCareerPlayerAirframe(airframeTypeId);
  const perf = resolveAirframePerfForUi(airframeTypeId, aircraftClassId, {
    maxCargoKg: classDef.maxCargoKg,
    maxRangeNm: classDef.maxRangeNm,
  });
  const structural = Math.max(0, Math.floor(perf.maxCargoKg));
  let cap = structural;
  const distanceNm = opts?.distanceNm;
  if (typeof distanceNm === 'number' && Number.isFinite(distanceNm) && distanceNm > 0) {
    if (!contractPilotDistanceWithinRange(distanceNm, perf.maxRangeNm)) {
      return 0;
    }
    const route = estimateRouteCargoLimit(
      aircraftClassId,
      distanceNm,
      structural,
      {
        oewKg: catalog?.oewKg,
        mtowKg: catalog?.mtowKg,
        fuelCapacityKg: catalog?.fuelCapacityKg,
        fuelBurnKgPerNm: catalog?.fuelBurnKgPerNm,
        airframeTypeId,
      },
    );
    // Prefer route MTOW/fuel payload so SimBrief OFP cargo matches the mission.
    cap = Math.max(0, Math.floor(route.operationalMaxCargoKg));
  }
  return Math.max(0, Math.min(Math.floor(offerCargoKg), cap));
}

function contractPilotDistanceWithinRange(
  distanceNm: number | undefined,
  maxRangeNm: number,
): boolean {
  return (
    typeof distanceNm === 'number' &&
    Number.isFinite(distanceNm) &&
    distanceNm > 0 &&
    distanceNm <= maxRangeNm
  );
}

function starterContractPilotMaxRangeNm(): number {
  let max = 0;
  for (const classId of STARTER_CONTRACT_PILOT_CLASSES) {
    max = Math.max(max, getAircraftClass(classId).maxRangeNm);
  }
  return max;
}

export type ContractPilotPickAirframe = {
  typeId: string;
  label: string;
  aircraftClassId: FreighterClassId;
  maxCargoKg: number;
  /** Structural max when distance unknown; else route operational cap used for lift. */
  operationalMaxCargoKg: number;
  liftKg: number;
  remainderKg: number;
  coversOffer: boolean;
  /** True when route fuel/MTOW capped lift below structural max. */
  routeLimited: boolean;
  pilotFeeUsd: number;
};

/** Homologated SKUs the player can pick for a crew-needed offer. */
export function listContractPilotPickAirframes(
  flight: Pick<
    NpcFlight,
    | 'aircraftClassId'
    | 'cargoKg'
    | 'payUsd'
    | 'pilotFeeUsd'
    | 'originIcao'
    | 'destIcao'
    | 'kind'
  >,
  opts?: { distanceNm?: number },
): ContractPilotPickAirframe[] {
  const isRepo = isNpcRepositionFlight(flight);
  const offerCargoKg = Math.max(0, Math.floor(flight.cargoKg));
  // Cargo fees re-quote from pay + nm (nm floor can change); ferry keeps frozen offer.
  const offerFee = isRepo
    ? (flight.pilotFeeUsd ??
      quoteRepositionPilotFeeUsd(
        opts?.distanceNm ?? 0,
        flight.aircraftClassId,
      ))
    : quoteContractPilotFeeUsd(flight.payUsd, {
        distanceNm: opts?.distanceNm,
        aircraftClassId: flight.aircraftClassId,
      });
  const distanceNm =
    typeof opts?.distanceNm === 'number' && Number.isFinite(opts.distanceNm)
      ? opts.distanceNm
      : undefined;
  return listCareerPlayerAirframes(flight.aircraftClassId).map((airframe) => {
    const perf = resolveAirframePerfForUi(
      airframe.typeId,
      airframe.aircraftClassId,
      {
        maxCargoKg: getAircraftClass(airframe.aircraftClassId).maxCargoKg,
        maxRangeNm: getAircraftClass(airframe.aircraftClassId).maxRangeNm,
      },
    );
    const structuralMax = perf.maxCargoKg;
    const outOfRange =
      typeof distanceNm === 'number' &&
      Number.isFinite(distanceNm) &&
      distanceNm > 0 &&
      !contractPilotDistanceWithinRange(distanceNm, perf.maxRangeNm);
    let operationalMaxCargoKg = structuralMax;
    if (!outOfRange && typeof distanceNm === 'number' && distanceNm > 0) {
      const catalog = findCareerPlayerAirframe(airframe.typeId);
      operationalMaxCargoKg = estimateRouteCargoLimit(
        flight.aircraftClassId,
        distanceNm,
        structuralMax,
        {
          oewKg: catalog?.oewKg,
          mtowKg: catalog?.mtowKg,
          fuelCapacityKg: catalog?.fuelCapacityKg,
          fuelBurnKgPerNm: catalog?.fuelBurnKgPerNm,
          airframeTypeId: airframe.typeId,
        },
      ).operationalMaxCargoKg;
    }
    if (isRepo) {
      return {
        typeId: airframe.typeId,
        label: airframe.label,
        aircraftClassId: airframe.aircraftClassId,
        maxCargoKg: structuralMax,
        operationalMaxCargoKg: outOfRange ? 0 : operationalMaxCargoKg,
        liftKg: 0,
        remainderKg: 0,
        coversOffer: !outOfRange,
        routeLimited: !outOfRange && operationalMaxCargoKg < structuralMax,
        pilotFeeUsd: outOfRange
          ? 0
          : Math.max(REPOSITION_PILOT_FEE_MIN_USD, offerFee),
      };
    }
    const liftKg = outOfRange
      ? 0
      : Math.max(
          0,
          Math.min(offerCargoKg, Math.floor(operationalMaxCargoKg)),
        );
    const remainderKg = Math.max(0, offerCargoKg - liftKg);
    const liftFrac = offerCargoKg > 0 ? liftKg / offerCargoKg : 0;
    return {
      typeId: airframe.typeId,
      label: airframe.label,
      aircraftClassId: airframe.aircraftClassId,
      maxCargoKg: structuralMax,
      operationalMaxCargoKg,
      liftKg,
      remainderKg,
      coversOffer: remainderKg <= 0 && liftKg > 0,
      routeLimited: operationalMaxCargoKg < structuralMax,
      pilotFeeUsd:
        liftKg > 0
          ? Math.max(CONTRACT_PILOT_FEE_MIN_USD, Math.round(offerFee * liftFrac))
          : 0,
    };
  });
}

/** Fee range across flyable homologated airframes (scales with partial lift). */
export function contractPilotFeeRangeUsd(
  flight: Pick<
    NpcFlight,
    | 'aircraftClassId'
    | 'cargoKg'
    | 'payUsd'
    | 'pilotFeeUsd'
    | 'originIcao'
    | 'destIcao'
    | 'kind'
  >,
  opts?: { distanceNm?: number },
): { minUsd: number; maxUsd: number } {
  const isRepo = isNpcRepositionFlight(flight);
  const fullFee = isRepo
    ? (flight.pilotFeeUsd ??
      quoteRepositionPilotFeeUsd(
        opts?.distanceNm ?? 0,
        flight.aircraftClassId,
      ))
    : quoteContractPilotFeeUsd(flight.payUsd, {
        distanceNm: opts?.distanceNm,
        aircraftClassId: flight.aircraftClassId,
      });
  if (isRepo) {
    return { minUsd: fullFee, maxUsd: fullFee };
  }
  const fees = listContractPilotPickAirframes(flight, opts)
    .filter((a) => a.liftKg > 0)
    .map((a) => a.pilotFeeUsd);
  if (fees.length === 0) {
    return { minUsd: fullFee, maxUsd: fullFee };
  }
  return {
    minUsd: Math.min(...fees),
    maxUsd: Math.max(...fees, fullFee),
  };
}

function pushRegionBucket(
  buckets: Map<string, BidCandidate[]>,
  region: string | undefined,
  row: BidCandidate,
): void {
  const key = region ?? '';
  const list = buckets.get(key);
  if (list) list.push(row);
  else buckets.set(key, [row]);
}

/** Drop dead rows in place; preserves relative order of live candidates. */
function compactLiveRows(rows: BidCandidate[]): void {
  let write = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.dead) continue;
    rows[write++] = row;
  }
  rows.length = write;
}

type BidCandidate = {
  lot: ShipmentLot;
  dist: number;
  payPerKg: number;
  basePricePerKg: number;
  payScore: number;
  originRegion: string | undefined;
  destRegion: string | undefined;
  expiryFrac: number;
  odKey: string;
  urgencyHot: boolean;
  dead: boolean;
  seenGen: number;
};

type ClassBidBoard = {
  rows: BidCandidate[];
  byOriginRegion: Map<string, BidCandidate[]>;
  byDestRegion: Map<string, BidCandidate[]>;
};

function npcBidOnMarket(
  world: CareerEconomyWorld,
  rng: () => number,
  batchNowMs: number,
  tickKey: string,
): void {
  const idle = world.npcs.filter((n) => {
    if (n.currentFlightId) return false;
    if (n.status === 'maintenance') {
      if (!groundHoldExpired(npcMxUntilMs(n), n.mxUntilTick, batchNowMs, world.tick)) {
        return false;
      }
      finishShopMx(world, n, batchNowMs);
    }
    if (n.status === 'resting') {
      if (!groundHoldExpired(npcRestUntilMs(n), n.restUntilTick, batchNowMs, world.tick)) {
        return false;
      }
      clearCrewRest(n);
    }
    if (n.status === 'busy') {
      if (!groundHoldExpired(npcBusyUntilMs(n), n.busyUntilTick, batchNowMs, world.tick)) {
        return false;
      }
      finishTurnaround(world, n, batchNowMs);
    }
    if (n.status === 'resting' || n.status === 'maintenance') return false;
    if (n.status !== 'idle') return false;
    n.busyUntilTick = undefined;
    n.busyUntilMs = undefined;
    return true;
  });

  for (let i = idle.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = idle[i]!;
    idle[i] = idle[j]!;
    idle[j] = tmp;
  }

  const claimedLotIds = new Set(
    world.npcFlights.filter(isNpcFlightHoldingLot).map((f) => f.lotId),
  );
  const laneIndex = ensureLaneInboundIndex(world);

  // One pass each — regionCapacity / hub-level used to re-filter the full
  // fleet or airport list on every distinct homeRegion.
  const npcsByHomeRegion = new Map<string, NpcFreighter[]>();
  for (const n of world.npcs) {
    const list = npcsByHomeRegion.get(n.homeRegion);
    if (list) list.push(n);
    else npcsByHomeRegion.set(n.homeRegion, [n]);
  }
  const airportsByRegion = new Map<string, typeof world.airports>();
  for (const ap of world.airports) {
    const list = airportsByRegion.get(ap.region);
    if (list) list.push(ap);
    else airportsByRegion.set(ap.region, [ap]);
  }

  const regionCapacityCache = new Map<string, number>();
  const regionCapacity = (region: string): number => {
    let cached = regionCapacityCache.get(region);
    if (cached === undefined) {
      const home = npcsByHomeRegion.get(region) ?? [];
      if (home.length === 0) {
        cached = 1;
      } else {
        let ready = 0;
        for (const npc of home) {
          if (isNpcReadyToBid(npc, batchNowMs, world.tick)) ready += 1;
        }
        cached = ready / home.length;
      }
      regionCapacityCache.set(region, cached);
    }
    return cached;
  };
  const levelBidCache = new Map<string, number>();
  const levelBidFor = (region: string): number => {
    let cached = levelBidCache.get(region);
    if (cached === undefined) {
      const list = airportsByRegion.get(region) ?? [];
      let avg = 1;
      if (list.length > 0) {
        let sum = 0;
        for (const a of list) sum += clampHubLevel(a.level ?? 1);
        avg = sum / list.length;
      }
      cached = hubLevelNpcBidMult(avg);
      levelBidCache.set(region, cached);
    }
    return cached;
  };

  // One pass over the board, then per-class slices. Same gates as scoreLotForNpc
  // (range + GA LTL) — intl lots stay on every class that can fly the OD.
  const board: BidCandidate[] = [];
  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') continue;
    if (lotAvailableKg(lot) < NPC_MIN_BID_KG) continue;
    if (claimedLotIds.has(lot.id)) continue;
    if (!isBushFreightOdAllowed(lot.originIcao, lot.destIcao)) continue;
    const dist = routeDistanceNm(world, lot.originIcao, lot.destIcao);
    if (dist === undefined) continue;
    const origin = lot.originIcao.trim().toUpperCase();
    const dest = lot.destIcao.trim().toUpperCase();
    const commodity = getCommodity(lot.commodityId);
    const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
    const ticksLeft = Math.max(0, lot.expiresAtTick - world.tick);
    board.push({
      lot,
      dist,
      payPerKg: lot.payUsd / Math.max(1, lot.quantityKg),
      basePricePerKg: commodity.basePricePerKg,
      payScore: Math.min(
        2.2,
        lot.payUsd / Math.max(1, lot.quantityKg) / commodity.basePricePerKg,
      ),
      originRegion: airportRegion(world, lot.originIcao),
      destRegion: airportRegion(world, lot.destIcao),
      expiryFrac: 1 - ticksLeft / life,
      odKey: `${origin}|${dest}|${lot.commodityId}`,
      urgencyHot: lot.urgency === 'urgent',
      dead: false,
      seenGen: 0,
    });
  }
  const candidatesByClass = new Map<FreighterClassId, ClassBidBoard>();
  for (const slot of NPC_FLEET_CLASS_SHARES) {
    const maxRangeNm = getAircraftClass(slot.aircraftClassId).maxRangeNm;
    const classBoard: ClassBidBoard = {
      rows: [],
      byOriginRegion: new Map(),
      byDestRegion: new Map(),
    };
    for (const row of board) {
      if (row.dist > maxRangeNm) continue;
      if (
        slot.aircraftClassId === 'light_ga' &&
        row.lot.quantityKg > SMALL_LOT_MAX_KG
      ) {
        continue;
      }
      classBoard.rows.push(row);
      pushRegionBucket(classBoard.byOriginRegion, row.originRegion, row);
      pushRegionBucket(classBoard.byDestRegion, row.destRegion, row);
    }
    candidatesByClass.set(slot.aircraftClassId, classBoard);
  }
  const fallbackBoard: ClassBidBoard = {
    rows: board,
    byOriginRegion: new Map(),
    byDestRegion: new Map(),
  };
  const opsMaxCache = new Map<string, number>();
  const operationalMaxFor = (
    npc: NpcFreighter,
    dist: number,
    maxCargoKg: number,
  ): number => {
    const key = `${npc.airframeTypeId ?? npc.aircraftClassId}|${maxCargoKg}|${Math.round(dist)}`;
    let cached = opsMaxCache.get(key);
    if (cached === undefined) {
      cached = npcOperationalMaxCargoKg(npc, dist, maxCargoKg);
      opsMaxCache.set(key, cached);
    }
    return cached;
  };

  let visitGen = 1;
  let claimsSinceCompact = 0;
  for (const npc of idle) {
    const regionCap = regionCapacity(npc.homeRegion);
    const wx = regionalWeatherIndex(world, npc.homeRegion);
    const levelBid = levelBidFor(npc.homeRegion);
    // Pulse @160: util ~55% with idle sitting out — raise attempt rate and keep a
    // higher floor when home-region capacity is thin (was self-starving bids).
    const bidChance =
      (0.34 + npc.aggressiveness * 0.58) *
      (0.58 + 0.42 * regionCap) *
      regionalWeatherBidMult(wx) *
      levelBid;
    if (rng() > bidChance) continue;
    // Second gate: slightly more willing to commit once they attempt.
    if (rng() > 0.62 + npc.reliability * 0.4) continue;

    const maxCargoKg = npcMaxCargoKg(npc);
    const threshold = 0.48 + npc.reliability * 0.28 - npc.aggressiveness * 0.22;
    const classBoard =
      candidatesByClass.get(npc.aircraftClassId) ?? fallbackBoard;
    const minPayMult = 0.35 * npc.feeBias;
    const noiseScale = 0.22 * (1.05 - npc.reliability);
    const maxNoise = 0.5 * noiseScale;
    const home = npc.homeRegion;
    const scoreArgs = {
      payScore: 0,
      urgencyHot: false,
      expiryFrac: 0,
      regionMatch: false,
      noise: 0,
      busyPenalty: 0,
      aggressiveness: npc.aggressiveness,
      fillRatio: 1,
      liftBonus: 0,
      ltlPenalty: 0,
    };
    const busyPenaltyOf = (row: BidCandidate): number => {
      const inboundKg = laneIndex.byOd.get(row.odKey) ?? 0;
      const laneSat = Math.min(1, inboundKg / LANE_SATURATION_KG);
      return laneSat >= LANE_BUSY_SATURATION ? laneSat * 0.65 : 0;
    };
    const ceilingOf = (row: BidCandidate, regionMatch: boolean): number => {
      scoreArgs.payScore = row.payScore;
      scoreArgs.urgencyHot = row.urgencyHot;
      scoreArgs.expiryFrac = row.expiryFrac;
      scoreArgs.regionMatch = regionMatch;
      scoreArgs.noise = maxNoise;
      scoreArgs.busyPenalty = busyPenaltyOf(row);
      scoreArgs.fillRatio = 1;
      scoreArgs.liftBonus = valueHeavyNpcLiftBonus(
        row.lot,
        world.tick,
        npc.aircraftClassId,
      );
      scoreArgs.ltlPenalty = valueHeavyNpcLtlPenalty(
        row.lot,
        npc.aircraftClassId,
      );
      return npcBidScore(scoreArgs);
    };

    visitGen += 1;
    const gen = visitGen;
    let best: { lot: ShipmentLot; score: number; row: BidCandidate } | undefined;

    const consider = (row: BidCandidate, regionMatch: boolean): void => {
      if (row.dead || row.seenGen === gen) return;
      row.seenGen = gen;
      const lot = row.lot;
      if (row.payPerKg < row.basePricePerKg * minPayMult) return;
      const optimistic = ceilingOf(row, regionMatch);
      if (optimistic < threshold) return;
      if (best && optimistic < best.score) return;
      const opsMax = operationalMaxFor(npc, row.dist, maxCargoKg);
      if (opsMax < NPC_MIN_BID_KG) return;
      const avail = lot.quantityKg - lot.reservedKg;
      const cargoKg = Math.min(avail, maxCargoKg, opsMax);
      const noise =
        (hash01(`${tickKey}:npc:noise:${npc.id}:${lot.id}`) - 0.5) * noiseScale;
      scoreArgs.payScore = row.payScore;
      scoreArgs.urgencyHot = row.urgencyHot;
      scoreArgs.expiryFrac = row.expiryFrac;
      scoreArgs.regionMatch = regionMatch;
      scoreArgs.noise = noise;
      scoreArgs.busyPenalty = busyPenaltyOf(row);
      scoreArgs.fillRatio = cargoKg / maxCargoKg;
      scoreArgs.liftBonus = valueHeavyNpcLiftBonus(
        lot,
        world.tick,
        npc.aircraftClassId,
      );
      scoreArgs.ltlPenalty = valueHeavyNpcLtlPenalty(
        lot,
        npc.aircraftClassId,
      );
      const score = npcBidScore(scoreArgs);
      if (score < threshold) return;
      if (!best || score > best.score) {
        best = { lot, score, row };
      }
    };

    const homeOrigin = classBoard.byOriginRegion.get(home) ?? [];
    const homeDest = classBoard.byDestRegion.get(home) ?? [];
    for (const row of homeOrigin) consider(row, true);
    for (const row of homeDest) {
      consider(row, row.originRegion === home || row.destRegion === home);
    }
    for (const row of classBoard.rows) {
      if (row.originRegion === home || row.destRegion === home) continue;
      consider(row, false);
    }

    if (!best) continue;
    const claimRng = mulberry32(hashSeed(`${tickKey}:npc:claim:${npc.id}`));
    const flight = claimLotForNpc(world, npc, best.lot, batchNowMs, claimRng);
    if (flight) {
      claimedLotIds.add(best.lot.id);
      best.row.dead = true;
      // Compact periodically — every claim was O(board×claims); never compacting
      // left later NPCs walking thousands of dead rows. Batch keeps live order.
      claimsSinceCompact += 1;
      if (claimsSinceCompact >= 48) {
        for (const board of candidatesByClass.values()) {
          compactLiveRows(board.rows);
        }
        claimsSinceCompact = 0;
      }
    }
  }
}

/**
 * Hourly NPC bidding after lots form. Continuous settle is settleNpcOpsDue.
 */
export function tickNpcFreighters(
  world: CareerEconomyWorld,
  rng: () => number,
  opts: { batchNowMs?: number; tickKey?: string } = {},
): void {
  // Fleet ensure + settle run at the start of tickEconomy (before lot formation).
  const batchNowMs = opts.batchNowMs ?? world.lastBatchAtMs ?? Date.now();
  const tickKey =
    opts.tickKey ?? `${world.seed}:t${world.tick}`;
  npcBidOnMarket(world, rng, batchNowMs, tickKey);
}

export function listNpcActivity(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): NpcActivityView[] {
  ensureNpcFleet(world);
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  const views: NpcActivityView[] = [];

  for (const flight of world.npcFlights) {
    if (flight.status !== 'in_flight') continue;
    const npc = byId.get(flight.npcId);
    const lot = findLot(world, flight.lotId);
    const dist = routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? 0;
    const departed = flightDepartedAtMs(flight);
    const arrives = flightArrivesAtMs(flight);
    const durationMs = Math.max(1, arrives - departed);
    const flightHours = msToHours(durationMs);
    const flownMs = Math.min(durationMs, Math.max(0, nowMs - departed));
    const etaMs = Math.max(0, arrives - nowMs);
    const hoursRemaining = msToHours(etaMs);
    const progressPct = Math.min(100, Math.round((flownMs / durationMs) * 100));

    views.push({
      flight,
      npcName: npc?.name ?? flight.npcId,
      commodityName: getCommodity(flight.commodityId).name,
      hoursRemaining,
      etaMs,
      distanceNm: dist,
      payUsd: flight.payUsd,
      urgency: lot?.urgency ?? 'normal',
      progressPct,
      flightHours,
      homeRegion: npc?.homeRegion ?? '',
      aircraftLabel: npc ? npcAirframeLabel(npc) : getAircraftClass(flight.aircraftClassId).name,
      phase: etaMs <= ARRIVING_WINDOW_MS ? 'arriving' : 'enroute',
    });
  }

  views.sort((a, b) => a.etaMs - b.etaMs);
  return views;
}

/** Full competing fleet roster for ops board. */
export function listNpcFleetStatus(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): NpcFleetMemberView[] {
  ensureNpcFleet(world);
  const flightsByNpc = new Map(
    world.npcFlights
      .filter((f) => f.status === 'in_flight')
      .map((f) => [f.npcId, f] as const),
  );
  const activityByFlight = new Map(
    listNpcActivity(world, nowMs).map((a) => [a.flight.id, a] as const),
  );

  const rows: NpcFleetMemberView[] = world.npcs.map((npc) => {
    const flight = flightsByNpc.get(npc.id);
    const activity = flight ? activityByFlight.get(flight.id) : undefined;

    let phase: NpcFleetMemberView['phase'] = 'idle';
    let turnaroundHoursLeft: number | undefined;
    let restHoursLeft: number | undefined;
    let mxHoursLeft: number | undefined;
    if (flight && activity) {
      phase = activity.phase;
    } else if (
      npc.status === 'maintenance' &&
      !groundHoldExpired(npcMxUntilMs(npc), npc.mxUntilTick, nowMs, world.tick)
    ) {
      phase = 'maintenance';
      mxHoursLeft = Math.max(0, msToHours(npcMxUntilMs(npc) - nowMs));
    } else if (
      npc.status === 'resting' &&
      !groundHoldExpired(npcRestUntilMs(npc), npc.restUntilTick, nowMs, world.tick)
    ) {
      phase = 'resting';
      restHoursLeft = Math.max(0, msToHours(npcRestUntilMs(npc) - nowMs));
    } else if (
      npc.status === 'busy' &&
      !groundHoldExpired(npcBusyUntilMs(npc), npc.busyUntilTick, nowMs, world.tick)
    ) {
      phase = 'turnaround';
      turnaroundHoursLeft = Math.max(0, msToHours(npcBusyUntilMs(npc) - nowMs));
    }

    const originRegion = flight
      ? airportRegion(world, flight.originIcao) ?? ''
      : '';
    const destRegion = flight
      ? airportRegion(world, flight.destIcao) ?? ''
      : '';
    const mission =
      flight && activity
        ? {
            flightId: flight.id,
            lotId: flight.lotId,
            originIcao: flight.originIcao,
            destIcao: flight.destIcao,
            commodityId: flight.commodityId,
            commodityName: activity.commodityName,
            cargoKg: flight.cargoKg,
            payUsd: flight.payUsd,
            distanceNm: activity.distanceNm,
            departedAtTick: flight.departedAtTick,
            arrivesAtTick: flight.arrivesAtTick,
            departedAtMs: flightDepartedAtMs(flight),
            arrivesAtMs: flightArrivesAtMs(flight),
            etaHours: activity.hoursRemaining,
            etaMs: activity.etaMs,
            progressPct: activity.progressPct,
            flightHours: activity.flightHours,
            urgency: activity.urgency,
            phase: activity.phase,
            international:
              Boolean(originRegion && destRegion) &&
              !isDomesticOd(originRegion, destRegion),
          }
        : undefined;

    return {
      id: npc.id,
      name: npc.name,
      aircraftClassId: npc.aircraftClassId,
      aircraftLabel: npcAirframeLabel(npc),
      airframeTypeId: npc.airframeTypeId,
      homeRegion: npc.homeRegion,
      reliability: npc.reliability,
      aggressiveness: npc.aggressiveness,
      feeBias: npc.feeBias,
      status: npc.status,
      phase,
      busyUntilTick: npc.busyUntilTick,
      busyUntilMs: npc.busyUntilMs,
      turnaroundHoursLeft,
      restUntilTick: npc.restUntilTick,
      restUntilMs: npc.restUntilMs,
      restHoursLeft,
      mxUntilTick: npc.mxUntilTick,
      mxUntilMs: npc.mxUntilMs,
      mxHoursLeft,
      locationIcao: npc.locationIcao,
      hoursSinceMx: npc.hoursSinceMx,
      dutyHoursAccum: npc.dutyHoursAccum,
      mission,
    };
  });

  const phaseOrder = {
    arriving: 0,
    enroute: 1,
    turnaround: 2,
    maintenance: 3,
    resting: 4,
    idle: 5,
  } as const;
  rows.sort((a, b) => {
    const d = phaseOrder[a.phase] - phaseOrder[b.phase];
    if (d !== 0) return d;
    const ae =
      a.mission?.etaHours ??
      a.turnaroundHoursLeft ??
      a.mxHoursLeft ??
      a.restHoursLeft ??
      99;
    const be =
      b.mission?.etaHours ??
      b.turnaroundHoursLeft ??
      b.mxHoursLeft ??
      b.restHoursLeft ??
      99;
    return ae - be;
  });
  return rows;
}

export function npcClaimForLot(
  world: CareerEconomyWorld,
  lotId: string,
  nowMs = Date.now(),
):
  | {
      npcId: string;
      npcName: string;
      cargoKg: number;
      etaHours: number;
      etaMs: number;
      arrivesAtMs: number;
      crewNeeded?: boolean;
      /** Empty deadhead toward home region. */
      crewReposition?: boolean;
      /** Max crew fee (full offer / best lift). Actual fee scales with chosen airframe lift. */
      pilotFeeUsd?: number;
      /** Min crew fee among flyable homologated airframes in class. */
      pilotFeeMinUsd?: number;
      awaitingPilotUntilMs?: number;
      airframeTypeId?: string;
      aircraftLabel?: string;
      aircraftClassId?: string;
    }
  | undefined {
  const flight = findActiveFlightForLot(world, lotId);
  if (!flight) return undefined;
  const npc = world.npcs.find((n) => n.id === flight.npcId);
  if (flight.status === 'awaiting_pilot') {
    const until = flight.awaitingPilotUntilMs ?? flight.arrivesAtMs;
    const etaMs = Math.max(0, until - nowMs);
    const distanceNm =
      routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? undefined;
    const isRepo = isNpcRepositionFlight(flight);
    const flyable = contractPilotHasFlyableAirframe(flight, { distanceNm });
    // Unflyable holds (ops cargo 0) stay reserved but must not show Fly.
    if (!flyable) {
      return {
        npcId: flight.npcId,
        npcName: npc?.name ?? flight.npcId,
        cargoKg: flight.cargoKg,
        etaHours: msToHours(etaMs),
        etaMs,
        arrivesAtMs: until,
        airframeTypeId: npc?.airframeTypeId,
        aircraftLabel: npc ? npcAirframeLabel(npc) : undefined,
        aircraftClassId: flight.aircraftClassId,
      };
    }
    const feeRange = contractPilotFeeRangeUsd(flight, { distanceNm });
    return {
      npcId: flight.npcId,
      npcName: npc?.name ?? flight.npcId,
      cargoKg: flight.cargoKg,
      etaHours: msToHours(etaMs),
      etaMs,
      arrivesAtMs: until,
      crewNeeded: true,
      ...(isRepo ? { crewReposition: true } : {}),
      pilotFeeUsd: feeRange.maxUsd,
      pilotFeeMinUsd: feeRange.minUsd,
      awaitingPilotUntilMs: until,
      airframeTypeId: npc?.airframeTypeId,
      aircraftLabel: npc ? npcAirframeLabel(npc) : undefined,
      aircraftClassId: flight.aircraftClassId,
    };
  }
  const arrives = flightArrivesAtMs(flight);
  const etaMs = Math.max(0, arrives - nowMs);
  return {
    npcId: flight.npcId,
    npcName: npc?.name ?? flight.npcId,
    cargoKg: flight.cargoKg,
    etaHours: msToHours(etaMs),
    etaMs,
    arrivesAtMs: arrives,
    airframeTypeId: npc?.airframeTypeId,
    aircraftLabel: npc ? npcAirframeLabel(npc) : undefined,
    aircraftClassId: flight.aircraftClassId,
  };
}
