/**
 * Base Dispatcher tour generator — chain Market lots into multi-leg suggestions.
 * Lots are real board freight (no soft-spawn). Accept commits leg 1 only.
 *
 * Perf: economics once per lot/aircraft; index by origin; ferry filter by
 * nearby origins only (board can be thousands of lots).
 */

import {
  BASE_DISPATCH_SCOUT_MIN_KG,
  BASE_DISPATCH_SCOUT_MIN_NM,
  confirmBaseDispatchScout,
  type BaseDispatchScoutSuggestion,
} from './career-base-dispatch-scout.js';
import {
  resolveBaseDispatchScoutPolicy,
} from './career-base-dispatcher.js';
import { routeDistanceNm } from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { ensurePlayerFbos } from './career-fbo.js';
import { fboServiceCostMult } from './career-fbo-perks.js';
import {
  estimateBoardLotEconomics,
  getAircraftClass,
} from './career-mission.js';
import { npcClaimForLot } from './career-npc.js';
import {
  findCareerPlayerAirframe,
  resolveAirframeMaxRangeNm,
  resolveAirframePerfForUi,
} from './career-player-airframes.js';
import type {
  ActiveTour,
  ActiveTourLeg,
  ActiveTourLegStatus,
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  FreighterClassId,
  MissionIntent,
  PlayerAircraft,
  ShipmentLot,
} from './types/career-economy.js';
import { assignAircraftToMission } from './career-fleet.js';

/** Max tours returned to the desk table. */
export const BASE_DISPATCH_TOUR_MAX = 8;

/** Soft cap on legs (UI 2–4). */
export const BASE_DISPATCH_TOUR_LEGS_MAX = 4;

/** Allow a short reposition between chained lots (Search default / UI floor). */
export const BASE_DISPATCH_TOUR_CHAIN_FERRY_MAX_NM = 200;

/** Hard ceiling for the Max ferry filter (keeps Search tractable). */
export const BASE_DISPATCH_TOUR_CHAIN_FERRY_CAP_NM = 800;

/**
 * Tour floors are softer than single-leg Scout — multi-leg chains need
 * shorter regional hops (Scout light_jet 400 nm almost never chains in BR-SE).
 */
export const BASE_DISPATCH_TOUR_MIN_NM: Readonly<
  Partial<Record<FreighterClassId, number>>
> = {
  light_ga: 40,
  light_turboprop: 80,
  light_jet: 120,
  medium_piston: 120,
  narrow_freighter: 200,
  wide_freighter: 300,
};

export type BaseDispatchTourReturnMode =
  | 'none'
  | 'origin'
  | 'base';

export type BaseDispatchTourLeg = {
  lotId: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  liftKg: number;
  distanceNm: number;
  /** Ferry from previous dest (or aircraft) to this origin. */
  ferryNm: number;
  payUsd: number;
  fuelCostUsd: number;
  netUsd: number;
  lastMile: boolean;
};

export type BaseDispatchTour = {
  id: string;
  aircraftId: string;
  aircraftClassId: FreighterClassId;
  airframeTypeId?: string;
  aircraftLocationIcao?: string;
  legs: BaseDispatchTourLeg[];
  /** e.g. SBKP→SBGR→SBSP */
  routeLabel: string;
  legCount: number;
  totalDistanceNm: number;
  totalFerryNm: number;
  totalPayUsd: number;
  totalFuelCostUsd: number;
  totalNetUsd: number;
  score: number;
  reason: string;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLastMileLot(lot: Pick<ShipmentLot, 'reason'>): boolean {
  return /last-mile/i.test(lot.reason ?? '');
}

function lotDistanceNm(world: CareerEconomyWorld, lot: ShipmentLot): number {
  return (
    hubDistanceNm(lot.originIcao, lot.destIcao) ??
    routeDistanceNm(world, lot.originIcao, lot.destIcao) ??
    0
  );
}

function distNm(
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

function assertOwnsBase(state: CareerMissionsState): void {
  if (ensurePlayerFbos(state).fbos.length === 0) {
    throw new Error(
      'Dispatcher desk needs a company Base — buy your home Base first (first Base is free)',
    );
  }
}

function defaultExcludeLastMile(cls: FreighterClassId): boolean {
  return cls !== 'light_ga';
}

function defaultTourMinNm(cls: FreighterClassId): number {
  return (
    BASE_DISPATCH_TOUR_MIN_NM[cls] ??
    BASE_DISPATCH_SCOUT_MIN_NM[cls] ??
    120
  );
}

type EvalLeg = BaseDispatchTourLeg & {
  lot: ShipmentLot;
};

/** Economics+filters independent of ferry `fromIcao` — compute once per lot/aircraft. */
type LotCore = {
  lot: ShipmentLot;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  liftKg: number;
  distanceNm: number;
  payUsd: number;
  fuelCostUsd: number;
  netUsd: number;
  lastMile: boolean;
};

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

/** Lots held by NPC awaiting pilot (crewNeeded) — O(flights), not O(lots×flights). */
function buildCrewNeededLotIds(world: CareerEconomyWorld): Set<string> {
  const ids = new Set<string>();
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'awaiting_pilot' || !flight.lotId) continue;
    const claim = npcClaimForLot(world, flight.lotId);
    if (claim?.crewNeeded === true) ids.add(flight.lotId);
  }
  return ids;
}

function withFerry(
  world: CareerEconomyWorld,
  core: LotCore,
  fromIcao: string,
  maxFerryNm: number,
  distCache: Map<string, number>,
): EvalLeg | null {
  const from = fromIcao.trim().toUpperCase();
  const key = `${from}|${core.originIcao}`;
  let ferryNm = distCache.get(key);
  if (ferryNm == null) {
    ferryNm = distNm(world, from, core.originIcao);
    distCache.set(key, ferryNm);
  }
  if (ferryNm > maxFerryNm) return null;
  return {
    lotId: core.lot.id,
    originIcao: core.originIcao,
    destIcao: core.destIcao,
    commodityId: core.commodityId,
    liftKg: core.liftKg,
    distanceNm: core.distanceNm,
    ferryNm: Math.round(ferryNm * 10) / 10,
    payUsd: core.payUsd,
    fuelCostUsd: core.fuelCostUsd,
    netUsd: core.netUsd,
    lastMile: core.lastMile,
    lot: core.lot,
  };
}

