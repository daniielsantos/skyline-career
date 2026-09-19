/**
 * Base Dispatcher Charter Search — chain open charter offers into 1–2 leg tours.
 * Legs 1 Accept → Manifest / reserveCharterOffer (same as Charter board).
 * Legs 2 persist charterActiveTour for Accept L2 after L1 settles (no lot soft-hold).
 */

import {
  CHARTER_MAX_DISTANCE_NM,
  CHARTER_MIN_DISTANCE_NM,
  isCharterEligibleAircraftClass,
} from './career-charter.js';
import { routeDistanceNm } from './career-economy.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { ensurePlayerFbos } from './career-fbo.js';
import {
  resolveBaseDispatchScoutPolicy,
} from './career-base-dispatcher.js';
import {
  BASE_DISPATCH_TOUR_MAX,
  tourPassesQualityGate,
} from './career-base-dispatch-tour.js';
import {
  findCareerAirframeConfiguration,
  findCareerPlayerAirframe,
  resolveAirframeFuelBurnKgPerNm,
  resolveAirframeMaxRangeNm,
  resolvePassengerCapacity,
} from './career-player-airframes.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CharterActiveTour,
  CharterOffer,
  FreighterClassId,
  PlayerAircraft,
} from './types/career-economy.js';

export const BASE_CHARTER_TOUR_LEGS_MAX = 2;
export const BASE_CHARTER_TOUR_DEFAULT_FERRY_NM = 200;
export const BASE_CHARTER_TOUR_FERRY_CAP_NM = 800;

const KG_TO_LB = 2.204_622_621_8;
const LEAVE_BASE_BOOST = 180;
const LEAVE_BASE_NEIGHBOR_PENALTY = 40;

export type BaseCharterTourReturnMode = 'none' | 'origin' | 'base';

export type BaseCharterTourLeg = {
  offerId: string;
  originIcao: string;
  destIcao: string;
  groupSize: number;
  baggageKg: number;
  distanceNm: number;
  ferryNm: number;
  payUsd: number;
  fuelCostUsd: number;
  netUsd: number;
  tier: string;
  expiresAtTick: number;
};

export type BaseCharterTour = {
  id: string;
  aircraftId: string;
  aircraftLabel: string;
  aircraftLocationIcao: string;
  hubIcao: string;
  routeLabel: string;
  legs: BaseCharterTourLeg[];
  legCount: number;
  totalDistanceNm: number;
  totalFerryNm: number;
  totalPayUsd: number;
  totalNetUsd: number;
  score: number;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function distNm(
  world: CareerEconomyWorld,
  a: string,
  b: string,
  cache: Map<string, number>,
): number {
  const from = a.trim().toUpperCase();
  const to = b.trim().toUpperCase();
  if (!from || !to || from === to) return 0;
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const nm =
    hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to) ?? 0;
  cache.set(key, nm);
  return nm;
}

function buildAirportRegionMap(
  world: CareerEconomyWorld,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ap of world.airports ?? []) {
    const icao = ap.icao?.trim().toUpperCase() ?? '';
    const region = typeof ap.region === 'string' ? ap.region.trim() : '';
    if (icao && region) map.set(icao, region);
  }
  return map;
}

function resolveMaxFerryNm(raw: number | undefined | null): number {
  if (raw == null || !Number.isFinite(raw)) {
    return BASE_CHARTER_TOUR_DEFAULT_FERRY_NM;
  }
  return Math.max(
    40,
    Math.min(BASE_CHARTER_TOUR_FERRY_CAP_NM, Math.floor(raw)),
  );
}

function estimateFuelCostUsd(
  airframeTypeId: string | undefined,
  aircraftClassId: FreighterClassId,
  distanceNm: number,
  state: CareerMissionsState,
): number {
  const burn = resolveAirframeFuelBurnKgPerNm(
    airframeTypeId,
    aircraftClassId,
    state.airframePerfOverrides?.[airframeTypeId ?? ''] ?? null,
  );
  const fuelKg = burn * distanceNm * 1.15 + 40;
  return money(fuelKg * 1.35);
}

