/**
 * Base Dispatcher scout — suggest Market freights viable for the player's fleet.
 * Human confirms → acceptMission. No auto-claim, no NPC fly, no multi-leg (yet).
 *
 * Without a hired Dispatcher: manual desk (parked @ origin only, max 3).
 * With Dispatcher: fleet scout (any parked airframe + ferry-aware score).
 */

import { routeDistanceNm } from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import {
  resolveBaseDispatchScoutPolicy,
  type BaseDispatchScoutPolicy,
} from './career-base-dispatcher.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { ensurePlayerFbos } from './career-fbo.js';
import { fboServiceCostMult } from './career-fbo-perks.js';
import {
  estimateBoardLotEconomics,
  getAircraftClass,
} from './career-mission.js';
import { npcClaimForLot } from './career-npc.js';
import { executeAcceptLot } from './career-persist-commands.js';
import {
  findCareerPlayerAirframe,
  resolveAirframeMaxRangeNm,
  resolveAirframePerfForUi,
} from './career-player-airframes.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  FreighterClassId,
  MissionIntent,
  PlayerAircraft,
  ShipmentLot,
} from './types/career-economy.js';

/** Cap suggestions returned to the UI (hard ceiling). */
export const BASE_DISPATCH_SCOUT_MAX = 12;

/** Manual desk cap when no Dispatcher hired. */
export const BASE_DISPATCH_SCOUT_MANUAL_MAX = 3;

/** Ignore scraps below this kg on the desk. */
export const BASE_DISPATCH_SCOUT_MIN_KG = 180;

/** Soft nm floors by class (desk default — caller may override). */
export const BASE_DISPATCH_SCOUT_MIN_NM: Readonly<
  Partial<Record<FreighterClassId, number>>
> = {
  light_ga: 40,
  light_turboprop: 200,
  light_jet: 400,
  medium_piston: 400,
  narrow_freighter: 500,
  wide_freighter: 800,
};

export type BaseDispatchScoutSuggestion = {
  id: string;
  lotId: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  quantityKg: number;
  availableKg: number;
  liftKg: number;
  distanceNm: number;
  ferryNm: number;
  payUsd: number;
  fuelCostUsd: number;
  netUsd: number;
  aircraftId: string;
  aircraftClassId: FreighterClassId;
  airframeTypeId?: string;
  aircraftLocationIcao?: string;
  lastMile: boolean;
  reason: string;
  score: number;
};

export type { BaseDispatchScoutPolicy };

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLastMileLot(lot: Pick<ShipmentLot, 'reason'>): boolean {
  return /last-mile/i.test(lot.reason ?? '');
}

function lotDistanceNm(
  world: CareerEconomyWorld,
  lot: ShipmentLot,
): number {
  return (
    hubDistanceNm(lot.originIcao, lot.destIcao) ??
    routeDistanceNm(world, lot.originIcao, lot.destIcao) ??
    0
  );
}

function ferryDistanceNm(
  world: CareerEconomyWorld,
  fromIcao: string,
  toIcao: string,
): number {
  const a = fromIcao.trim().toUpperCase();
  const b = toIcao.trim().toUpperCase();
  if (!a || !b || a === b) return 0;
  return hubDistanceNm(a, b) ?? routeDistanceNm(world, a, b) ?? 0;
}

function lotAvailableKg(lot: ShipmentLot): number {
  return Math.max(0, Math.floor(lot.quantityKg - (lot.reservedKg ?? 0)));
}

function buildAirportRegionMap(
  world: CareerEconomyWorld,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ap of world.airports ?? []) {
    const icao = ap.icao.trim().toUpperCase();
    const region = typeof ap.region === 'string' ? ap.region.trim() : '';
    if (icao && region) map.set(icao, region);
  }
  return map;
}

function buildCrewNeededLotIds(world: CareerEconomyWorld): Set<string> {
  const ids = new Set<string>();
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'awaiting_pilot' || !flight.lotId) continue;
    const claim = npcClaimForLot(world, flight.lotId);
    if (claim?.crewNeeded === true) ids.add(flight.lotId);
  }
  return ids;
}

function airportRegionOf(
  world: CareerEconomyWorld,
  icao: string,
  regionByIcao?: Map<string, string>,
): string | null {
  const key = icao.trim().toUpperCase();
  if (!key) return null;
  if (regionByIcao) return regionByIcao.get(key) ?? null;
  const ap = world.airports?.find((a) => a.icao.toUpperCase() === key);
  const region = typeof ap?.region === 'string' ? ap.region.trim() : '';
  return region || null;
}

