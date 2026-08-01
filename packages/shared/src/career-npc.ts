/**
 * Phase 2 — limited NPC freighter fleet competing for market lots.
 * Same capacity/range rules as the player; no wallet credit on settle.
 * Flight timing is wall-clock (ms); hourly batches only decide new bids.
 */

import {
  applyFreightDelivery,
  ensureAirportMroInventory,
  getCommodity,
  routeDistanceNm,
} from './career-economy.js';
import { applyNpcFuelUplift } from './career-fuel.js';
import {
  hubLevelNpcBidMult,
  regionAverageHubLevel,
} from './career-hub-level.js';
import { getAircraftClass, reserveShipmentLot } from './career-mission.js';
import {
  regionalWeatherBidMult,
  regionalWeatherIndex,
  type RegionalWeather,
} from './career-weather.js';
import type {
  CareerEconomyWorld,
  CommodityId,
  FreighterClassId,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  ShipmentLot,
} from './types/career-economy.js';

/** About four operators per mapped region; enough capacity for a 52-hub world. */
export const NPC_FLEET_SIZE = 44;

/** Target mix: jets for heavy freight + GA for LTL / short-haul competition. */
export const NPC_FLEET_COMPOSITION: ReadonlyArray<{
  aircraftClassId: FreighterClassId;
  count: number;
}> = [
  { aircraftClassId: 'narrow_freighter', count: 16 },
  { aircraftClassId: 'wide_freighter', count: 10 },
  { aircraftClassId: 'light_turboprop', count: 10 },
  { aircraftClassId: 'light_ga', count: 8 },
] as const;

/** Must match career-economy MS_PER_TICK (1 tick = 1 real hour). */
const MS_PER_TICK = 3_600_000;
/** Minimum airborne block so ultra-short hops aren't instant. */
const MIN_BLOCK_HOURS = 1;
const TURNAROUND_HOURS = 1;

/**
 * Abstract shop interval (block hours) — aligned with player inspection gates,
 * slightly stretched so the board isn't permanently half-MX.
 */
export const NPC_MX_INTERVAL_HOURS: Record<FreighterClassId, number> = {
  light_ga: 90,
  light_turboprop: 110,
  narrow_freighter: 180,
  wide_freighter: 220,
};

/** Ground shop dwell once MX is due. */
export const NPC_MX_SHOP_HOURS: Record<FreighterClassId, number> = {
  light_ga: 2,
  light_turboprop: 2.5,
  narrow_freighter: 4,
  wide_freighter: 5.5,
};