function offerFitsAircraft(
  offer: CharterOffer,
  aircraft: PlayerAircraft,
  state: CareerMissionsState,
): { ok: boolean; fuelCostUsd: number; netUsd: number } {
  if (!isCharterEligibleAircraftClass(aircraft.aircraftClassId)) {
    return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  }
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const configuration = findCareerAirframeConfiguration(
    airframe,
    aircraft.airframeConfigurationId,
    aircraft.rolesPackRelPath,
  );
  if (!configuration || configuration.role !== 'passenger') {
    return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  }
  if (configuration.certificationState === 'catalog_only') {
    return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  }
  const seats = resolvePassengerCapacity(
    aircraft.airframeTypeId,
    aircraft.airframeConfigurationId,
    aircraft.rolesPackRelPath,
  );
  if (seats < offer.groupSize) return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  const bagCapKg = (configuration.baggageCapacityLb ?? 0) / KG_TO_LB;
  if (offer.baggageKg > bagCapKg + 0.5) {
    return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  }
  const maxRange = resolveAirframeMaxRangeNm(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
  );
  if (offer.distanceNm > maxRange) {
    return { ok: false, fuelCostUsd: 0, netUsd: 0 };
  }
  const fuelCostUsd = estimateFuelCostUsd(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId as FreighterClassId,
    offer.distanceNm,
    state,
  );
  const netUsd = money(offer.payUsd - fuelCostUsd);
  return { ok: netUsd > 0, fuelCostUsd, netUsd };
}

function routeLabelFor(
  legs: Array<{ originIcao: string; destIcao: string; ferryNm: number }>,
): string {
  if (legs.length === 0) return '';
  const parts = [legs[0]!.originIcao];
  for (const leg of legs) {
    const origin = leg.originIcao.trim().toUpperCase();
    if (parts[parts.length - 1] !== origin) parts.push(origin);
    parts.push(leg.destIcao.trim().toUpperCase());
  }
  return parts.join('→');
}

function assertOwnsBase(state: CareerMissionsState): void {
  const fbos = ensurePlayerFbos(state).fbos ?? [];
  if (fbos.length === 0) throw new Error('Buy a Base before Charter Search');
}

/**
 * Search open charter offers into 1–2 leg tours for a hired Base Dispatcher.
 */
