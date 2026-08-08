/**
 * Accept / abandon / per-leg progress for unified bush trips.
 * Watch advances legs via departBushTripLeg / settleBushTripLeg.
 */

import {
  getBushTrip,
  isBushTripPlayable,
  bushTripLegDistanceNm,
  bushTripTotalDistanceNm,
  type BushTripDef,
  type BushTripLeg,
} from './career-bush-trips.js';
import { bushTripActivitiesPlnFile } from './career-bush-pln.js';
import { CAREER_HUB_COORDS } from './career-economy.js';
import {
  assignAircraftToMission,
  findPlayerAircraft,
} from './career-fleet.js';
import { applyWalletDelta } from './career-ledger.js';
import {
  createMissionFlightWatchState,
  evaluateMissionFlightTransition,
  type FlightGroundSample,
  type MissionFlightEvent,
  type MissionFlightWatchState,
} from './career-flight-watch.js';
import type {
  ActiveBushTrip,
  CareerMissionsState,
  MissionIntent,
  MissionStatus,
  PlayerAircraft,
} from './types/career-economy.js';

export function bushTripAssignmentId(tripId: string): string {
  return `bush:${tripId.trim()}`;
}

/** Active = accepted or in_progress (board / Watch). */
export function isBushTripActive(
  state: CareerMissionsState,
): ActiveBushTrip | undefined {
  const active = state.activeBushTrip;
  if (!active) return undefined;
  if (active.status !== 'accepted' && active.status !== 'in_progress') {
    return undefined;
  }
  return active;
}

export type BushTripBoardRow = {
  id: string;
  title: string;
  countryId: string;
  summary?: string;
  legs: number;
  distanceNm: number;
  payUsd: number;
  startIcao: string;
  endIcao: string;
  /** First intermediate hub ICAO for route display (round-trips). */
  viaIcao?: string;
  aircraftHint: 'light_ga';
  /** False = catalog draft; Accept disabled until MSFS validation. */
  playable: boolean;
  /** True when an Activities .PLN can be downloaded for the MSFS tablet. */
  hasPln: boolean;
};

export function bushTripToBoardRow(trip: BushTripDef): BushTripBoardRow {
  const first = trip.legs[0]!;
  const last = trip.legs[trip.legs.length - 1]!;
  const via =
    trip.legs.length >= 2 ? trip.legs[0]!.toIcao.toUpperCase() : undefined;
  return {
    id: trip.id,
    title: trip.title,
    countryId: trip.countryId,
    ...(trip.summary ? { summary: trip.summary } : {}),
    legs: trip.legs.length,
    distanceNm: bushTripTotalDistanceNm(trip),
    payUsd: typeof trip.payUsd === 'number' ? trip.payUsd : 0,
    startIcao: first.fromIcao.toUpperCase(),
    endIcao: last.toIcao.toUpperCase(),
    ...(via && via !== first.fromIcao.toUpperCase() ? { viaIcao: via } : {}),
    aircraftHint: 'light_ga',
    playable: isBushTripPlayable(trip),
    hasPln: Boolean(bushTripActivitiesPlnFile(trip.id)),
  };
}

export type AcceptBushTripOpts = {
  tripId: string;
  aircraftId: string;
  tick: number;
};

export type AcceptBushTripResult = {
  state: CareerMissionsState;
  active: ActiveBushTrip;
  trip: BushTripDef;
  aircraft: PlayerAircraft;
};