function precomputeLotCores(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  acf: PlayerAircraft,
  opts: {
    minNm: number;
    maxNm: number | null;
    minKg: number;
    excludeLastMile: boolean;
    blockedLotIds: Set<string>;
  },
): LotCore[] {
  const cls = acf.aircraftClassId as FreighterClassId;
  const catalog = findCareerPlayerAirframe(acf.airframeTypeId);
  const classDef = getAircraftClass(cls);
  const perf = resolveAirframePerfForUi(acf.airframeTypeId, cls, {
    maxCargoKg: classDef.maxCargoKg,
    maxRangeNm: classDef.maxRangeNm,
  });
  const maxRangeNm = resolveAirframeMaxRangeNm(acf.airframeTypeId, cls);
  const costMult = fboServiceCostMult(
    state,
    (acf.locationIcao ?? '').trim().toUpperCase() || 'ZZZZ',
  );
  const weights = {
    oewKg: catalog?.oewKg,
    mtowKg: catalog?.mtowKg,
    fuelCapacityKg: catalog?.fuelCapacityKg,
    fuelBurnKgPerNm: catalog?.fuelBurnKgPerNm,
    airframeTypeId: acf.airframeTypeId,
  };

  const cores: LotCore[] = [];
  for (const lot of world.lots ?? []) {
    if (lot.status !== 'available') continue;
    if (opts.blockedLotIds.has(lot.id)) continue;
    if (!cargoOpsIsUnlocked(state.cargoOps, lot.commodityId)) continue;
    const avail = lotAvailableKg(lot);
    if (avail < opts.minKg) continue;
    const lastMile = isLastMileLot(lot);
    if (opts.excludeLastMile && lastMile) continue;

    const origin = lot.originIcao.trim().toUpperCase();
    const dest = lot.destIcao.trim().toUpperCase();
    const nm = lotDistanceNm(world, lot);
    if (!Number.isFinite(nm) || nm < opts.minNm) continue;
    if (opts.maxNm != null && nm > opts.maxNm) continue;

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
    if (econ.liftKg < opts.minKg) continue;
    if (econ.netUsd <= 0) continue;

    cores.push({
      lot,
      originIcao: origin,
      destIcao: dest,
      commodityId: lot.commodityId,
      liftKg: econ.liftKg,
      distanceNm: Math.round(nm * 10) / 10,
      payUsd: econ.payUsd,
      fuelCostUsd: econ.fuelCostUsd,
      netUsd: econ.netUsd,
      lastMile,
    });
  }
  return cores;
}

function indexCoresByOrigin(cores: LotCore[]): Map<string, LotCore[]> {
  const byOrigin = new Map<string, LotCore[]>();
  for (const core of cores) {
    const list = byOrigin.get(core.originIcao);
    if (list) list.push(core);
    else byOrigin.set(core.originIcao, [core]);
  }
  return byOrigin;
}

function originsNear(
  world: CareerEconomyWorld,
  fromIcao: string,
  origins: string[],
  maxFerryNm: number,
  distCache: Map<string, number>,
): string[] {
  const from = fromIcao.trim().toUpperCase();
  const out: string[] = [];
  for (const origin of origins) {
    if (origin === from) {
      out.push(origin);
      continue;
    }
    const key = `${from}|${origin}`;
    let d = distCache.get(key);
    if (d == null) {
      d = distNm(world, from, origin);
      distCache.set(key, d);
    }
    if (d <= maxFerryNm) out.push(origin);
  }
  return out;
}

function tourScore(
  legs: BaseDispatchTourLeg[],
  ferryPenaltyPerNm: number,
  returnMode: BaseDispatchTourReturnMode,
  returnTargetIcao: string | null,
): number {
  let score = 0;
  for (const leg of legs) {
    score += leg.netUsd - leg.ferryNm * ferryPenaltyPerNm;
  }
  if (returnMode !== 'none' && returnTargetIcao) {
    const last = legs[legs.length - 1]!;
    if (last.destIcao === returnTargetIcao) {
      // Large vs typical leg nets (~$1–6k) so returning tours always rank first.
      score += 8_000;
    } else {
      const leftover = hubDistanceNm(last.destIcao, returnTargetIcao) ?? 999;
      score -= Math.min(2_000, leftover * 2);
    }
  }
  return money(score);
}

function resolveTourMaxFerryNm(raw: number | undefined | null): number {
  if (raw == null || !Number.isFinite(raw)) {
    return BASE_DISPATCH_TOUR_CHAIN_FERRY_MAX_NM;
  }
  return Math.max(
    40,
    Math.min(BASE_DISPATCH_TOUR_CHAIN_FERRY_CAP_NM, Math.floor(raw)),
  );
}

/**
 * Drop tours where ferry dominates revenue flying or net can't cover reposition.
 * Soft Search already ranks by ferry penalty — this is the hard floor.
 */
export function tourPassesQualityGate(tour: {
  totalDistanceNm: number;
  totalFerryNm: number;
  totalNetUsd: number;
}): boolean {
  if (!(tour.totalNetUsd > 0)) return false;
  if (!(tour.totalDistanceNm > 0)) return false;
  const ferry = Math.max(0, tour.totalFerryNm);
  if (ferry <= 0.5) return true;
  // Ferry must not eat most of the flown cargo distance.
  if (ferry > tour.totalDistanceNm * 0.85) return false;
  // At least ~$6 net per ferry nm (below that, reposition eats the deal).
  if (tour.totalNetUsd / ferry < 6) return false;
  return true;
}

/**
 * Search-table ferry chip: short label + tooltip detail of each reposition hop.
 * Label e.g. "Ferry · 188 nm"; detail e.g. "L2 SBCT→SBKP · 188 nm".
 */