export function listBaseDispatchCharterTours(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    hubIcao: string;
    aircraftId?: string;
    originIcao?: string;
    legs?: number;
    minNm?: number;
    maxNm?: number | null;
    maxFerryNm?: number | null;
    returnMode?: BaseCharterTourReturnMode;
    preferLeaveBase?: boolean;
    max?: number;
  },
): BaseCharterTour[] {
  assertOwnsBase(state);
  const policy = resolveBaseDispatchScoutPolicy(state);
  if (policy.mode !== 'fleet') {
    throw new Error(
      'Charter Search needs a hired Base Dispatcher — hire one on the desk first',
    );
  }

  const hub = opts.hubIcao.trim().toUpperCase();
  const preferLeaveBase = opts.preferLeaveBase !== false;
  const legCount = Math.max(
    1,
    Math.min(BASE_CHARTER_TOUR_LEGS_MAX, Math.floor(opts.legs ?? 1)),
  );
  const maxTours = Math.max(
    1,
    Math.min(BASE_DISPATCH_TOUR_MAX, opts.max ?? policy.max),
  );
  const returnMode = legCount === 1 ? 'none' : (opts.returnMode ?? 'none');
  const chainFerryMaxNm = resolveMaxFerryNm(opts.maxFerryNm);
  const firstFerryMaxNm = chainFerryMaxNm * 2;
  const regionByIcao = buildAirportRegionMap(world);
  const hubRegion = regionByIcao.get(hub) ?? null;
  const distCache = new Map<string, number>();

  const fleet = (state.fleet ?? []).filter((a) => {
    if (a.status !== 'parked') return false;
    if (!isCharterEligibleAircraftClass(a.aircraftClassId)) return false;
    if (opts.aircraftId && a.id !== opts.aircraftId) return false;
    return true;
  });
  if (fleet.length === 0) return [];

  const openOffers = (world.charterOffers ?? []).filter(
    (o) =>
      o.status === 'available' &&
      world.tick < o.expiresAtTick &&
      o.distanceNm >= CHARTER_MIN_DISTANCE_NM &&
      o.distanceNm <= CHARTER_MAX_DISTANCE_NM,
  );
  if (openOffers.length === 0) return [];

  const tours: BaseCharterTour[] = [];
  const seen = new Set<string>();

  const originFilter = (opts.originIcao ?? '').trim().toUpperCase();

  for (const acf of fleet) {
    const acfLoc = (acf.locationIcao ?? '').trim().toUpperCase();
    // Typed Origin → exact lock + region lens. Empty → any origin (ferry from aircraft).
    const startIcao = originFilter || acfLoc || hub;
    const firstLegRegion = originFilter
      ? (regionByIcao.get(originFilter) ?? hubRegion)
      : null;
    const minNm =
      opts.minNm != null && Number.isFinite(opts.minNm)
        ? Math.max(0, opts.minNm)
        : CHARTER_MIN_DISTANCE_NM;
    const maxNm =
      opts.maxNm != null && Number.isFinite(opts.maxNm) && opts.maxNm > 0
        ? opts.maxNm
        : null;

    type Cand = {
      offer: CharterOffer;
      ferryNm: number;
      fuelCostUsd: number;
      netUsd: number;
    };
    const first: Cand[] = [];
    for (const offer of openOffers) {
      const origin = offer.originIcao.trim().toUpperCase();
      if (originFilter && origin !== originFilter) continue;
      if (firstLegRegion) {
        const originRegion = regionByIcao.get(origin);
        if (!originRegion || originRegion !== firstLegRegion) continue;
      }
      if (offer.distanceNm < minNm) continue;
      if (maxNm != null && offer.distanceNm > maxNm) continue;
      const ferryNm = distNm(world, startIcao, origin, distCache);
      if (ferryNm > firstFerryMaxNm + 0.5) continue;
      const fit = offerFitsAircraft(offer, acf, state);
      if (!fit.ok) continue;
      first.push({
        offer,
        ferryNm,
        fuelCostUsd: fit.fuelCostUsd,
        netUsd: fit.netUsd,
      });
    }

    first.sort((a, b) => {
      let sa = a.netUsd - a.ferryNm * 0.12;
      let sb = b.netUsd - b.ferryNm * 0.12;
      if (preferLeaveBase) {
        if (a.offer.originIcao.toUpperCase() === hub) sa += LEAVE_BASE_BOOST;
        else sa -= LEAVE_BASE_NEIGHBOR_PENALTY;
        if (b.offer.originIcao.toUpperCase() === hub) sb += LEAVE_BASE_BOOST;
        else sb -= LEAVE_BASE_NEIGHBOR_PENALTY;
      }
      return sb - sa;
    });

    const firstSlice = first.slice(0, legCount === 1 ? 14 : 10);

    for (const l1 of firstSlice) {
      if (legCount === 1) {
        const leg = toLeg(l1);
        pushTour(acf, hub, [leg], preferLeaveBase, seen, tours, maxTours);
        if (tours.length >= maxTours) return sortTours(tours).slice(0, maxTours);
        continue;
      }

      const l1Dest = l1.offer.destIcao.trim().toUpperCase();
      const seconds: Cand[] = [];
      for (const offer of openOffers) {
        if (offer.id === l1.offer.id) continue;
        const origin = offer.originIcao.trim().toUpperCase();
        if (offer.distanceNm < minNm) continue;
        if (maxNm != null && offer.distanceNm > maxNm) continue;
        const ferryNm = distNm(world, l1Dest, origin, distCache);
        if (ferryNm > chainFerryMaxNm + 0.5) continue;
        const fit = offerFitsAircraft(offer, acf, state);
        if (!fit.ok) continue;
        if (returnMode === 'base' && offer.destIcao.toUpperCase() !== hub) {
          continue;
        }
        if (
          returnMode === 'origin' &&
          offer.destIcao.toUpperCase() !==
            l1.offer.originIcao.trim().toUpperCase()
        ) {
          continue;
        }
        seconds.push({
          offer,
          ferryNm,
          fuelCostUsd: fit.fuelCostUsd,
          netUsd: fit.netUsd,
        });
      }
      seconds.sort(
        (a, b) =>
          b.netUsd - b.ferryNm * 0.1 - (a.netUsd - a.ferryNm * 0.1),
      );
      for (const l2 of seconds.slice(0, 4)) {
        const legs = [toLeg(l1), toLeg(l2)];
        pushTour(acf, hub, legs, preferLeaveBase, seen, tours, maxTours);
        if (tours.length >= maxTours * 2) break;
      }
    }
  }

  return sortTours(tours).slice(0, maxTours);
}