function assertOwnsBase(state: CareerMissionsState): void {
  const fbos = ensurePlayerFbos(state).fbos;
  if (fbos.length === 0) {
    throw new Error(
      'Dispatcher desk needs a company Base — buy your home Base first (first Base is free)',
    );
  }
}

function defaultExcludeLastMile(cls: FreighterClassId): boolean {
  return cls !== 'light_ga';
}

function defaultMinNm(cls: FreighterClassId): number {
  return BASE_DISPATCH_SCOUT_MIN_NM[cls] ?? 200;
}

function scoutableFleet(
  state: CareerMissionsState,
  opts: { aircraftId?: string },
): PlayerAircraft[] {
  return (state.fleet ?? []).filter((a) => {
    // Parked only — excludes airborne / leased_out / in_mission.
    if (a.status !== 'parked') return false;
    if (opts.aircraftId && a.id !== opts.aircraftId) return false;
    return true;
  });
}

/**
 * Rank open Market lots the parked fleet can fly at positive estimated net.
 * Policy depends on hired Base Dispatcher (fleet vs manual).
 */
export function listBaseDispatchScoutSuggestions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    max?: number;
    aircraftId?: string;
    minNm?: number;
    minKg?: number;
    excludeLastMile?: boolean;
    requireNetPositive?: boolean;
    /**
     * Base hub for the desk — when set (default desk), only lots whose
     * origin shares this hub's economy region (e.g. BR-S for SBKP).
     */
    hubIcao?: string;
    /** Default true when hubIcao is set. */
    sameRegionOnly?: boolean;
  } = {},
): BaseDispatchScoutSuggestion[] {
  assertOwnsBase(state);
  const policy = resolveBaseDispatchScoutPolicy(state);
  const max = Math.max(
    1,
    Math.min(BASE_DISPATCH_SCOUT_MAX, opts.max ?? policy.max),
  );
  const requireNet = opts.requireNetPositive !== false;
  const minKg = Math.max(0, opts.minKg ?? BASE_DISPATCH_SCOUT_MIN_KG);

  const deskHub =
    typeof opts.hubIcao === 'string' ? opts.hubIcao.trim().toUpperCase() : '';
  const sameRegionOnly =
    opts.sameRegionOnly ?? (deskHub.length > 0);
  const regionByIcao = buildAirportRegionMap(world);
  const deskRegion = deskHub ? airportRegionOf(world, deskHub, regionByIcao) : null;
  const blockedLotIds = buildCrewNeededLotIds(world);

  const fleet = scoutableFleet(state, { aircraftId: opts.aircraftId });
  if (fleet.length === 0) {
    return [];
  }

  const out: BaseDispatchScoutSuggestion[] = [];

  for (const acf of fleet) {
    const cls = acf.aircraftClassId as FreighterClassId;
    const excludeLastMile =
      opts.excludeLastMile ?? defaultExcludeLastMile(cls);
    const minNm = opts.minNm ?? defaultMinNm(cls);
    const catalog = findCareerPlayerAirframe(acf.airframeTypeId);
    const classDef = getAircraftClass(cls);
    const perf = resolveAirframePerfForUi(acf.airframeTypeId, cls, {
      maxCargoKg: classDef.maxCargoKg,
      maxRangeNm: classDef.maxRangeNm,
    });
    const maxRangeNm = resolveAirframeMaxRangeNm(acf.airframeTypeId, cls);
    const acfLoc = (acf.locationIcao ?? '').trim().toUpperCase();
    const costMult = fboServiceCostMult(state, acfLoc || 'ZZZZ');
    const weights = {
      oewKg: catalog?.oewKg,
      mtowKg: catalog?.mtowKg,
      fuelCapacityKg: catalog?.fuelCapacityKg,
      fuelBurnKgPerNm: catalog?.fuelBurnKgPerNm,
      airframeTypeId: acf.airframeTypeId,
    };

    for (const lot of world.lots ?? []) {
      if (lot.status !== 'available') continue;
      if (blockedLotIds.has(lot.id)) continue;
      if (!cargoOpsIsUnlocked(state.cargoOps, lot.commodityId)) continue;
      const avail = lotAvailableKg(lot);
      if (avail < minKg) continue;
      const lastMile = isLastMileLot(lot);
      if (excludeLastMile && lastMile) continue;

      const origin = lot.originIcao.trim().toUpperCase();
      if (sameRegionOnly && deskRegion) {
        const originRegion = airportRegionOf(world, origin, regionByIcao);
        if (!originRegion || originRegion !== deskRegion) continue;
      }

      const ferryNm = ferryDistanceNm(world, acfLoc, origin);
      if (policy.requireAtOrigin && ferryNm > 0.5) continue;

      const nm = lotDistanceNm(world, lot);
      if (!Number.isFinite(nm) || nm < minNm) continue;

      const econ = estimateBoardLotEconomics(world, {
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
        distanceNm: nm,
        availableKg: avail,
        quantityKg: lot.quantityKg,
        lotPayUsd: lot.payUsd,
        aircraftClassId: cls,
        structuralMaxCargoKg: perf.maxCargoKg,
        maxRangeNm,
        costMult,
        weights,
      });
      if (!econ || !econ.inRange || !econ.fuelFeasible) continue;
      if (econ.liftKg < minKg) continue;
      if (requireNet && econ.netUsd <= 0) continue;

      const ferryPenalty = money(ferryNm * policy.ferryPenaltyUsdPerNm);
      const score = money(
        econ.netUsd - ferryPenalty - Math.max(0, nm - minNm) * 0.02,
      );
      const reasonParts = [
        `${Math.round(econ.liftKg)} kg`,
        `net $${Math.round(econ.netUsd)}`,
        lastMile ? 'last-mile' : 'feeder/trunk',
      ];
      if (ferryNm > 0.5) {
        reasonParts.push(`ferry ${Math.round(ferryNm)} nm from ${acfLoc}`);
      } else if (acfLoc) {
        reasonParts.push(`@ ${acfLoc}`);
      }
      if (deskRegion) {
        reasonParts.push(deskRegion);
      }
      out.push({
        id: `${lot.id}|${acf.id}`,
        lotId: lot.id,
        originIcao: origin,
        destIcao: lot.destIcao.trim().toUpperCase(),
        commodityId: lot.commodityId,
        quantityKg: lot.quantityKg,
        availableKg: avail,
        liftKg: econ.liftKg,
        distanceNm: Math.round(nm * 10) / 10,
        ferryNm: Math.round(ferryNm * 10) / 10,
        payUsd: econ.payUsd,
        fuelCostUsd: econ.fuelCostUsd,
        netUsd: econ.netUsd,
        aircraftId: acf.id,
        aircraftClassId: cls,
        airframeTypeId: acf.airframeTypeId,
        aircraftLocationIcao: acfLoc || undefined,
        lastMile,
        reason: reasonParts.join(' · '),
        score,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || b.netUsd - a.netUsd);
  return out.slice(0, max);
}

/**
 * Confirm a scout row → acceptMission (same path as Freights Accept).
 * Accept still needs a parked aircraft (you ferry separately if needed).
 */
export function confirmBaseDispatchScout(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    lotId: string;
    aircraftId: string;
    kg?: number;
    hubIcao?: string;
  },
): {
  mission: MissionIntent;
  suggestion: BaseDispatchScoutSuggestion | null;
  kg: number;
} {
  assertOwnsBase(state);
  const suggestions = listBaseDispatchScoutSuggestions(state, world, {
    aircraftId: opts.aircraftId,
    max: BASE_DISPATCH_SCOUT_MAX,
    requireNetPositive: false,
    excludeLastMile: false,
    minNm: 0,
    minKg: 1,
    // Confirm must still resolve the row even if region lens is off.
    hubIcao: opts.hubIcao,
    sameRegionOnly: false,
  });
  const match =
    suggestions.find(
      (s) => s.lotId === opts.lotId && s.aircraftId === opts.aircraftId,
    ) ?? null;

  const acf = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!acf || acf.status !== 'parked') {
    throw new Error('Parked aircraft required for Dispatcher accept');
  }

  const executed = executeAcceptLot(world, state, {
    lotId: opts.lotId,
    cargoKg: opts.kg ?? match?.liftKg,
    aircraftClassId: acf.aircraftClassId as FreighterClassId,
    maxCargoKg: resolveAirframePerfForUi(
      acf.airframeTypeId,
      acf.aircraftClassId,
    ).maxCargoKg,
    cargoOps: state.cargoOps,
    classOps: state.classOps,
  });
  if (executed.kind === 'missing_lot' || executed.kind === 'missing_mission') {
    throw new Error(`Lot ${opts.lotId} not available`);
  }

  return {
    mission: executed.mission,
    suggestion: match,
    kg: executed.mission.cargoKg,
  };
}