export function describeTourFerry(
  legs: Array<{ originIcao: string; destIcao: string; ferryNm: number }>,
  fromIcao?: string | null,
): { label: string; detail: string } | null {
  const hops: string[] = [];
  let total = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (!(leg.ferryNm > 0.5)) continue;
    const prev =
      i > 0
        ? legs[i - 1]!.destIcao.trim().toUpperCase()
        : (fromIcao ?? '').trim().toUpperCase() || null;
    const origin = leg.originIcao.trim().toUpperCase();
    const nm = Math.round(leg.ferryNm);
    total += leg.ferryNm;
    if (prev && prev !== origin) {
      hops.push(`L${i + 1} ${prev}→${origin} ${nm} nm`);
    } else {
      hops.push(`L${i + 1} ${nm} nm`);
    }
  }
  if (!hops.length) return null;
  return {
    label: `Ferry · ${Math.round(total)} nm`,
    detail: hops.join(' · '),
  };
}

function formatTourRouteLabel(
  legs: Array<{ originIcao: string; destIcao: string }>,
): string {
  if (!legs.length) return '';
  const parts = [legs[0]!.originIcao.trim().toUpperCase()];
  for (const leg of legs) {
    const origin = leg.originIcao.trim().toUpperCase();
    const dest = leg.destIcao.trim().toUpperCase();
    if (!origin || !dest) continue;
    // Include ferry reposition when next lot does not start at previous dest.
    if (parts[parts.length - 1] !== origin) parts.push(origin);
    if (parts[parts.length - 1] !== dest) parts.push(dest);
  }
  return parts.join('→');
}

function buildTour(
  acf: PlayerAircraft,
  legs: EvalLeg[],
  ferryPenaltyPerNm: number,
  returnMode: BaseDispatchTourReturnMode,
  returnTargetIcao: string | null,
): BaseDispatchTour {
  const cleanLegs: BaseDispatchTourLeg[] = legs.map(
    ({ lot: _lot, ...leg }) => leg,
  );
  const routeLabel = formatTourRouteLabel(cleanLegs);
  const totalDistanceNm = money(
    cleanLegs.reduce((s, l) => s + l.distanceNm, 0),
  );
  const totalFerryNm = money(cleanLegs.reduce((s, l) => s + l.ferryNm, 0));
  const totalPayUsd = money(cleanLegs.reduce((s, l) => s + l.payUsd, 0));
  const totalFuelCostUsd = money(
    cleanLegs.reduce((s, l) => s + l.fuelCostUsd, 0),
  );
  const totalNetUsd = money(cleanLegs.reduce((s, l) => s + l.netUsd, 0));
  const score = tourScore(
    cleanLegs,
    ferryPenaltyPerNm,
    returnMode,
    returnTargetIcao,
  );
  const reasonParts = [
    `${cleanLegs.length} legs`,
    `net $${Math.round(totalNetUsd)}`,
  ];
  if (totalFerryNm > 0.5) {
    reasonParts.push(`ferry ${Math.round(totalFerryNm)} nm`);
  }
  if (returnMode === 'base') reasonParts.push('prefer return Base');
  if (returnMode === 'origin') reasonParts.push('prefer return origin');
  if (
    returnMode !== 'none' &&
    returnTargetIcao &&
    cleanLegs[cleanLegs.length - 1]!.destIcao === returnTargetIcao
  ) {
    reasonParts.push(`ends ${returnTargetIcao}`);
  }

  return {
    id: `${cleanLegs.map((l) => l.lotId).join('+')}|${acf.id}`,
    aircraftId: acf.id,
    aircraftClassId: acf.aircraftClassId as FreighterClassId,
    airframeTypeId: acf.airframeTypeId,
    aircraftLocationIcao:
      (acf.locationIcao ?? '').trim().toUpperCase() || undefined,
    legs: cleanLegs,
    routeLabel,
    legCount: cleanLegs.length,
    totalDistanceNm,
    totalFerryNm,
    totalPayUsd,
    totalFuelCostUsd,
    totalNetUsd,
    score,
    reason: reasonParts.join(' · '),
  };
}

/**
 * Search Market-lot tours for the Dispatcher desk.
 * Requires a hired Dispatcher (fleet scout policy).
 */
