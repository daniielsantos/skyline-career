import type { MissionIntent, MissionStatus } from './types/career-economy.js';

/** Minimal live gates used for career auto-depart / auto-settle. */
export interface FlightGroundSample {
  onGround: boolean;
  enginesRunning: boolean;
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
  | { type: 'none' };

export interface EvaluateMissionFlightOpts {
  /** When true, settle only after engines are off on the ground. Default true. */
  requireEnginesOffToSettle?: boolean;
  /** Auto-depart from these statuses. */
  departFrom?: readonly MissionStatus[];
}

const DEFAULT_DEPART_FROM: readonly MissionStatus[] = ['accepted', 'dispatched'];

export function createMissionFlightWatchState(): MissionFlightWatchState {
  return { sawAirborne: false };
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
      event: {
        type: 'settle',
        reason: requireEnginesOff
          ? 'touchdown + engines off'
          : 'touchdown (SIM ON GROUND true)',
      },
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
    // Keep lastOnGround true so we don't re-fire touchdown every tick;
    // settle when engines go cold while still on ground.
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
    // Engines shut down after landing (already on ground last tick).
    return {
      event: {
        type: 'settle',
        reason: 'engines off after landing',
      },
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