function toLeg(c: {
  offer: CharterOffer;
  ferryNm: number;
  fuelCostUsd: number;
  netUsd: number;
}): BaseCharterTourLeg {
  return {
    offerId: c.offer.id,
    originIcao: c.offer.originIcao.trim().toUpperCase(),
    destIcao: c.offer.destIcao.trim().toUpperCase(),
    groupSize: c.offer.groupSize,
    baggageKg: c.offer.baggageKg,
    distanceNm: c.offer.distanceNm,
    ferryNm: money(c.ferryNm),
    payUsd: c.offer.payUsd,
    fuelCostUsd: c.fuelCostUsd,
    netUsd: c.netUsd,
    tier: c.offer.tier,
    expiresAtTick: c.offer.expiresAtTick,
  };
}

function pushTour(
  acf: PlayerAircraft,
  hub: string,
  legs: BaseCharterTourLeg[],
  preferLeaveBase: boolean,
  seen: Set<string>,
  tours: BaseCharterTour[],
  maxTours: number,
): void {
  const id = `${legs.map((l) => l.offerId).join('|')}|${acf.id}`;
  if (seen.has(id)) return;
  const totalDistanceNm = legs.reduce((s, l) => s + l.distanceNm, 0);
  const totalFerryNm = legs.reduce((s, l) => s + l.ferryNm, 0);
  const totalPayUsd = money(legs.reduce((s, l) => s + l.payUsd, 0));
  const totalNetUsd = money(legs.reduce((s, l) => s + l.netUsd, 0));
  if (
    !tourPassesQualityGate({
      totalDistanceNm,
      totalFerryNm,
      totalNetUsd,
    })
  ) {
    return;
  }
  let score = totalNetUsd - totalFerryNm * 0.12;
  if (preferLeaveBase && legs[0]?.originIcao === hub) score += LEAVE_BASE_BOOST;
  seen.add(id);
  tours.push({
    id,
    aircraftId: acf.id,
    aircraftLabel: acf.label ?? acf.registration ?? acf.id,
    aircraftLocationIcao: (acf.locationIcao ?? '').trim().toUpperCase(),
    hubIcao: hub,
    routeLabel: routeLabelFor(legs),
    legs,
    legCount: legs.length,
    totalDistanceNm: money(totalDistanceNm),
    totalFerryNm: money(totalFerryNm),
    totalPayUsd,
    totalNetUsd,
    score: money(score),
  });
  void maxTours;
}

function sortTours(tours: BaseCharterTour[]): BaseCharterTour[] {
  return tours.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.totalFerryNm !== b.totalFerryNm) return a.totalFerryNm - b.totalFerryNm;
    return b.totalNetUsd - a.totalNetUsd;
  });
}