export function listBaseDispatchTours(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    hubIcao: string;
    aircraftId?: string;
    /** Start search from this ICAO (default: aircraft location or hub). */
    originIcao?: string;
    legs?: number;
    minNm?: number;
    maxNm?: number | null;
    /** Max ferry nm between legs (default 200; first-leg reposition allows 2×). */
    maxFerryNm?: number | null;
    minKg?: number;
    returnMode?: BaseDispatchTourReturnMode;
    max?: number;
    excludeLastMile?: boolean;
  },
): BaseDispatchTour[] {
  assertOwnsBase(state);
  const policy = resolveBaseDispatchScoutPolicy(state);
  if (policy.mode !== 'fleet') {
    throw new Error(
      'Tour generate needs a hired Base Dispatcher — hire one on the desk first',
    );
  }

  const hub = opts.hubIcao.trim().toUpperCase();
  const regionByIcao = buildAirportRegionMap(world);
  const hubRegion = regionByIcao.get(hub) ?? null;
  const blockedLotIds = buildCrewNeededLotIds(world);
  const legCount = Math.max(
    2,
    Math.min(BASE_DISPATCH_TOUR_LEGS_MAX, Math.floor(opts.legs ?? 2)),
  );
  const maxTours = Math.max(
    1,
    Math.min(BASE_DISPATCH_TOUR_MAX, opts.max ?? BASE_DISPATCH_TOUR_MAX),
  );
  const minKg = Math.max(0, opts.minKg ?? BASE_DISPATCH_SCOUT_MIN_KG);
  const returnMode = opts.returnMode ?? 'none';
  const chainFerryMaxNm = resolveTourMaxFerryNm(opts.maxFerryNm);

  const fleet = (state.fleet ?? []).filter((a) => {
    if (a.status !== 'parked') return false;
    if (opts.aircraftId && a.id !== opts.aircraftId) return false;
    return true;
  });
  if (fleet.length === 0) return [];

  const tours: BaseDispatchTour[] = [];
  const seen = new Set<string>();
  const distCache = new Map<string, number>();

  const preferReturn = returnMode !== 'none';
  const FIRST_CANDIDATES = preferReturn ? 18 : 12;
  const CHAIN_PICKS = 5;
  const FRONTIER_CAP = preferReturn ? 28 : 20;

  for (const acf of fleet) {
    const cls = acf.aircraftClassId as FreighterClassId;
    const excludeLastMile =
      opts.excludeLastMile ?? defaultExcludeLastMile(cls);
    const minNm = opts.minNm ?? defaultTourMinNm(cls);
    const maxNm =
      opts.maxNm != null && Number.isFinite(opts.maxNm) && opts.maxNm > 0
        ? opts.maxNm
        : null;
    const acfLoc = (acf.locationIcao ?? '').trim().toUpperCase();
    const startIcao =
      (opts.originIcao ?? '').trim().toUpperCase() || acfLoc || hub;
    const firstLegRegion = regionByIcao.get(startIcao) ?? hubRegion;
    const returnTarget =
      returnMode === 'base'
        ? hub
        : returnMode === 'origin'
          ? startIcao
          : null;

    const cores = precomputeLotCores(state, world, acf, {
      minNm,
      maxNm,
      minKg,
      excludeLastMile,
      blockedLotIds,
    });
    const byOrigin = indexCoresByOrigin(cores);
    const allOrigins = [...byOrigin.keys()];

    const firstFerryMax = chainFerryMaxNm * 2;
    const firstOrigins = firstLegRegion
      ? allOrigins.filter((icao) => regionByIcao.get(icao) === firstLegRegion)
      : allOrigins;
    const nearStart = originsNear(
      world,
      startIcao,
      firstOrigins,
      firstFerryMax,
      distCache,
    );

    const firstPool: EvalLeg[] = [];
    for (const origin of nearStart) {
      for (const core of byOrigin.get(origin) ?? []) {
        const ev = withFerry(world, core, startIcao, firstFerryMax, distCache);
        if (ev) firstPool.push(ev);
      }
    }
    firstPool.sort((a, b) => {
      const sa = a.netUsd - a.ferryNm * policy.ferryPenaltyUsdPerNm;
      const sb = b.netUsd - b.ferryNm * policy.ferryPenaltyUsdPerNm;
      return sb - sa || a.ferryNm - b.ferryNm;
    });

    const firstCandidates = firstPool.slice(0, FIRST_CANDIDATES);

    for (const first of firstCandidates) {
      type Node = { legs: EvalLeg[]; atIcao: string };
      let frontier: Node[] = [{ legs: [first], atIcao: first.destIcao }];

      for (let depth = 1; depth < legCount; depth++) {
        const isLastHop = depth === legCount - 1;
        const nextFrontier: Node[] = [];
        for (const node of frontier) {
          const used = new Set(node.legs.map((l) => l.lotId));
          const nearOrigins = originsNear(
            world,
            node.atIcao,
            allOrigins,
            chainFerryMaxNm,
            distCache,
          );
          const contenders: EvalLeg[] = [];
          for (const origin of nearOrigins) {
            for (const core of byOrigin.get(origin) ?? []) {
              if (used.has(core.lot.id)) continue;
              const ev = withFerry(
                world,
                core,
                node.atIcao,
                chainFerryMaxNm,
                distCache,
              );
              if (ev) contenders.push(ev);
            }
          }
          // Last hop + Prefer return: try only legs that land on the target.
          let picks = contenders;
          if (isLastHop && returnTarget) {
            const returning = contenders.filter(
              (c) => c.destIcao === returnTarget,
            );
            if (returning.length > 0) picks = returning;
          }
          picks.sort((a, b) => {
            const sa = a.netUsd - a.ferryNm * policy.ferryPenaltyUsdPerNm;
            const sb = b.netUsd - b.ferryNm * policy.ferryPenaltyUsdPerNm;
            return sb - sa || a.ferryNm - b.ferryNm;
          });
          const pickCap =
            isLastHop && returnTarget && picks[0]?.destIcao === returnTarget
              ? 8
              : CHAIN_PICKS;
          for (const pick of picks.slice(0, pickCap)) {
            nextFrontier.push({
              legs: [...node.legs, pick],
              atIcao: pick.destIcao,
            });
          }
        }
        frontier = nextFrontier;
        if (frontier.length === 0) break;
        frontier.sort((a, b) => {
          const sa = tourScore(
            a.legs,
            policy.ferryPenaltyUsdPerNm,
            returnMode,
            returnTarget,
          );
          const sb = tourScore(
            b.legs,
            policy.ferryPenaltyUsdPerNm,
            returnMode,
            returnTarget,
          );
          return sb - sa;
        });
        frontier = frontier.slice(0, FRONTIER_CAP);
      }

      for (const node of frontier) {
        if (node.legs.length < legCount) continue;
        const tour = buildTour(
          acf,
          node.legs,
          policy.ferryPenaltyUsdPerNm,
          returnMode,
          returnTarget,
        );
        if (!tourPassesQualityGate(tour)) continue;
        if (seen.has(tour.id)) continue;
        seen.add(tour.id);
        tours.push(tour);
      }
    }
  }

  tours.sort(
    (a, b) =>
      b.score - a.score ||
      a.totalFerryNm - b.totalFerryNm ||
      b.totalNetUsd - a.totalNetUsd,
  );

  // Prefer return: only show tours that end at the target (no open-end fallback).
  if (returnMode !== 'none') {
    const wantOrigin = (opts.originIcao ?? '').trim().toUpperCase();
    const returning = tours.filter((t) => {
      const last = t.legs[t.legs.length - 1]?.destIcao;
      if (!last) return false;
      if (returnMode === 'base') return last === hub;
      const want = wantOrigin || t.legs[0]?.originIcao || '';
      return want.length > 0 && last === want;
    });
    return returning.slice(0, maxTours);
  }

  return tours.slice(0, maxTours);
}

