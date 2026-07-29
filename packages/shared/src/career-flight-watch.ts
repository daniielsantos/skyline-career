import {
  DEFAULT_SETTLE_RADIUS_NM,
  isNearAirport,
} from './career-economy.js';
import type { MissionIntent, MissionStatus } from './types/career-economy.js';

/** Minimal live gates used for career auto-depart / auto-settle. */
export interface FlightGroundSample {
  onGround: boolean;
  enginesRunning: boolean;
  /** Optional aircraft position (degrees). */
  position?: { lat: number; lon: number };
}

export interface MissionFlightWatchState {
  /** True once we observed wheels-up for this watch session. */
  sawAirborne: boolean;
  /** Previous sample onGround; undefined until first sample. */
  lastOnGround?: boolean;
}

export type MissionFlightEvent =
  | { type: 'depart'; reason: string }
  | { type: 'settle'; reason: string }
  | {
      type: 'settle_blocked';
      reason: string;
      distanceNm?: number;
    }
  | { type: 'none' };

export interface EvaluateMissionFlightOpts {
  /** When true, settle only after engines are off on the ground. Default true. */
  requireEnginesOffToSettle?: boolean;
  /** Auto-depart from these statuses. */
  departFrom?: readonly MissionStatus[];
  /** Destination airport coords for proximity gate. */
  destCoords?: { lat: number; lon: number };
  /** Max distance from dest to allow settle (nm). Default 12. */
  settleRadiusNm?: number;
  /**
   * When true (default), require live position near dest to settle.
   * If position is missing while required, settle is blocked.
   */
  requireDestProximity?: boolean;
}

const DEFAULT_DEPART_FROM: readonly MissionStatus[] = ['accepted', 'dispatched'];

export function createMissionFlightWatchState(): MissionFlightWatchState {
  return { sawAirborne: false };
}

function gateSettleByDestination(
  sample: FlightGroundSample,
  opts: EvaluateMissionFlightOpts,
  baseReason: string,
): MissionFlightEvent {
  const requireProximity = opts.requireDestProximity !== false;
  if (!requireProximity) {
    return { type: 'settle', reason: baseReason };
  }

  const dest = opts.destCoords;
  if (!dest) {
    return {
      type: 'settle_blocked',
      reason: `${baseReason}, but destination coords unknown — cannot verify airport`,
    };
  }

  const pos = sample.position;
  if (!pos) {
    return {
      type: 'settle_blocked',
      reason: `${baseReason}, but aircraft position unavailable — cannot verify destination`,
    };
  }

  const radius = opts.settleRadiusNm ?? DEFAULT_SETTLE_RADIUS_NM;
  const { near, distanceNm } = isNearAirport(pos, dest, radius);
  if (!near) {
    return {
      type: 'settle_blocked',
      reason: `${baseReason}, but ${distanceNm.toFixed(1)} nm from dest (need ≤${radius} nm)`,
      distanceNm,
    };
  }

  return {
    type: 'settle',
    reason: `${baseReason} near dest (${distanceNm.toFixed(1)} nm)`,
  };
}

/**
 * Edge-detect wheels-up → depart and touchdown → settle for an active mission.
 * Pure function — caller applies departMission / settleMission and persists.
 */
export function evaluateMissionFlightTransition(
  mission: MissionIntent,
  sample: FlightGroundSample,
  state: MissionFlightWatchState,
  opts: EvaluateMissionFlightOpts = {},
): { event: MissionFlightEvent; nextState: MissionFlightWatchState } {
  const requireEnginesOff = opts.requireEnginesOffToSettle !== false;
  const departFrom = opts.departFrom ?? DEFAULT_DEPART_FROM;

  const nextState: MissionFlightWatchState = {
    sawAirborne: state.sawAirborne || !sample.onGround,
    lastOnGround: sample.onGround,
  };

  // Bootstrap: record first sample without firing transitions.
  if (state.lastOnGround === undefined) {
    return { event: { type: 'none' }, nextState };
  }

  const leftGround = state.lastOnGround === true && sample.onGround === false;
  const touchedDown = state.lastOnGround === false && sample.onGround === true;

  if (leftGround && departFrom.includes(mission.status)) {
    return {
      event: {
        type: 'depart',
        reason: 'wheels-up (SIM ON GROUND false)',
      },
      nextState,
    };
  }

  if (
    touchedDown &&
    mission.status === 'in_flight' &&
    (state.sawAirborne || nextState.sawAirborne) &&
    (!requireEnginesOff || !sample.enginesRunning)
  ) {
    return {
      event: gateSettleByDestination(
        sample,
        opts,
        requireEnginesOff ? 'touchdown + engines off' : 'touchdown (SIM ON GROUND true)',
      ),
      nextState,
    };
  }

  // Touchdown with engines still running: wait (taxi-in) unless disabled.
  if (
    touchedDown &&
    mission.status === 'in_flight' &&
    requireEnginesOff &&
    sample.enginesRunning
  ) {
    return { event: { type: 'none' }, nextState };
  }

  if (
    mission.status === 'in_flight' &&
    sample.onGround &&
    (state.sawAirborne || nextState.sawAirborne) &&
    requireEnginesOff &&
    state.lastOnGround === true &&
    sample.enginesRunning === false
  ) {
    return {
      event: gateSettleByDestination(sample, opts, 'engines off after landing'),
      nextState,
    };
  }

  return { event: { type: 'none' }, nextState };
}

export function pickActiveMission(
  missions: MissionIntent[],
  missionId?: string,
): MissionIntent | undefined {
  if (missionId) {
    return missions.find((m) => m.id === missionId);
  }
  const active = missions.filter(
    (m) => m.status === 'accepted' || m.status === 'dispatched' || m.status === 'in_flight',
  );
  return active[active.length - 1];
}