export function prepareCharterActiveTour(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'>,
  opts: {
    aircraftId: string;
    hubIcao: string;
    tourId?: string;
    routeLabel?: string;
    legs: BaseCharterTourLeg[];
  },
): CharterActiveTour {
  if (opts.legs.length < 2) {
    throw new Error('Charter Active Tour needs 2 legs');
  }
  const aircraft = (state.fleet ?? []).find((a) => a.id === opts.aircraftId);
  if (!aircraft || aircraft.status !== 'parked') {
    throw new Error('Select a parked aircraft for this charter tour');
  }
  const freightTour = ensurePlayerFbos(state).activeTour;
  if (freightTour && freightTour.status === 'active') {
    throw new Error('Finish or drop the freight Active Tour first');
  }
  const existing = ensurePlayerFbos(state).charterActiveTour;
  if (existing && existing.status === 'active') {
    throw new Error('Finish or drop the charter Active Tour first');
  }

  const tour: CharterActiveTour = {
    id: opts.tourId ?? `chtour_${world.tick}_${Math.floor(Math.random() * 1e6)}`,
    aircraftId: opts.aircraftId,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    hubIcao: opts.hubIcao.trim().toUpperCase(),
    originIcao: opts.legs[0]!.originIcao,
    routeLabel: opts.routeLabel ?? routeLabelFor(opts.legs),
    legs: opts.legs.map((leg, i) => ({
      index: i + 1,
      offerId: leg.offerId,
      originIcao: leg.originIcao,
      destIcao: leg.destIcao,
      groupSize: leg.groupSize,
      baggageKg: leg.baggageKg,
      distanceNm: leg.distanceNm,
      ferryNm: leg.ferryNm,
      payUsd: leg.payUsd,
      fuelCostUsd: leg.fuelCostUsd,
      netUsd: leg.netUsd,
      status: 'planned' as const,
    })),
    startedAtTick: world.tick,
    status: 'active',
  };
  const roster = ensurePlayerFbos(state);
  roster.charterActiveTour = tour;
  state.playerFbos = roster;
  return tour;
}

export function dropCharterActiveTour(state: CareerMissionsState): void {
  const roster = ensurePlayerFbos(state);
  if (roster.charterActiveTour) {
    roster.charterActiveTour = {
      ...roster.charterActiveTour,
      status: 'abandoned',
    };
  }
  roster.charterActiveTour = null;
  state.playerFbos = roster;
}

export function bindCharterTourLegMission(
  state: CareerMissionsState,
  opts: { legIndex: number; missionId: string; offerId?: string },
): CharterActiveTour | null {
  const roster = ensurePlayerFbos(state);
  const tour = roster.charterActiveTour;
  if (!tour || tour.status !== 'active') return null;
  const leg = tour.legs.find((l) => l.index === opts.legIndex);
  if (!leg) throw new Error(`Unknown charter tour leg ${opts.legIndex}`);
  if (opts.offerId && leg.offerId !== opts.offerId) {
    throw new Error('Charter tour leg offer mismatch');
  }
  leg.missionId = opts.missionId;
  leg.status = 'active';
  state.playerFbos = roster;
  return tour;
}

export function syncCharterActiveTour(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): CharterActiveTour | null {
  const roster = ensurePlayerFbos(state);
  const tour = roster.charterActiveTour;
  if (!tour || tour.status !== 'active') return tour ?? null;

  for (const leg of tour.legs) {
    if (leg.status === 'done' || leg.status === 'lost') continue;
    const offer = (world.charterOffers ?? []).find((o) => o.id === leg.offerId);
    if (!offer || world.tick >= offer.expiresAtTick) {
      if (leg.status === 'planned') leg.status = 'lost';
    }
    if (leg.missionId) {
      const mission = state.missions.find((m) => m.id === leg.missionId);
      if (mission?.status === 'settled') leg.status = 'done';
      else if (
        mission &&
        (mission.status === 'accepted' ||
          mission.status === 'dispatched' ||
          mission.status === 'in_flight')
      ) {
        leg.status = 'active';
      }
    }
  }

  const allClosed = tour.legs.every(
    (l) => l.status === 'done' || l.status === 'lost',
  );
  if (allClosed) {
    tour.status = tour.legs.some((l) => l.status === 'done')
      ? 'completed'
      : 'abandoned';
    roster.charterActiveTour = null;
  }
  state.playerFbos = roster;
  return roster.charterActiveTour ?? (allClosed ? null : tour);
}