/**
 * Accept a tour → commit leg 1 only (same as Freights Accept).
 * When `tourLegs` has 2+ legs, persists Active Tour for Accept L2+.
 */
export function confirmBaseDispatchTour(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    aircraftId: string;
    firstLotId: string;
    kg?: number;
    hubIcao?: string;
    /** Snapshot from Search row — required to start Active Tour. */
    tourLegs?: BaseDispatchTourLeg[];
    tourId?: string;
    routeLabel?: string;
  },
): {
  mission: MissionIntent;
  suggestion: BaseDispatchScoutSuggestion | null;
  kg: number;
  tourLegIndex: 1;
  activeTour: ActiveTour | null;
} {
  const confirmed = confirmBaseDispatchScout(state, world, {
    lotId: opts.firstLotId,
    aircraftId: opts.aircraftId,
    kg: opts.kg,
    hubIcao: opts.hubIcao,
  });

  // Bind aircraft when already at L1 origin (ferry-first Accept leaves unbound).
  const acf = state.fleet.find((a) => a.id === opts.aircraftId);
  const origin = confirmed.mission.originIcao.trim().toUpperCase();
  if (acf) {
    confirmed.mission.aircraftId = opts.aircraftId;
    if (acf.airframeTypeId) {
      confirmed.mission.airframeTypeId = acf.airframeTypeId;
    }
    const idx = state.missions.findIndex((m) => m.id === confirmed.mission.id);
    if (idx >= 0) {
      state.missions[idx] = {
        ...state.missions[idx]!,
        aircraftId: opts.aircraftId,
        ...(acf.airframeTypeId
          ? { airframeTypeId: acf.airframeTypeId }
          : {}),
      };
    }
    if (
      acf.status === 'parked' &&
      (acf.locationIcao ?? '').trim().toUpperCase() === origin
    ) {
      try {
        assignAircraftToMission(
          state,
          opts.aircraftId,
          confirmed.mission.id,
          origin,
          { requirePilotAtOrigin: false },
        );
      } catch {
        /* leave unassigned — player ferries then opens Dispatch */
      }
    }
  }

  const hub =
    (opts.hubIcao ?? '').trim().toUpperCase() ||
    state.homeHubIcao?.trim().toUpperCase() ||
    origin;
  let activeTour: ActiveTour | null = null;
  const snapLegs = opts.tourLegs?.filter(Boolean) ?? [];
  if (snapLegs.length >= 2) {
    activeTour = startActiveTour(state, world, {
      aircraftId: opts.aircraftId,
      hubIcao: hub,
      tourId: opts.tourId,
      routeLabel: opts.routeLabel,
      legs: snapLegs,
      firstMission: confirmed.mission,
    });
  } else {
    syncActiveTour(state, world);
    activeTour = getActiveTour(state);
  }

  return {
    ...confirmed,
    tourLegIndex: 1,
    activeTour,
  };
}