export function acceptBushTrip(
  state: CareerMissionsState,
  opts: AcceptBushTripOpts,
): AcceptBushTripResult {
  const tripId = opts.tripId.trim();
  const trip = getBushTrip(tripId);
  if (!trip) throw new Error(`Unknown bush trip ${tripId}`);
  if (!isBushTripPlayable(trip)) {
    throw new Error(`Bush trip ${tripId} is not playable yet (MSFS validation)`);
  }
  if (isBushTripActive(state)) {
    throw new Error('A bush trip is already active — abandon it first');
  }

  const startIcao = trip.legs[0]!.fromIcao.trim().toUpperCase();
  const aircraft = findPlayerAircraft(state, opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  if (aircraft.aircraftClassId !== 'light_ga') {
    throw new Error(
      `Bush trips require light GA (got ${aircraft.aircraftClassId})`,
    );
  }

  const assignmentId = bushTripAssignmentId(trip.id);
  assignAircraftToMission(state, opts.aircraftId, assignmentId, startIcao);

  const active: ActiveBushTrip = {
    tripId: trip.id,
    legIndex: 0,
    legStatus: 'ready',
    status: 'accepted',
    aircraftId: opts.aircraftId,
    acceptedAtTick: Math.max(0, Math.floor(opts.tick)),
  };
  state.activeBushTrip = active;
  return { state, active, trip, aircraft };
}

export type AbandonBushTripResult = {
  state: CareerMissionsState;
  active: ActiveBushTrip;
  aircraft?: PlayerAircraft;
};

export function abandonBushTrip(
  state: CareerMissionsState,
  opts: { tick: number } = { tick: 0 },
): AbandonBushTripResult {
  const active = isBushTripActive(state);
  if (!active) {
    throw new Error('No active bush trip to abandon');
  }

  const aircraft = findPlayerAircraft(state, active.aircraftId);
  if (aircraft && aircraft.assignedMissionId === bushTripAssignmentId(active.tripId)) {
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
  }

  const cancelled: ActiveBushTrip = {
    ...active,
    status: 'cancelled',
    cancelledAtTick: Math.max(0, Math.floor(opts.tick)),
  };
  state.activeBushTrip = cancelled;
  return { state, active: cancelled, aircraft };
}

export function currentBushTripLeg(
  active: ActiveBushTrip,
  trip: BushTripDef = getBushTrip(active.tripId)!,
): BushTripLeg {
  const leg = trip.legs[active.legIndex];
  if (!leg) {
    throw new Error(
      `Bush trip ${active.tripId} has no leg at index ${active.legIndex}`,
    );
  }
  return leg;
}

/** Map bush leg phase → MissionStatus for evaluateMissionFlightTransition. */
export function bushLegMissionStatus(
  legStatus: ActiveBushTrip['legStatus'],
): MissionStatus {
  return legStatus === 'departed' ? 'in_flight' : 'dispatched';
}

export function syntheticBushLegMission(
  active: ActiveBushTrip,
  leg: BushTripLeg,
  aircraftClassId = 'light_ga',
): MissionIntent {
  return {
    id: bushTripAssignmentId(active.tripId),
    lots: [],
    shipmentLotId: '',
    commodityId: 'general',
    originIcao: leg.fromIcao.toUpperCase(),
    destIcao: leg.toIcao.toUpperCase(),
    cargoKg: leg.cargoKg,
    pax: 0,
    aircraftClassId: aircraftClassId as MissionIntent['aircraftClassId'],
    rolesPackRelPath: '',
    deadlineTick: 0,
    payUsd: 0,
    urgency: 'normal',
    reason: 'bush-trip-leg',
    status: bushLegMissionStatus(active.legStatus),
    acceptedAtTick: active.acceptedAtTick,
    aircraftId: active.aircraftId,
    ...(typeof active.departedAtMs === 'number'
      ? { airborneAtMs: active.departedAtMs }
      : {}),
  };
}

export type DepartBushTripLegResult = {
  state: CareerMissionsState;
  active: ActiveBushTrip;
};

export function departBushTripLeg(
  state: CareerMissionsState,
  opts: { nowMs?: number } = {},
): DepartBushTripLegResult {
  const active = isBushTripActive(state);
  if (!active) throw new Error('No active bush trip');
  if (active.legStatus === 'departed') {
    return { state, active };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const next: ActiveBushTrip = {
    ...active,
    status: 'in_progress',
    legStatus: 'departed',
    departedAtMs: nowMs,
  };
  state.activeBushTrip = next;
  return { state, active: next };
}

export type SettleBushTripLegResult = {
  state: CareerMissionsState;
  active: ActiveBushTrip;
  trip: BushTripDef;
  /** True when the whole arc finished and payout was applied. */
  completed: boolean;
  payoutUsd: number;
  aircraft?: PlayerAircraft;
};

export function settleBushTripLeg(
  state: CareerMissionsState,
  opts: { tick: number; nowMs?: number } = { tick: 0 },
): SettleBushTripLegResult {
  const active = isBushTripActive(state);
  if (!active) throw new Error('No active bush trip');
  if (active.legStatus !== 'departed') {
    throw new Error('Current bush leg has not departed yet');
  }
  const trip = getBushTrip(active.tripId);
  if (!trip) throw new Error(`Unknown bush trip ${active.tripId}`);
  const leg = currentBushTripLeg(active, trip);
  const dest = leg.toIcao.trim().toUpperCase();
  const tick = Math.max(0, Math.floor(opts.tick));
  const aircraft = findPlayerAircraft(state, active.aircraftId);

  const isLast = active.legIndex >= trip.legs.length - 1;
  if (!isLast) {
    const nextIndex = active.legIndex + 1;
    if (aircraft) {
      aircraft.locationIcao = dest;
      if (state.pilotIcao) state.pilotIcao = dest;
    }
    const next: ActiveBushTrip = {
      ...active,
      legIndex: nextIndex,
      legStatus: 'ready',
      status: 'in_progress',
      departedAtMs: undefined,
    };
    state.activeBushTrip = next;
    return {
      state,
      active: next,
      trip,
      completed: false,
      payoutUsd: 0,
      aircraft,
    };
  }

  const payoutUsd =
    typeof trip.payUsd === 'number' && Number.isFinite(trip.payUsd)
      ? Math.max(0, Math.round(trip.payUsd))
      : 0;
  if (payoutUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: payoutUsd,
      kind: 'freight_payout',
      atTick: tick,
      note: `Bush trip ${trip.title}`,
      aircraftId: active.aircraftId,
      missionId: bushTripAssignmentId(trip.id),
      icao: dest,
    });
  }
  if (aircraft && aircraft.assignedMissionId === bushTripAssignmentId(trip.id)) {
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
    aircraft.locationIcao = dest;
  }
  if (state.pilotIcao) state.pilotIcao = dest;

  const completed: ActiveBushTrip = {
    ...active,
    legStatus: 'ready',
    status: 'completed',
    completedAtTick: tick,
    departedAtMs: undefined,
  };
  state.activeBushTrip = completed;
  return {
    state,
    active: completed,
    trip,
    completed: true,
    payoutUsd,
    aircraft,
  };
}