export function charterActiveTourView(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): {
  id: string;
  aircraftId: string;
  aircraftClassId: FreighterClassId;
  airframeTypeId?: string;
  hubIcao: string;
  originIcao: string;
  routeLabel: string;
  startedAtTick: number;
  status: CharterActiveTour['status'];
  nextLegIndex: number | null;
  canAcceptNextLeg: boolean;
  resumeHint?: string;
  legs: Array<
    CharterActiveTour['legs'][number] & {
      expiresAtTick: number | null;
      ticksRemaining: number | null;
      offerExpired: boolean;
    }
  >;
} | null {
  syncCharterActiveTour(state, world);
  const tour = ensurePlayerFbos(state).charterActiveTour;
  if (!tour || tour.status !== 'active') return null;
  const next = tour.legs.find(
    (l) => l.status === 'planned' || l.status === 'active',
  );
  const nextLegIndex = next?.index ?? null;
  const aircraft = (state.fleet ?? []).find((a) => a.id === tour.aircraftId);
  const atOrigin =
    Boolean(next) &&
    aircraft?.status === 'parked' &&
    (aircraft.locationIcao ?? '').trim().toUpperCase() ===
      next!.originIcao.toUpperCase();

  const legs = tour.legs.map((leg) => {
    const offer = (world.charterOffers ?? []).find((o) => o.id === leg.offerId);
    if (!offer) {
      return {
        ...leg,
        expiresAtTick: null as number | null,
        ticksRemaining: null as number | null,
        offerExpired: leg.status === 'planned' || leg.status === 'lost',
      };
    }
    const ticksRemaining = Math.max(0, offer.expiresAtTick - world.tick);
    const offerExpired =
      leg.status === 'planned' &&
      (world.tick >= offer.expiresAtTick || offer.status !== 'available');
    return {
      ...leg,
      expiresAtTick: offer.expiresAtTick,
      ticksRemaining,
      offerExpired,
    };
  });

  const nextOfferOk =
    Boolean(next) &&
    legs.some(
      (l) =>
        l.index === next!.index &&
        !l.offerExpired &&
        (world.charterOffers ?? []).some(
          (o) =>
            o.id === l.offerId &&
            o.status === 'available' &&
            world.tick < o.expiresAtTick,
        ),
    );
  const canAcceptNextLeg =
    Boolean(next) &&
    next!.status === 'planned' &&
    !next!.missionId &&
    atOrigin &&
    nextOfferOk &&
    !state.missions.some(
      (m) =>
        m.status === 'accepted' ||
        m.status === 'dispatched' ||
        m.status === 'in_flight',
    );
  return {
    id: tour.id,
    aircraftId: tour.aircraftId,
    aircraftClassId: tour.aircraftClassId,
    airframeTypeId: tour.airframeTypeId,
    hubIcao: tour.hubIcao,
    originIcao: tour.originIcao,
    routeLabel: tour.routeLabel,
    startedAtTick: tour.startedAtTick,
    status: tour.status,
    legs,
    nextLegIndex,
    canAcceptNextLeg,
    resumeHint: !next
      ? undefined
      : !nextOfferOk
        ? `L${next.index} offer expired — Drop tour`
        : !atOrigin
          ? `Ferry to ${next.originIcao} for L${next.index}`
          : canAcceptNextLeg
            ? `Accept L${next.index}`
            : undefined,
  };
}