/** Parts drawn from terminal MRO stock per shop visit (not freight). */
export const NPC_MX_PARTS_KG: Record<FreighterClassId, number> = {
  light_ga: 40,
  light_turboprop: 60,
  narrow_freighter: 200,
  wide_freighter: 400,
};
/** Spread departures inside the same economy hour (wall-clock ms). */
const DEPART_STAGGER_MS = 25 * 60 * 1000;
/** Treat as arriving when within the last hour of the flight. */
const ARRIVING_WINDOW_MS = MS_PER_TICK;
/** Max flight+turnaround duty before mandatory crew rest. */
const MAX_DUTY_HOURS = 9;
/** A single long leg also forces rest after its turnaround. */
const LONG_LEG_DUTY_HOURS = 6;
const MIN_REST_HOURS = 12;
const MAX_REST_HOURS = 16;
const CRUISE_KT: Record<FreighterClassId, number> = {
  narrow_freighter: 430,
  wide_freighter: 480,
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

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lotAvailableKg(lot: ShipmentLot): number {
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function airportRegion(world: CareerEconomyWorld, icao: string): string | undefined {
  return world.airports.find((a) => a.icao === icao.toUpperCase())?.region;
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

/** True when the NPC could enter the bid pool at nowMs (idle / rest or turnaround done). */
function isNpcReadyToBid(npc: NpcFreighter, nowMs: number): boolean {
  if (npc.currentFlightId) return false;
  if (npc.status === 'maintenance' && npcMxUntilMs(npc) > nowMs) return false;
  if (npc.status === 'resting' && npcRestUntilMs(npc) > nowMs) return false;
  if (npc.status === 'busy' && npcBusyUntilMs(npc) > nowMs) return false;
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
    if (isNpcReadyToBid(npc, nowMs)) ready += 1;
  }
  return ready / home.length;
}

/** Wide-freighter-ish full load — saturation 1.0 at this airborne kg on a lane. */
const LANE_SATURATION_KG = 28_000;

/**
 * kg currently in_flight on a specific origin→dest lane for a commodity.
 * Pass originIcao null/undefined to sum all inbound to dest (soft fill shadow).
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
  return (
    npcLaneAirborneKg(world, originIcao, destIcao, commodityId) +
    playerLaneInboundKg(world, originIcao, destIcao, commodityId)
  );
}

/** 0..1 lane saturation; 1 ≈ ≥28t inbound (NPC + player) on that OD+commodity. */
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
export const THIN_FLEET_CAPACITY = 0.45;
/** Saturation at/above this → UI "lane busy" chip (matches scarce-pay threshold). */
export const LANE_BUSY_SATURATION = 0.35;

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
  ready: number;
  total: number;
  resting: number;
  /** Abstract shop visits (MRO) — also off the bid pool. */
  maintenance: number;
  weather: RegionalWeather;
};

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
  const regions = [...new Set((world.npcs ?? []).map((n) => n.homeRegion))].sort();
  return regions.map((region) => {
    const home = world.npcs.filter((n) => n.homeRegion === region);
    let ready = 0;
    let resting = 0;
    let maintenance = 0;
    for (const npc of home) {
      if (npc.status === 'resting' && npcRestUntilMs(npc) > nowMs) resting += 1;
      if (npc.status === 'maintenance' && npcMxUntilMs(npc) > nowMs) maintenance += 1;
      if (isNpcReadyToBid(npc, nowMs)) ready += 1;
    }
    const capacity = home.length === 0 ? 1 : ready / home.length;
    return {
      region,
      capacity,
      thinFleet: capacity < THIN_FLEET_CAPACITY,
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
  npc.restUntilMs = nowMs + restHours * MS_PER_TICK;
  npc.restUntilTick = world.tick + Math.max(1, Math.ceil(restHours));
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
    if (known) return known.icao;
  }
  const home = world.airports.find((a) => a.region === npc.homeRegion);
  if (home) return home.icao;
  return world.airports[0]?.icao ?? 'SBGR';
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
  npc.mxUntilMs = nowMs + shopHours * MS_PER_TICK;
  npc.mxUntilTick = world.tick + Math.max(1, Math.ceil(shopHours));
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
    if (npcMxUntilMs(npc) > nowMs) continue;
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
    if (npcRestUntilMs(npc) > nowMs) continue;
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

export function seedNpcFleet(opts: {
  seed: string;
  regions: string[];
}): NpcFreighter[] {
  const rng = mulberry32(hashSeed(`${opts.seed}:npc-fleet`));
  const regions =
    opts.regions.length > 0
      ? [...new Set(opts.regions)]
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const names = [...NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = names[i]!;
    names[i] = names[j]!;
    names[j] = tmp;
  }

  const classOrder: FreighterClassId[] = [];
  for (const slot of NPC_FLEET_COMPOSITION) {
    for (let n = 0; n < slot.count; n++) {
      classOrder.push(slot.aircraftClassId);
    }
  }

  const fleet: NpcFreighter[] = [];
  for (let i = 0; i < classOrder.length; i++) {
    fleet.push(
      makeNpcFreighter({
        id: `npc-${i + 1}`,
        name: names[i % names.length]!,
        aircraftClassId: classOrder[i]!,
        homeRegion: regions[i % regions.length]!,
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
  return {
    id: opts.id,
    name: opts.name,
    aircraftClassId: opts.aircraftClassId,
    homeRegion: opts.homeRegion,
    reliability: 0.45 + opts.rng() * 0.5,
    aggressiveness: 0.2 + opts.rng() * 0.7,
    feeBias: 0.75 + opts.rng() * 0.55,
    status: 'idle',
    // Desync shop calendars so the fleet does not all hit MX together.
    hoursSinceMx: Math.round(opts.rng() * interval * 0.55),
  };
}

/** Ensure save has a fleet; seeds when missing / empty; tops up GA slots on older saves. */
export function ensureNpcFleet(world: CareerEconomyWorld): void {
  if (!Array.isArray(world.npcFlights)) {
    world.npcFlights = [];
  }
  const regions = world.airports.map((a) => a.region);
  if (!Array.isArray(world.npcs) || world.npcs.length === 0) {
    world.npcs = seedNpcFleet({ seed: world.seed, regions });
    world.npcFlights = world.npcFlights ?? [];
    return;
  }
  topUpNpcFleetComposition(world, regions);
  ensureNpcRegionCoverage(world, regions);
  backfillNpcDutyFromFlights(world);
  desyncClusteredTurnarounds(world);
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
 * Older worlds only had Narrow/Wide. Append missing light_turboprop / light_ga
 * NPCs without resetting jet operators already in flight.
 */
export function topUpNpcFleetComposition(
  world: CareerEconomyWorld,
  regions: string[],
): void {
  const regionList =
    regions.length > 0
      ? [...new Set(regions)]
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const rng = mulberry32(hashSeed(`${world.seed}:npc-fleet-topup`));
  const usedNames = new Set(world.npcs.map((n) => n.name));
  let nextIndex = world.npcs.reduce((max, n) => {
    const m = /^npc-(\d+)$/.exec(n.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  for (const slot of NPC_FLEET_COMPOSITION) {
    const have = world.npcs.filter((n) => n.aircraftClassId === slot.aircraftClassId)
      .length;
    const missing = Math.max(0, slot.count - have);
    for (let i = 0; i < missing; i++) {
      nextIndex += 1;
      const name =
        NPC_NAME_POOL.find((n) => !usedNames.has(n)) ??
        `${slot.aircraftClassId}-${nextIndex}`;
      usedNames.add(name);
      world.npcs.push(
        makeNpcFreighter({
          id: `npc-${nextIndex}`,
          name,
          aircraftClassId: slot.aircraftClassId,
          homeRegion: regionList[(nextIndex - 1) % regionList.length]!,
          rng,
        }),
      );
    }
  }
}

/**
 * Legacy claims used whole-hour blocks, so several NPCs often share one busyUntilMs.
 * Spread turnaround-only peers so the board doesn't show identical "free in Xm".
 */
function desyncClusteredTurnarounds(world: CareerEconomyWorld): void {
  const BUCKET_MS = 5 * 60 * 1000;
  const groups = new Map<number, NpcFreighter[]>();
  for (const npc of world.npcs) {
    if (npc.currentFlightId) continue;
    if (npc.status !== 'busy') continue;
    const until = npcBusyUntilMs(npc);
    if (until <= 0) continue;
    const key = Math.floor(until / BUCKET_MS);
    const bucket = groups.get(key) ?? [];
    bucket.push(npc);
    groups.set(key, bucket);
  }
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Anchor to the group's median busy time, then fan out.
    const sorted = group
      .map((n) => npcBusyUntilMs(n))
      .sort((a, b) => a - b);
    const anchor = sorted[Math.floor(sorted.length / 2)]!;
    for (let i = 0; i < group.length; i++) {
      const npc = group[i]!;
      const rng = mulberry32(hashSeed(`${world.seed}:${npc.id}:turnaround-desync`));
      const skewMs =
        Math.floor((rng() - 0.5) * 40 * 60 * 1000) + i * 4 * 60 * 1000;
      npc.busyUntilMs = anchor + skewMs;
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
        (flightArrivesAtMs(flight) - flightDepartedAtMs(flight)) / MS_PER_TICK,
      );
      const turnaroundHours = Math.max(
        0.4,
        (npcBusyUntilMs(npc) - flightArrivesAtMs(flight)) / MS_PER_TICK,
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
  return world.npcFlights.find((l) => l.lotId === lotId && l.status === 'in_flight');
}

function settleNpcFlight(world: CareerEconomyWorld, flight: NpcFlight, nowMs: number): void {
  if (flight.status === 'completed') {
    return;
  }
  const lot = findLot(world, flight.lotId);
  applyFreightDelivery(world, {
    commodityId: flight.commodityId,
    originIcao: flight.originIcao,
    destIcao: flight.destIcao,
    kg: flight.cargoKg,
  });

  if (lot) {
    const bookKg = flight.cargoKg;
    lot.reservedKg = Math.max(0, lot.reservedKg - bookKg);
    lot.quantityKg = Math.max(0, lot.quantityKg - bookKg);
    if (lot.quantityKg <= 0) {
      lot.quantityKg = 0;
      lot.reservedKg = 0;
      lot.status = 'delivered';
    } else if (lot.reservedKg <= 0) {
      lot.reservedKg = 0;
      lot.status = 'available';
    } else {
      lot.status = 'reserved';
    }
  }

  flight.status = 'completed';
  const npc = world.npcs.find((n) => n.id === flight.npcId);
  if (npc) {
    npc.locationIcao = flight.destIcao;
    const blockHours = Math.max(
      MIN_BLOCK_HOURS,
      (flightArrivesAtMs(flight) - flightDepartedAtMs(flight)) / MS_PER_TICK,
    );
    npc.hoursSinceMx = (npc.hoursSinceMx ?? 0) + blockHours;
    if (npc.currentFlightId === flight.id) {
      npc.currentFlightId = undefined;
    }
    if (npcBusyUntilMs(npc) <= nowMs) {
      finishTurnaround(world, npc, nowMs);
    }
  }
}

function releaseTurnaroundIfDue(world: CareerEconomyWorld, nowMs: number): void {
  for (const npc of world.npcs) {
    if (npc.currentFlightId) continue;
    if (npc.status !== 'busy') continue;
    if (npcBusyUntilMs(npc) > nowMs) continue;
    finishTurnaround(world, npc, nowMs);
  }
}

/**
 * Settle NPC flights whose arrivesAtMs <= nowMs and free turnarounds / rest.
 * Idempotent — safe to call on every load / poll.
 */
export function settleNpcOpsDue(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): { settledFlights: number } {
  ensureNpcFleet(world);
  let settledFlights = 0;

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

  world.npcFlights = world.npcFlights.filter((f) => f.status === 'in_flight');
  releaseTurnaroundIfDue(world, nowMs);
  releaseMxIfDue(world, nowMs);
  releaseRestIfDue(world, nowMs);
  return { settledFlights };
}

function scoreLotForNpc(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  lot: ShipmentLot,
  rng: () => number,
): number | null {
  const aircraft = getAircraftClass(npc.aircraftClassId);
  const avail = lotAvailableKg(lot);
  if (avail < 500) return null;

  const dist = routeDistanceNm(world, lot.originIcao, lot.destIcao);
  if (dist === undefined || dist > aircraft.maxRangeNm) return null;

  const commodity = getCommodity(lot.commodityId);
  const payPerKg = lot.payUsd / Math.max(1, lot.quantityKg);
  const minPay = commodity.basePricePerKg * 0.35 * npc.feeBias;
  if (payPerKg < minPay) return null;

  const cargoKg = Math.min(avail, aircraft.maxCargoKg);
  const fillRatio = cargoKg / aircraft.maxCargoKg;
  const payScore = Math.min(2.2, payPerKg / commodity.basePricePerKg);
  const urgencyScore =
    lot.urgency === 'urgent' ? 0.55 * npc.aggressiveness : 0.12 * npc.aggressiveness;
  const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
  const ticksLeft = Math.max(0, lot.expiresAtTick - world.tick);
  const expiryScore = (1 - ticksLeft / life) * (0.25 + 0.55 * npc.aggressiveness);
  const originRegion = airportRegion(world, lot.originIcao);
  const destRegion = airportRegion(world, lot.destIcao);
  const regionScore =
    originRegion === npc.homeRegion || destRegion === npc.homeRegion ? 0.4 : 0;
  const noise = (rng() - 0.5) * 0.22 * (1.05 - npc.reliability);

  return (
    fillRatio * 0.85 +
    payScore * 0.55 +
    urgencyScore +
    expiryScore +
    regionScore +
    noise
  );
}

function claimLotForNpc(
  world: CareerEconomyWorld,
  npc: NpcFreighter,
  lot: ShipmentLot,
  batchNowMs: number,
  rng: () => number,
): NpcFlight | undefined {
  const aircraft = getAircraftClass(npc.aircraftClassId);
  const avail = lotAvailableKg(lot);
  const cargoKg = Math.min(avail, aircraft.maxCargoKg);
  if (cargoKg <= 0) return undefined;

  const dist = routeDistanceNm(world, lot.originIcao, lot.destIcao) ?? 0;
  const { flightHours } = estimateNpcBlockHours(dist, npc.aircraftClassId);
  // Desync peers that claim in the same hourly batch.
  const turnaroundHours = TURNAROUND_HOURS * (0.55 + rng() * 0.9);
  const departSkewMs = Math.floor(rng() * DEPART_STAGGER_MS);
  const departedAtMs = batchNowMs + departSkewMs;
  const arrivesAtMs = departedAtMs + flightHours * MS_PER_TICK;
  const busyUntilMs = arrivesAtMs + turnaroundHours * MS_PER_TICK;
  const flightTickHours = Math.max(1, Math.ceil(flightHours));
  const busyTickHours = Math.max(
    flightTickHours + 1,
    Math.ceil(flightHours + turnaroundHours),
  );

  let reserved;
  try {
    reserved = reserveShipmentLot(world, lot.id, cargoKg);
  } catch {
    return undefined;
  }

  if (lot.reservedKg >= lot.quantityKg && lot.quantityKg > 0) {
    lot.status = 'in_transit';
  }

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
  world.npcFlights.push(flight);
  return flight;
}

function npcBidOnMarket(
  world: CareerEconomyWorld,
  rng: () => number,
  batchNowMs: number,
): void {
  const idle = world.npcs.filter((n) => {
    if (n.currentFlightId) return false;
    if (n.status === 'maintenance') {
      if (npcMxUntilMs(n) > batchNowMs) return false;
      finishShopMx(world, n, batchNowMs);
    }
    if (n.status === 'resting') {
      if (npcRestUntilMs(n) > batchNowMs) return false;
      clearCrewRest(n);
    }
    if (n.status === 'busy' && npcBusyUntilMs(n) > batchNowMs) return false;
    if (n.status === 'busy') {
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
    world.npcFlights.filter((f) => f.status === 'in_flight').map((f) => f.lotId),
  );

  for (const npc of idle) {
    const regionCapacity = npcRegionBidCapacity(world, npc.homeRegion, batchNowMs);
    const wx = regionalWeatherIndex(world, npc.homeRegion);
    const levelBid = hubLevelNpcBidMult(regionAverageHubLevel(world, npc.homeRegion));
    const bidChance =
      (0.22 + npc.aggressiveness * 0.55) *
      (0.45 + 0.55 * regionCapacity) *
      regionalWeatherBidMult(wx) *
      levelBid;
    if (rng() > bidChance) continue;
    if (rng() > 0.55 + npc.reliability * 0.45) continue;

    let best: { lot: ShipmentLot; score: number } | undefined;
    for (const lot of world.lots) {
      if (lot.status !== 'available' && lot.status !== 'reserved') continue;
      if (lotAvailableKg(lot) <= 0) continue;
      if (claimedLotIds.has(lot.id)) continue;

      const score = scoreLotForNpc(world, npc, lot, rng);
      if (score === null) continue;
      const threshold = 0.55 + npc.reliability * 0.28 - npc.aggressiveness * 0.22;
      if (score < threshold) continue;
      if (!best || score > best.score) {
        best = { lot, score };
      }
    }

    if (!best) continue;
    const flight = claimLotForNpc(world, npc, best.lot, batchNowMs, rng);
    if (flight) {
      claimedLotIds.add(best.lot.id);
    }
  }
}

/**
 * Hourly NPC bidding after lots form. Continuous settle is settleNpcOpsDue.
 */
export function tickNpcFreighters(
  world: CareerEconomyWorld,
  rng: () => number,
  opts: { batchNowMs?: number } = {},
): void {
  ensureNpcFleet(world);
  const batchNowMs = opts.batchNowMs ?? world.lastBatchAtMs ?? Date.now();
  settleNpcOpsDue(world, batchNowMs);
  npcBidOnMarket(world, rng, batchNowMs);
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
    const flightHours = durationMs / MS_PER_TICK;
    const flownMs = Math.min(durationMs, Math.max(0, nowMs - departed));
    const etaMs = Math.max(0, arrives - nowMs);
    const hoursRemaining = etaMs / MS_PER_TICK;
    const progressPct = Math.min(100, Math.round((flownMs / durationMs) * 100));
    const aircraft = getAircraftClass(flight.aircraftClassId);

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
      aircraftLabel: aircraft.name,
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
    const aircraft = getAircraftClass(npc.aircraftClassId);
    const flight = flightsByNpc.get(npc.id);
    const activity = flight ? activityByFlight.get(flight.id) : undefined;

    let phase: NpcFleetMemberView['phase'] = 'idle';
    let turnaroundHoursLeft: number | undefined;
    let restHoursLeft: number | undefined;
    let mxHoursLeft: number | undefined;
    if (flight && activity) {
      phase = activity.phase;
    } else if (npc.status === 'maintenance' && npcMxUntilMs(npc) > nowMs) {
      phase = 'maintenance';
      mxHoursLeft = Math.max(0, (npcMxUntilMs(npc) - nowMs) / MS_PER_TICK);
    } else if (npc.status === 'resting' && npcRestUntilMs(npc) > nowMs) {
      phase = 'resting';
      restHoursLeft = Math.max(0, (npcRestUntilMs(npc) - nowMs) / MS_PER_TICK);
    } else if (npc.status === 'busy' && npcBusyUntilMs(npc) > nowMs) {
      phase = 'turnaround';
      turnaroundHoursLeft = Math.max(0, (npcBusyUntilMs(npc) - nowMs) / MS_PER_TICK);
    }

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
          }
        : undefined;

    return {
      id: npc.id,
      name: npc.name,
      aircraftClassId: npc.aircraftClassId,
      aircraftLabel: aircraft.name,
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
    }
  | undefined {
  const flight = findActiveFlightForLot(world, lotId);
  if (!flight) return undefined;
  const npc = world.npcs.find((n) => n.id === flight.npcId);
  const arrives = flightArrivesAtMs(flight);
  const etaMs = Math.max(0, arrives - nowMs);
  return {
    npcId: flight.npcId,
    npcName: npc?.name ?? flight.npcId,
    cargoKg: flight.cargoKg,
    etaHours: etaMs / MS_PER_TICK,
    etaMs,
    arrivesAtMs: arrives,
  };
}
