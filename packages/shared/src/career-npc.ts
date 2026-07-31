/**
 * Phase 2 — limited NPC freighter fleet competing for market lots.
 * Same capacity/range rules as the player; no wallet credit on settle.
 * Flight timing is wall-clock (ms); hourly batches only decide new bids.
 */

import {
  applyFreightDelivery,
  getCommodity,
  routeDistanceNm,
} from './career-economy.js';
import { applyNpcFuelUplift } from './career-fuel.js';
import { getAircraftClass, reserveShipmentLot } from './career-mission.js';
import type {
  CareerEconomyWorld,
  FreighterClassId,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  ShipmentLot,
} from './types/career-economy.js';

export const NPC_FLEET_SIZE = 10;
/** Must match career-economy MS_PER_TICK (1 tick = 1 real hour). */
const MS_PER_TICK = 3_600_000;
const MIN_BLOCK_HOURS = 2;
const TURNAROUND_HOURS = 1;
/** Treat as arriving when within the last hour of the flight. */
const ARRIVING_WINDOW_MS = MS_PER_TICK;
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

/** Block hours in air (cargo ETA); busy time adds turnaround after arrival. */
export function estimateNpcBlockHours(
  distanceNm: number,
  aircraftClassId: FreighterClassId,
): { flightHours: number; busyHours: number } {
  const cruise = CRUISE_KT[aircraftClassId] ?? 430;
  const flightHours = Math.max(MIN_BLOCK_HOURS, Math.ceil(distanceNm / cruise));
  return { flightHours, busyHours: flightHours + TURNAROUND_HOURS };
}

export function seedNpcFleet(opts: {
  seed: string;
  regions: string[];
}): NpcFreighter[] {
  const rng = mulberry32(hashSeed(`${opts.seed}:npc-fleet`));
  const regions =
    opts.regions.length > 0 ? [...new Set(opts.regions)] : ['BR-SE', 'BR-S', 'BR-NE'];
  const names = [...NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = names[i]!;
    names[i] = names[j]!;
    names[j] = tmp;
  }

  const fleet: NpcFreighter[] = [];
  for (let i = 0; i < NPC_FLEET_SIZE; i++) {
    const aircraftClassId: FreighterClassId =
      i < 6 ? 'narrow_freighter' : 'wide_freighter';
    fleet.push({
      id: `npc-${i + 1}`,
      name: names[i % names.length]!,
      aircraftClassId,
      homeRegion: regions[i % regions.length]!,
      reliability: 0.45 + rng() * 0.5,
      aggressiveness: 0.2 + rng() * 0.7,
      feeBias: 0.75 + rng() * 0.55,
      status: 'idle',
    });
  }
  return fleet;
}

/** Ensure save has a fleet; seeds when missing / empty. */
export function ensureNpcFleet(world: CareerEconomyWorld): void {
  if (!Array.isArray(world.npcFlights)) {
    world.npcFlights = [];
  }
  if (Array.isArray(world.npcs) && world.npcs.length > 0) {
    return;
  }
  const regions = world.airports.map((a) => a.region);
  world.npcs = seedNpcFleet({ seed: world.seed, regions });
  world.npcFlights = world.npcFlights ?? [];
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
    if (npc.currentFlightId === flight.id) {
      npc.currentFlightId = undefined;
    }
    if (npcBusyUntilMs(npc) <= nowMs) {
      npc.status = 'idle';
      npc.busyUntilTick = undefined;
      npc.busyUntilMs = undefined;
    }
  }
}

function releaseTurnaroundIfDue(world: CareerEconomyWorld, nowMs: number): void {
  for (const npc of world.npcs) {
    if (npc.currentFlightId) continue;
    if (npc.status !== 'busy') continue;
    if (npcBusyUntilMs(npc) > nowMs) continue;
    npc.status = 'idle';
    npc.busyUntilTick = undefined;
    npc.busyUntilMs = undefined;
  }
}

/**
 * Settle NPC flights whose arrivesAtMs <= nowMs and free turnarounds.
 * Idempotent — safe to call on every load / poll.
 */
export function settleNpcOpsDue(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): { settledFlights: number } {
  ensureNpcFleet(world);
  let settledFlights = 0;

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
): NpcFlight | undefined {
  const aircraft = getAircraftClass(npc.aircraftClassId);
  const avail = lotAvailableKg(lot);
  const cargoKg = Math.min(avail, aircraft.maxCargoKg);
  if (cargoKg <= 0) return undefined;

  const dist = routeDistanceNm(world, lot.originIcao, lot.destIcao) ?? 0;
  const { flightHours, busyHours } = estimateNpcBlockHours(dist, npc.aircraftClassId);

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
    arrivesAtTick: world.tick + flightHours,
    departedAtMs: batchNowMs,
    arrivesAtMs: batchNowMs + flightHours * MS_PER_TICK,
    status: 'in_flight',
    fuelUpliftKg: fuel.deliveredKg,
    fuelCostUsd: fuel.costUsd,
    fuelScarcity: fuel.scarcity,
  };

  npc.status = 'busy';
  npc.busyUntilTick = world.tick + busyHours;
  npc.busyUntilMs = batchNowMs + busyHours * MS_PER_TICK;
  npc.currentFlightId = flight.id;
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
    if (n.status === 'busy' && npcBusyUntilMs(n) > batchNowMs) return false;
    n.status = 'idle';
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
    const bidChance = 0.22 + npc.aggressiveness * 0.55;
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
    const flight = claimLotForNpc(world, npc, best.lot, batchNowMs);
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
    if (flight && activity) {
      phase = activity.phase;
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
      mission,
    };
  });

  const phaseOrder = { arriving: 0, enroute: 1, turnaround: 2, idle: 3 } as const;
  rows.sort((a, b) => {
    const d = phaseOrder[a.phase] - phaseOrder[b.phase];
    if (d !== 0) return d;
    const ae = a.mission?.etaHours ?? a.turnaroundHoursLeft ?? 99;
    const be = b.mission?.etaHours ?? b.turnaroundHoursLeft ?? 99;
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