/** Clear a finished (completed/cancelled) bush trip from missions state. */
export function clearInactiveBushTrip(state: CareerMissionsState): void {
  const active = state.activeBushTrip;
  if (!active) return;
  if (active.status === 'completed' || active.status === 'cancelled') {
    delete state.activeBushTrip;
  }
}

export function bushTripLegDestCoords(
  leg: BushTripLeg,
): { lat: number; lon: number } | undefined {
  return CAREER_HUB_COORDS[leg.toIcao.trim().toUpperCase()];
}

export function evaluateBushTripLegTransition(
  active: ActiveBushTrip,
  sample: FlightGroundSample,
  watchState: MissionFlightWatchState,
  opts: {
    nowMs?: number;
    settleRadiusNm?: number;
    requireEnginesOff?: boolean;
    aircraftClassId?: string;
  } = {},
): { event: MissionFlightEvent; nextState: MissionFlightWatchState } {
  const trip = getBushTrip(active.tripId);
  if (!trip) {
    return {
      event: { type: 'none' },
      nextState: watchState,
    };
  }
  const leg = currentBushTripLeg(active, trip);
  const mission = syntheticBushLegMission(
    active,
    leg,
    opts.aircraftClassId ?? 'light_ga',
  );
  const distanceNm = bushTripLegDistanceNm(leg);
  const destCoords = bushTripLegDestCoords(leg);
  return evaluateMissionFlightTransition(mission, sample, watchState, {
    nowMs: opts.nowMs,
    distanceNm,
    destCoords,
    settleRadiusNm: opts.settleRadiusNm ?? 12,
    requireEnginesOffToSettle: opts.requireEnginesOff !== false,
    requireDestProximity: true,
    departFrom: ['dispatched'],
  });
}

export { createMissionFlightWatchState };

export function normalizeActiveBushTrip(
  raw: unknown,
): ActiveBushTrip | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const tripId = typeof row.tripId === 'string' ? row.tripId.trim() : '';
  const aircraftId =
    typeof row.aircraftId === 'string' ? row.aircraftId.trim() : '';
  const status =
    row.status === 'accepted' ||
    row.status === 'in_progress' ||
    row.status === 'completed' ||
    row.status === 'cancelled'
      ? row.status
      : null;
  const legStatus =
    row.legStatus === 'departed' || row.legStatus === 'ready'
      ? row.legStatus
      : 'ready';
  const legIndex =
    typeof row.legIndex === 'number' && Number.isFinite(row.legIndex)
      ? Math.max(0, Math.round(row.legIndex))
      : 0;
  const acceptedAtTick =
    typeof row.acceptedAtTick === 'number' && Number.isFinite(row.acceptedAtTick)
      ? Math.max(0, Math.floor(row.acceptedAtTick))
      : 0;
  if (!tripId || !aircraftId || !status) return undefined;
  return {
    tripId,
    legIndex,
    legStatus,
    status,
    aircraftId,
    acceptedAtTick,
    ...(typeof row.departedAtMs === 'number' && Number.isFinite(row.departedAtMs)
      ? { departedAtMs: Math.max(0, Math.floor(row.departedAtMs)) }
      : {}),
    ...(typeof row.cancelledAtTick === 'number' &&
    Number.isFinite(row.cancelledAtTick)
      ? { cancelledAtTick: Math.max(0, Math.floor(row.cancelledAtTick)) }
      : {}),
    ...(typeof row.completedAtTick === 'number' &&
    Number.isFinite(row.completedAtTick)
      ? { completedAtTick: Math.max(0, Math.floor(row.completedAtTick)) }
      : {}),
  };
}

/** Ordered ICAO + VFR points for map polyline (hubs need client coord resolve). */
export type BushTripMapNode =
  | { kind: 'hub'; icao: string }
  | { kind: 'wpt'; ident: string; lat: number; lon: number };

export function bushTripMapNodes(trip: BushTripDef): BushTripMapNode[] {
  const nodes: BushTripMapNode[] = [];
  const pushHub = (icao: string) => {
    const code = icao.trim().toUpperCase();
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'hub' && last.icao === code) return;
    nodes.push({ kind: 'hub', icao: code });
  };
  for (const leg of trip.legs) {
    pushHub(leg.fromIcao);
    for (const wp of leg.waypoints) {
      if (!Number.isFinite(wp.lat) || !Number.isFinite(wp.lon)) continue;
      nodes.push({
        kind: 'wpt',
        ident: (wp.name ?? 'WP').slice(0, 24),
        lat: wp.lat,
        lon: wp.lon,
      });
    }
    pushHub(leg.toIcao);
  }
  return nodes;
}