function moneyTourId(): string {
  return `tour_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function getActiveTour(state: CareerMissionsState): ActiveTour | null {
  const tour = ensurePlayerFbos(state).activeTour;
  if (!tour || tour.status !== 'active') return tour ?? null;
  return tour;
}

function lotStillOpen(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  lotId: string,
): boolean {
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot || lot.status !== 'available') return false;
  if (!cargoOpsIsUnlocked(state.cargoOps, lot.commodityId)) return false;
  return lotAvailableKg(lot) > 0;
}

function findMissionForLeg(
  state: CareerMissionsState,
  leg: ActiveTourLeg,
): MissionIntent | undefined {
  if (leg.missionId) {
    const byId = state.missions.find((m) => m.id === leg.missionId);
    if (byId) return byId;
  }
  // Soft-match only live missions. Settled/cancelled lots must not mark a
  // later tour leg "done" (causes L2 done while L1 still planned after cancel).
  return state.missions.find(
    (m) =>
      (m.status === 'accepted' ||
        m.status === 'dispatched' ||
        m.status === 'in_flight') &&
      (m.shipmentLotId === leg.lotId ||
        m.lots.some((line) => line.shipmentLotId === leg.lotId)),
  );
}

function missionTerminalStatus(
  status: MissionIntent['status'],
): 'done' | 'active' | 'lost' | null {
  if (status === 'settled') return 'done';
  if (status === 'cancelled' || status === 'failed') return 'lost';
  if (
    status === 'accepted' ||
    status === 'dispatched' ||
    status === 'in_flight'
  ) {
    return 'active';
  }
  return null;
}

/**
 * Refresh leg statuses from missions + board availability.
 */
export function syncActiveTour(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): ActiveTour | null {
  const fbos = ensurePlayerFbos(state);
  const tour = fbos.activeTour;
  if (!tour || tour.status !== 'active') return tour ?? null;

  for (const leg of tour.legs) {
    const mission = findMissionForLeg(state, leg);
    if (mission) {
      leg.missionId = mission.id;
      const term = missionTerminalStatus(mission.status);
      if (term === 'done') leg.status = 'done';
      else if (term === 'active') leg.status = 'active';
      else if (term === 'lost' && leg.status !== 'done') {
        leg.status = lotStillOpen(state, world, leg.lotId) ? 'planned' : 'lost';
        leg.missionId = undefined;
      }
      continue;
    }
    // Prepared tour (all planned) or mid-leg after cancel: no matching mission.
    if (leg.status === 'active') {
      leg.status = lotStillOpen(state, world, leg.lotId) ? 'planned' : 'lost';
      leg.missionId = undefined;
    } else if (leg.status === 'planned' && !lotStillOpen(state, world, leg.lotId)) {
      // Lot may be reserved/in_transit on the player's mission — do not mark lost.
      const lot = world.lots.find((l) => l.id === leg.lotId);
      if (!lot || lot.status === 'expired' || lot.status === 'delivered') {
        leg.status = 'lost';
      }
    } else if (leg.status === 'lost' && lotStillOpen(state, world, leg.lotId)) {
      leg.status = 'planned';
    }
  }

  if (tour.legs.every((l) => l.status === 'done')) {
    tour.status = 'completed';
  }
  fbos.activeTour = tour;
  return tour;
}

export function startActiveTour(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    aircraftId: string;
    hubIcao: string;
    tourId?: string;
    routeLabel?: string;
    legs: BaseDispatchTourLeg[];
    firstMission: MissionIntent;
  },
): ActiveTour {
  const acf = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!acf) throw new Error('Unknown aircraft for Active Tour');
  const fbos = ensurePlayerFbos(state);
  const legs: ActiveTourLeg[] = opts.legs.map((leg, i) => ({
    index: i + 1,
    lotId: leg.lotId,
    originIcao: leg.originIcao.trim().toUpperCase(),
    destIcao: leg.destIcao.trim().toUpperCase(),
    commodityId: leg.commodityId as CommodityId,
    liftKg: leg.liftKg,
    distanceNm: leg.distanceNm,
    ferryNm: leg.ferryNm,
    payUsd: leg.payUsd,
    fuelCostUsd: leg.fuelCostUsd,
    netUsd: leg.netUsd,
    lastMile: leg.lastMile,
    status: (i === 0 ? 'active' : 'planned') as ActiveTourLegStatus,
    ...(i === 0 ? { missionId: opts.firstMission.id } : {}),
  }));
  const tour: ActiveTour = {
    id: moneyTourId(),
    tourTemplateId: opts.tourId,
    aircraftId: opts.aircraftId,
    aircraftClassId: acf.aircraftClassId as FreighterClassId,
    airframeTypeId: acf.airframeTypeId,
    hubIcao: opts.hubIcao.trim().toUpperCase(),
    originIcao: legs[0]?.originIcao ?? '',
    routeLabel:
      opts.routeLabel?.trim() || formatTourRouteLabel(legs),
    legs,
    startedAtTick: world.tick,
    status: 'active',
  };
  fbos.activeTour = tour;
  return tour;
}

export function dropActiveTour(state: CareerMissionsState): void {
  const fbos = ensurePlayerFbos(state);
  if (!fbos.activeTour) return;
  if (fbos.activeTour.status === 'active') {
    fbos.activeTour = { ...fbos.activeTour, status: 'abandoned' };
  }
  // Clear so desk shows empty; abandoned stays only if we want history — v1 clears.
  fbos.activeTour = null;
}

/**
 * Persist the Search itinerary as Active Tour before Manifest commit.
 * Legs stay `planned` until attach/bind (or sync finds a matching mission).
 * Survives refresh/rebuild — unlike React-only pendingActiveTour.
 */
export function prepareActiveTour(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    aircraftId: string;
    hubIcao: string;
    tourId?: string;
    routeLabel?: string;
    legs: BaseDispatchTourLeg[];
  },
): ActiveTour {
  if (!opts.legs || opts.legs.length < 2) {
    throw new Error('Active Tour needs at least 2 legs');
  }
  const acf = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!acf) throw new Error('Unknown aircraft for Active Tour');
  const fbos = ensurePlayerFbos(state);
  const legs: ActiveTourLeg[] = opts.legs.map((leg, i) => ({
    index: i + 1,
    lotId: leg.lotId,
    originIcao: leg.originIcao.trim().toUpperCase(),
    destIcao: leg.destIcao.trim().toUpperCase(),
    commodityId: leg.commodityId as CommodityId,
    liftKg: leg.liftKg,
    distanceNm: leg.distanceNm,
    ferryNm: leg.ferryNm,
    payUsd: leg.payUsd,
    fuelCostUsd: leg.fuelCostUsd,
    netUsd: leg.netUsd,
    lastMile: leg.lastMile,
    status: 'planned' as ActiveTourLegStatus,
  }));
  const tour: ActiveTour = {
    id: moneyTourId(),
    tourTemplateId: opts.tourId,
    aircraftId: opts.aircraftId,
    aircraftClassId: acf.aircraftClassId as FreighterClassId,
    airframeTypeId: acf.airframeTypeId,
    hubIcao: opts.hubIcao.trim().toUpperCase(),
    originIcao: legs[0]?.originIcao ?? '',
    routeLabel:
      opts.routeLabel?.trim() || formatTourRouteLabel(legs),
    legs,
    startedAtTick: world.tick,
    status: 'active',
  };
  fbos.activeTour = tour;
  return syncActiveTour(state, world) ?? tour;
}

/**
 * After Manifest Accept & Dispatch: attach the Search itinerary as Active Tour
 * using the mission just created (lot already accepted — do not re-accept).
 */
export function attachActiveTourFromMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    missionId: string;
    aircraftId: string;
    hubIcao: string;
    tourLegs: BaseDispatchTourLeg[];
    tourId?: string;
    routeLabel?: string;
  },
): ActiveTour {
  if (!opts.tourLegs || opts.tourLegs.length < 2) {
    throw new Error('Active Tour needs at least 2 legs');
  }
  const mission = state.missions.find((m) => m.id === opts.missionId);
  if (!mission) throw new Error('Mission not found for Active Tour');
  const firstLot = opts.tourLegs[0]!.lotId;
  const onMission =
    mission.shipmentLotId === firstLot ||
    mission.lots.some((line) => line.shipmentLotId === firstLot);
  if (!onMission) {
    throw new Error('Mission cargo does not match tour leg 1');
  }
  // Prefer the hangar plane actually on the mission.
  const aircraftId =
    mission.aircraftId?.trim() || opts.aircraftId.trim();

  // Upgrade a prepare()-d itinerary in place when lot chain matches.
  const existing = getActiveTour(state);
  const sameChain =
    existing &&
    existing.status === 'active' &&
    existing.legs.length === opts.tourLegs.length &&
    existing.legs.every(
      (leg, i) => leg.lotId === opts.tourLegs[i]!.lotId,
    );
  if (sameChain && existing) {
    existing.aircraftId = aircraftId;
    const leg1 = existing.legs[0]!;
    leg1.status = 'active';
    leg1.missionId = mission.id;
    ensurePlayerFbos(state).activeTour = existing;
    return syncActiveTour(state, world) ?? existing;
  }

  return startActiveTour(state, world, {
    aircraftId,
    hubIcao: opts.hubIcao,
    tourId: opts.tourId,
    routeLabel: opts.routeLabel,
    legs: opts.tourLegs,
    firstMission: mission,
  });
}

/**
 * Drop Active Tour only when nothing was ever bound to a mission
 * (Manifest cancel after prepare). Planned/lost without missionId counts as unbound.
 */
export function dropPreparedActiveTourIfUnbound(
  state: CareerMissionsState,
): boolean {
  const tour = getActiveTour(state);
  if (!tour || tour.status !== 'active') return false;
  const anyBound = tour.legs.some(
    (leg) =>
      Boolean(leg.missionId) ||
      leg.status === 'active' ||
      leg.status === 'done',
  );
  if (anyBound) return false;
  dropActiveTour(state);
  return true;
}

/**
 * After Manifest Accept for L2/L3: bind the new mission onto the planned leg.
 */
export function bindActiveTourLegToMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { legIndex: number; missionId: string },
): ActiveTourView {
  const tour = syncActiveTour(state, world);
  if (!tour || tour.status !== 'active') {
    throw new Error('No active tour');
  }
  const leg = tour.legs.find((l) => l.index === opts.legIndex);
  if (!leg) throw new Error(`Unknown tour leg ${opts.legIndex}`);
  if (leg.status === 'done') {
    throw new Error(`Leg ${opts.legIndex} already done`);
  }
  const mission = state.missions.find((m) => m.id === opts.missionId);
  if (!mission) throw new Error('Mission not found');
  const onMission =
    mission.shipmentLotId === leg.lotId ||
    mission.lots.some((line) => line.shipmentLotId === leg.lotId);
  // After rebind, lotId on leg may still be the plan id while mission used alt —
  // also allow OD match.
  const odMatch =
    mission.originIcao.toUpperCase() === leg.originIcao &&
    mission.destIcao.toUpperCase() === leg.destIcao;
  if (!onMission && !odMatch) {
    throw new Error('Mission does not match this tour leg');
  }
  if (onMission === false && odMatch) {
    leg.lotId = mission.shipmentLotId;
    leg.liftKg = mission.cargoKg;
  }
  leg.status = 'active';
  leg.missionId = mission.id;
  const view = activeTourView(state, world);
  if (!view) throw new Error('Active Tour missing after bind');
  return view;
}

/** Find a replacement lot for a lost plan leg (same OD, similar kg). */
export function rebindActiveTourLeg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  leg: ActiveTourLeg,
  aircraft: PlayerAircraft,
): { lotId: string; liftKg: number } | null {
  const origin = leg.originIcao.trim().toUpperCase();
  const dest = leg.destIcao.trim().toUpperCase();
  const targetKg = Math.max(1, Math.floor(leg.liftKg));
  const cls = aircraft.aircraftClassId as FreighterClassId;
  const maxCargo = resolveAirframePerfForUi(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
  ).maxCargoKg;
  const maxRange = resolveAirframeMaxRangeNm(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
  );

  let best: { lotId: string; liftKg: number; score: number } | null = null;
  for (const lot of world.lots) {
    if (lot.status !== 'available') continue;
    if (!cargoOpsIsUnlocked(state.cargoOps, lot.commodityId)) continue;
    if (lot.originIcao.toUpperCase() !== origin) continue;
    if (lot.destIcao.toUpperCase() !== dest) continue;
    if (isLastMileLot(lot) && defaultExcludeLastMile(cls)) continue;
    const avail = lotAvailableKg(lot);
    if (avail < BASE_DISPATCH_SCOUT_MIN_KG) continue;
    const liftKg = Math.min(avail, maxCargo, targetKg);
    if (liftKg < 1) continue;
    const nm = lotDistanceNm(world, lot);
    if (nm <= 0 || nm > maxRange) continue;
    const kgDelta = Math.abs(liftKg - targetKg);
    const score = -kgDelta - Math.abs(nm - leg.distanceNm) * 0.1;
    if (!best || score > best.score) {
      best = { lotId: lot.id, liftKg, score };
    }
  }
  return best ? { lotId: best.lotId, liftKg: best.liftKg } : null;
}

export type ActiveTourResumeState =
  | 'in_progress'
  | 'ready'
  | 'blocked'
  | 'stranded';

export type ActiveTourView = ActiveTour & {
  aircraftLocationIcao?: string;
  nextLegIndex: number | null;
  canAcceptNextLeg: boolean;
  acceptBlockedReason: string | null;
  nextLegLotAvailable: boolean;
  nextLegNeedsRebind: boolean;
  /** How the desk should present post-cancel / idle recovery. */
  resumeState: ActiveTourResumeState;
  /** Short player-facing line for toast / Dispatch empty banner. */
  resumeHint: string | null;
};

export function activeTourView(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): ActiveTourView | null {
  const tour = syncActiveTour(state, world);
  if (!tour || tour.status !== 'active') return null;
  const acf = state.fleet.find((a) => a.id === tour.aircraftId);
  const loc = (acf?.locationIcao ?? '').trim().toUpperCase() || undefined;
  const next =
    tour.legs.find((l) => l.status === 'planned' || l.status === 'lost') ??
    null;
  // Prefer first non-done that isn't already active mid-flight.
  const activeLeg = tour.legs.find((l) => l.status === 'active');
  let nextLegIndex: number | null = null;
  let canAccept = false;
  let reason: string | null = null;
  let lotAvailable = false;
  let needsRebind = false;

  if (activeLeg) {
    nextLegIndex = activeLeg.index;
    reason = `Leg ${activeLeg.index} in progress — finish or cancel before Accept L${activeLeg.index + 1}`;
  } else if (next) {
    nextLegIndex = next.index;
    // Prior legs must be done.
    const priors = tour.legs.filter((l) => l.index < next.index);
    const priorOk = priors.every((l) => l.status === 'done');
    if (!priorOk) {
      const lostPriors = priors.filter((l) => l.status === 'lost');
      if (lostPriors.length > 0 && lostPriors.length === priors.filter((l) => l.status !== 'done').length) {
        reason = `L${lostPriors[0]!.index} cancelled/lost — Drop tour or Search again`;
      } else {
        reason = 'Finish earlier tour legs first';
      }
    } else if (!acf || acf.status !== 'parked') {
      reason = 'Parked tour aircraft required';
    } else if ((acf.locationIcao ?? '').trim().toUpperCase() !== next.originIcao) {
      reason = `Ferry to ${next.originIcao} first (aircraft at ${acf.locationIcao || '—'})`;
    } else {
      lotAvailable = lotStillOpen(state, world, next.lotId);
      needsRebind = !lotAvailable;
      if (lotAvailable) {
        canAccept = true;
      } else {
        const rebound = rebindActiveTourLeg(state, world, next, acf);
        if (rebound) {
          canAccept = true;
          needsRebind = true;
          reason = `Original lot gone — will rebind similar ${next.originIcao}→${next.destIcao}`;
        } else {
          reason = `No open lot for ${next.originIcao}→${next.destIcao} — Drop tour or Search again`;
          next.status = 'lost';
        }
      }
    }
  }

  let resumeState: ActiveTourResumeState;
  let resumeHint: string | null = null;
  if (activeLeg) {
    resumeState = 'in_progress';
    resumeHint = `Tour L${activeLeg.index}/${tour.legs.length} in progress`;
  } else if (canAccept && nextLegIndex != null) {
    resumeState = 'ready';
    const leg = tour.legs.find((l) => l.index === nextLegIndex);
    resumeHint = leg
      ? `Tour still active — Resume L${nextLegIndex} ${leg.originIcao}→${leg.destIcao}`
      : `Tour still active — Resume L${nextLegIndex}`;
  } else if (
    nextLegIndex != null &&
    (next?.status === 'lost' || /Drop tour/i.test(reason ?? ''))
  ) {
    resumeState = 'stranded';
    resumeHint =
      reason ??
      `Tour L${nextLegIndex} cannot continue — Drop tour or Search again`;
  } else if (nextLegIndex != null) {
    resumeState = 'blocked';
    resumeHint = reason
      ? `Tour L${nextLegIndex} waiting — ${reason}`
      : `Tour L${nextLegIndex} waiting — open Base`;
  } else {
    resumeState = 'stranded';
    resumeHint = 'Tour has no remaining legs — Drop tour';
  }

  return {
    ...tour,
    aircraftLocationIcao: loc,
    nextLegIndex,
    canAcceptNextLeg: canAccept,
    acceptBlockedReason: canAccept && needsRebind ? reason : canAccept ? null : reason,
    nextLegLotAvailable: lotAvailable,
    nextLegNeedsRebind: needsRebind,
    resumeState,
    resumeHint,
  };
}

/**
 * Accept the next planned (or rebindable) Active Tour leg.
 */
export function acceptActiveTourLeg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { legIndex?: number; kg?: number } = {},
): {
  mission: MissionIntent;
  kg: number;
  tourLegIndex: number;
  activeTour: ActiveTourView;
  rebound: boolean;
} {
  const view = activeTourView(state, world);
  if (!view) throw new Error('No active tour');
  const tour = ensurePlayerFbos(state).activeTour!;
  const wantIndex = opts.legIndex ?? view.nextLegIndex;
  if (wantIndex == null) throw new Error('No next tour leg to accept');
  const leg = tour.legs.find((l) => l.index === wantIndex);
  if (!leg) throw new Error(`Unknown tour leg ${wantIndex}`);
  if (leg.status === 'done') throw new Error(`Leg ${wantIndex} already done`);
  if (leg.status === 'active') {
    throw new Error(`Leg ${wantIndex} already accepted — open Dispatch`);
  }

  const refreshed = activeTourView(state, world);
  if (!refreshed?.canAcceptNextLeg || refreshed.nextLegIndex !== wantIndex) {
    throw new Error(
      refreshed?.acceptBlockedReason ?? 'Cannot accept this tour leg yet',
    );
  }

  const acf = state.fleet.find((a) => a.id === tour.aircraftId);
  if (!acf || acf.status !== 'parked') {
    throw new Error('Parked tour aircraft required');
  }

  let lotId = leg.lotId;
  let liftKg = opts.kg ?? leg.liftKg;
  let rebound = false;
  if (!lotStillOpen(state, world, lotId)) {
    const alt = rebindActiveTourLeg(state, world, leg, acf);
    if (!alt) {
      leg.status = 'lost';
      throw new Error(
        `Lot for leg ${wantIndex} is gone and no similar freight found`,
      );
    }
    lotId = alt.lotId;
    liftKg = alt.liftKg;
    leg.lotId = alt.lotId;
    leg.liftKg = alt.liftKg;
    rebound = true;
  }

  const confirmed = confirmBaseDispatchScout(state, world, {
    lotId,
    aircraftId: tour.aircraftId,
    kg: liftKg,
    hubIcao: tour.hubIcao,
  });

  assignAircraftToMission(
    state,
    tour.aircraftId,
    confirmed.mission.id,
    confirmed.mission.originIcao,
    { requirePilotAtOrigin: false },
  );
  confirmed.mission.aircraftId = tour.aircraftId;
  if (acf.airframeTypeId) {
    confirmed.mission.airframeTypeId = acf.airframeTypeId;
  }
  const mIdx = state.missions.findIndex((m) => m.id === confirmed.mission.id);
  if (mIdx >= 0) {
    state.missions[mIdx] = {
      ...state.missions[mIdx]!,
      aircraftId: tour.aircraftId,
      ...(acf.airframeTypeId
        ? { airframeTypeId: acf.airframeTypeId }
        : {}),
    };
  }

  leg.status = 'active';
  leg.missionId = confirmed.mission.id;
  leg.lotId = lotId;
  leg.liftKg = confirmed.kg;

  const activeTour = activeTourView(state, world)!;
  return {
    mission: confirmed.mission,
    kg: confirmed.kg,
    tourLegIndex: wantIndex,
    activeTour,
    rebound,
  };
}
