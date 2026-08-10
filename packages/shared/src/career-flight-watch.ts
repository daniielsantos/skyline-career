import {
  DEFAULT_SETTLE_RADIUS_NM,
  isNearAirport,
} from './career-economy.js';
import type { MissionIntent, MissionStatus } from './types/career-economy.js';

/** Minimum airborne wall-clock fraction of planned route time before settle. */
export const MIN_AIRBORNE_TIME_RATIO = 0.7;
/** Short hops finish faster than OFP/estimate — lower gate below this distance. */
export const MIN_AIRBORNE_TIME_RATIO_SHORT = 0.5;
/** Great-circle / planned distance (nm) under which the short-hop ratio applies. */
export const SHORT_ROUTE_AIRBORNE_NM = 100;

/** Enter taxi when ground speed reaches this (kt). */
export const TAXI_GROUND_SPEED_KT = 5;
/** Stay in taxi until ground speed drops below this (kt) — hysteresis vs jitter. */
export const TAXI_GROUND_SPEED_EXIT_KT = 2;

/**
 * Min ground speed (kt) to treat SIM ON GROUND=false as real wheels-up.
 * A single onGround flicker at 0 kt must not auto-depart the mission.
 */
export const DEPART_MIN_GROUND_SPEED_KT = 30;
/** Min AGL (ft) that also counts as convincing wheels-up. */
export const DEPART_MIN_AGL_FT = 40;
/**
 * Consecutive airborne samples required when GS/AGL are missing/unreliable.
 * With short-final poll (~200 ms) this is still under a second.
 */
export const DEPART_CONFIRM_TICKS = 2;

/** True when the sample looks like real flight, not a SIM ON GROUND blip. */
export function isConvincingAirborne(sample: FlightGroundSample): boolean {
  if (sample.onGround) return false;
  const gs = sample.groundSpeedKt;
  const agl = sample.aglFt;
  const gsOk =
    typeof gs === 'number' &&
    Number.isFinite(gs) &&
    gs >= DEPART_MIN_GROUND_SPEED_KT;
  const aglOk =
    typeof agl === 'number' &&
    Number.isFinite(agl) &&
    agl >= DEPART_MIN_AGL_FT;
  return gsOk || aglOk;
}

/** Minimal live gates used for career auto-depart / auto-settle. */
export interface FlightGroundSample {
  onGround: boolean;
  enginesRunning: boolean;
  /** Optional aircraft position (degrees). */
  position?: { lat: number; lon: number };
  /** Optional ground speed (knots) for taxi phase display. */
  groundSpeedKt?: number;
  /** Live vertical speed (feet per minute). Negative = descending. */
  verticalSpeedFpm?: number;
  /** Height above ground (feet) — used to separate bounce vs go-around. */
  aglFt?: number;
}

/**
 * Human/telemetry phase from a live sample.
 * Mission status still only advances on wheels-up / settle — taxi is display-only.
 * Pass `prevPhase` to keep taxi sticky across brief GS dips.
 */
export function flightPhaseFromSample(
  sample: FlightGroundSample,
  prevPhase?: string | null,
): string {
  if (!sample.onGround) return 'airborne';
  const gs = sample.groundSpeedKt;
  const wasTaxi = prevPhase === 'taxi';
  const threshold = wasTaxi ? TAXI_GROUND_SPEED_EXIT_KT : TAXI_GROUND_SPEED_KT;
  const moving =
    typeof gs === 'number' && Number.isFinite(gs) && gs >= threshold;
  if (sample.enginesRunning && moving) return 'taxi';
  return sample.enginesRunning ? 'ground+engines' : 'ground';
}

export interface MissionFlightWatchState {
  /** True once we observed wheels-up for this watch session. */
  sawAirborne: boolean;
  /** Previous sample onGround; undefined until first sample. */
  lastOnGround?: boolean;
  /**
   * Consecutive !onGround samples while still accepted/dispatched.
   * Used when GS/AGL are missing so a one-tick flicker cannot depart.
   */
  airborneConfirmTicks?: number;
  /** Wall-clock when the aircraft first left the ground (or watch saw airborne). */
  airborneAtMs?: number;
  /**
   * Wall-clock when wheels touched down after airborne.
   * Freezes the airborne elapsed clock for the settle gate / UI.
   */
  airborneEndedAtMs?: number;
  /** Planned route duration in wall-clock ms (OFP air time; may tighten after cruise TAS). */
  expectedRouteMs?: number;
  /** Route distance (nm) used to pick short-hop vs normal airborne ratio. */
  routeDistanceNm?: number;
  /** Last vertical speed while airborne (fpm) — used to stamp landing rate. */
  lastAirborneVsFpm?: number;
  /**
   * Vertical speed at first touchdown (fpm, typically negative).
   * Captured once per watch session.
   */
  landingFpm?: number;
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
  /** Wall-clock now (defaults to Date.now()). */
  nowMs?: number;
  /**
   * Planned route duration. When omitted, derived from OFP block time /
   * briefing distance / fallbackHours.
   */
  expectedRouteMs?: number;
  /** Great-circle distance used when OFP block time is missing. */
  distanceNm?: number;
  /** Fallback block hours when OFP + distance unavailable. */
  fallbackHours?: number;
}

const DEFAULT_DEPART_FROM: readonly MissionStatus[] = ['accepted', 'dispatched'];

const CRUISE_KT: Record<string, number> = {
  narrow_freighter: 430,
  wide_freighter: 480,
  medium_piston: 290,
  light_jet: 430,
  light_turboprop: 185,
  light_ga: 170,
};

export function createMissionFlightWatchState(
  seed: Partial<MissionFlightWatchState> = {},
): MissionFlightWatchState {
  return {
    sawAirborne: seed.sawAirborne ?? false,
    lastOnGround: seed.lastOnGround,
    airborneConfirmTicks: seed.airborneConfirmTicks,
    airborneAtMs: seed.airborneAtMs,
    airborneEndedAtMs: seed.airborneEndedAtMs,
    expectedRouteMs: seed.expectedRouteMs,
    routeDistanceNm: seed.routeDistanceNm,
    lastAirborneVsFpm: seed.lastAirborneVsFpm,
    landingFpm: seed.landingFpm,
  };
}

/**
 * Merge Watch airborne clock onto a persisted mission.
 * Returns null when nothing new to write (caller skips save).
 *
 * Prefers the larger airborneElapsedMs (progress). expectedRouteMs keeps the
 * shorter positive stamp so an OFP plan can tighten after cruise TAS rebase
 * without a later longer estimate stretching the settle gate. airborneAtMs is
 * re-based on resume so offline time does not inflate the settle gate.
 */
export function mergeAirborneClockOntoMission(
  mission: MissionIntent,
  clock: {
    airborneAtMs?: number;
    airborneElapsedMs?: number;
    expectedRouteMs?: number;
  },
): MissionIntent | null {
  // Only persist the settle gate onto in-flight legs. Stamping accepted/dispatched
  // (e.g. SIM ON GROUND flicker while still preparing) left "settle unlocked"
  // on the ramp after restart.
  if (mission.status !== 'in_flight') {
    return null;
  }
  const clockElapsed =
    typeof clock.airborneElapsedMs === 'number' &&
    Number.isFinite(clock.airborneElapsedMs)
      ? Math.max(0, clock.airborneElapsedMs)
      : typeof clock.airborneAtMs === 'number' &&
          Number.isFinite(clock.airborneAtMs)
        ? Math.max(0, Date.now() - clock.airborneAtMs)
        : undefined;
  const prevElapsed =
    typeof mission.airborneElapsedMs === 'number' &&
    Number.isFinite(mission.airborneElapsedMs)
      ? Math.max(0, mission.airborneElapsedMs)
      : undefined;
  const nextElapsed =
    clockElapsed != null || prevElapsed != null
      ? Math.max(clockElapsed ?? 0, prevElapsed ?? 0)
      : undefined;
  const nextAirborneAtMs =
    typeof clock.airborneAtMs === 'number' && Number.isFinite(clock.airborneAtMs)
      ? clock.airborneAtMs
      : mission.airborneAtMs;
  const clockExpected =
    typeof clock.expectedRouteMs === 'number' &&
    Number.isFinite(clock.expectedRouteMs) &&
    clock.expectedRouteMs > 0
      ? clock.expectedRouteMs
      : undefined;
  const missionExpected =
    typeof mission.expectedRouteMs === 'number' &&
    Number.isFinite(mission.expectedRouteMs) &&
    mission.expectedRouteMs > 0
      ? mission.expectedRouteMs
      : undefined;
  const nextExpectedRouteMs =
    clockExpected != null && missionExpected != null
      ? Math.min(missionExpected, clockExpected)
      : (clockExpected ?? missionExpected ?? mission.expectedRouteMs);
  if (
    nextAirborneAtMs === mission.airborneAtMs &&
    nextElapsed === mission.airborneElapsedMs &&
    nextExpectedRouteMs === mission.expectedRouteMs
  ) {
    return null;
  }
  return {
    ...mission,
    airborneAtMs: nextAirborneAtMs,
    ...(nextElapsed != null ? { airborneElapsedMs: nextElapsed } : {}),
    expectedRouteMs: nextExpectedRouteMs,
  };
}

/** Re-base airborneAtMs so elapsed resumes from saved progress (skips offline gap). */
export function resumeAirborneAtMs(opts: {
  nowMs: number;
  airborneAtMs?: number;
  airborneElapsedMs?: number;
}): number | undefined {
  const elapsed =
    typeof opts.airborneElapsedMs === 'number' &&
    Number.isFinite(opts.airborneElapsedMs)
      ? Math.max(0, opts.airborneElapsedMs)
      : undefined;
  if (elapsed != null) {
    return opts.nowMs - elapsed;
  }
  if (
    typeof opts.airborneAtMs === 'number' &&
    Number.isFinite(opts.airborneAtMs)
  ) {
    return opts.airborneAtMs;
  }
  return undefined;
}

/** Parse SimBrief-style `HH:MM` block time into milliseconds. */
export function parseBlockTimeToMs(blockTime: string | undefined): number | undefined {
  if (!blockTime) return undefined;
  const match = blockTime.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return Math.max(0, Math.round((hours * 60 + minutes) * 60_000));
}

export function estimateRouteMsFromDistance(
  distanceNm: number,
  aircraftClassId: string,
): number {
  const cruise = CRUISE_KT[aircraftClassId] ?? 430;
  // Short legs: climb/descent padding scales down — avoid the old 30 min floor
  // that made an 86 NM GA hop look like an hour.
  const padHours = Math.min(0.35, Math.max(0.08, distanceNm / 400));
  const hours = Math.max(0.12, distanceNm / Math.max(1, cruise) + padHours);
  return Math.round(hours * 3_600_000);
}

/**
 * Floor when rebasing planned air time from a live cruise TAS sample.
 * Keeps the ≥70% settle gate from collapsing under a spuriously high TAS.
 */
export const CRUISE_REBASE_MIN_FRAC_OF_PLANNED = 0.55;

/** Ignore tiny deltas when deciding whether cruise rebase changed the plan. */
export const CRUISE_REBASE_MIN_DELTA_MS = 15_000;

/**
 * Climb/descent pad (hours) for cruise-based air-time estimates — same curve as
 * {@link estimateRouteMsFromDistance}.
 */
export function climbDescentPadHours(distanceNm: number): number {
  return Math.min(0.35, Math.max(0.08, distanceNm / 400));
}

/**
 * Estimate total airborne duration from route distance + observed cruise TAS.
 * Pure cruise time plus climb/descent pad (not OFP airTime).
 */
export function estimateRouteMsFromCruiseSpeed(opts: {
  distanceNm: number;
  cruiseSpeedKt: number;
}): number | null {
  const distanceNm = opts.distanceNm;
  const cruiseSpeedKt = opts.cruiseSpeedKt;
  if (
    !(typeof distanceNm === 'number' && Number.isFinite(distanceNm) && distanceNm > 0)
  ) {
    return null;
  }
  if (
    !(
      typeof cruiseSpeedKt === 'number' &&
      Number.isFinite(cruiseSpeedKt) &&
      cruiseSpeedKt >= 60
    )
  ) {
    return null;
  }
  const padHours = climbDescentPadHours(distanceNm);
  const hours = Math.max(0.12, distanceNm / cruiseSpeedKt + padHours);
  return Math.round(hours * 3_600_000);
}

/**
 * Tighten planned air time once stable cruise TAS is known.
 * Never lengthens the gate; never drops below {@link CRUISE_REBASE_MIN_FRAC_OF_PLANNED}
 * of the original OFP/plan. The ≥70% (or 50% short-hop) settle ratio still applies
 * to the rebased value.
 */
export function rebaseExpectedRouteMsFromCruise(opts: {
  /** Original OFP / distance plan at wheels-up (floor reference). */
  plannedExpectedRouteMs: number;
  /** Current gate denominator (may already be rebased). */
  currentExpectedRouteMs?: number;
  distanceNm: number;
  cruiseSpeedKt: number;
}): {
  expectedRouteMs: number;
  estimatedMs: number | null;
  changed: boolean;
} {
  const planned = opts.plannedExpectedRouteMs;
  const current =
    typeof opts.currentExpectedRouteMs === 'number' &&
    Number.isFinite(opts.currentExpectedRouteMs) &&
    opts.currentExpectedRouteMs > 0
      ? opts.currentExpectedRouteMs
      : planned;
  if (!(typeof planned === 'number' && Number.isFinite(planned) && planned > 0)) {
    return {
      expectedRouteMs: current,
      estimatedMs: null,
      changed: false,
    };
  }
  const estimatedMs = estimateRouteMsFromCruiseSpeed({
    distanceNm: opts.distanceNm,
    cruiseSpeedKt: opts.cruiseSpeedKt,
  });
  if (estimatedMs == null) {
    return { expectedRouteMs: current, estimatedMs: null, changed: false };
  }
  const floorMs = Math.round(planned * CRUISE_REBASE_MIN_FRAC_OF_PLANNED);
  // Only shorten: slow cruise must not inflate the settle wait past OFP.
  const next = Math.max(floorMs, Math.min(planned, estimatedMs));
  const expectedRouteMs = Math.min(current, next);
  const changed = expectedRouteMs <= current - CRUISE_REBASE_MIN_DELTA_MS;
  return {
    expectedRouteMs: changed ? expectedRouteMs : current,
    estimatedMs,
    changed,
  };
}

/**
 * Planned airborne duration for the anti-time-compression settle gate.
 * Priority: OFP airTime → distance/cruise → OFP blockTime → fallbackHours → 12 min.
 */
export function resolveExpectedRouteMs(
  mission: Pick<
    MissionIntent,
    'aircraftClassId' | 'lastOfpCheck'
  >,
  opts: { distanceNm?: number; fallbackHours?: number } = {},
): number {
  const briefing = mission.lastOfpCheck?.briefing;
  const fromAir = parseBlockTimeToMs(briefing?.airTime);
  if (fromAir && fromAir > 0) return fromAir;

  const distanceNm =
    opts.distanceNm ?? briefing?.distanceNm;
  if (typeof distanceNm === 'number' && Number.isFinite(distanceNm) && distanceNm > 0) {
    return estimateRouteMsFromDistance(distanceNm, mission.aircraftClassId);
  }

  const fromBlock = parseBlockTimeToMs(briefing?.blockTime);
  if (fromBlock && fromBlock > 0) return fromBlock;

  if (typeof opts.fallbackHours === 'number' && opts.fallbackHours > 0) {
    return Math.round(opts.fallbackHours * 3_600_000);
  }

  return Math.round(0.2 * 3_600_000);
}

/** Airborne fraction required before settle (50% under 100 nm, else 70%). */
export function minAirborneTimeRatio(distanceNm?: number): number {
  if (
    typeof distanceNm === 'number' &&
    Number.isFinite(distanceNm) &&
    distanceNm > 0 &&
    distanceNm < SHORT_ROUTE_AIRBORNE_NM
  ) {
    return MIN_AIRBORNE_TIME_RATIO_SHORT;
  }
  return MIN_AIRBORNE_TIME_RATIO;
}

export function minRequiredAirborneMs(
  expectedRouteMs: number,
  distanceNm?: number,
): number {
  return Math.round(
    Math.max(0, expectedRouteMs) * minAirborneTimeRatio(distanceNm),
  );
}

export function formatFlightDurationMs(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function evaluateMinAirborneElapsed(opts: {
  airborneAtMs: number;
  expectedRouteMs: number;
  nowMs: number;
  /** When set (touchdown), freeze elapsed instead of counting taxi-in. */
  airborneEndedAtMs?: number;
  /** Route distance (nm) — short hops use a lower airborne fraction. */
  distanceNm?: number;
}):
  | {
      ok: true;
      elapsedMs: number;
      requiredMs: number;
      expectedRouteMs: number;
      ratioRequired: number;
    }
  | {
      ok: false;
      elapsedMs: number;
      requiredMs: number;
      expectedRouteMs: number;
      ratioRequired: number;
      message: string;
    } {
  const endMs =
    typeof opts.airborneEndedAtMs === 'number' &&
    Number.isFinite(opts.airborneEndedAtMs)
      ? opts.airborneEndedAtMs
      : opts.nowMs;
  const elapsedMs = Math.max(0, endMs - opts.airborneAtMs);
  const ratioRequired = minAirborneTimeRatio(opts.distanceNm);
  const requiredMs = minRequiredAirborneMs(
    opts.expectedRouteMs,
    opts.distanceNm,
  );
  if (elapsedMs >= requiredMs) {
    return {
      ok: true,
      elapsedMs,
      requiredMs,
      expectedRouteMs: opts.expectedRouteMs,
      ratioRequired,
    };
  }
  const pct = Math.round(
    (elapsedMs / Math.max(1, opts.expectedRouteMs)) * 100,
  );
  return {
    ok: false,
    elapsedMs,
    requiredMs,
    expectedRouteMs: opts.expectedRouteMs,
    ratioRequired,
    message: `airborne only ${formatFlightDurationMs(elapsedMs)} (${pct}% of ${formatFlightDurationMs(opts.expectedRouteMs)} planned · need ≥${Math.round(ratioRequired * 100)}%)`,
  };
}

function gateSettleByMinAirborne(
  state: MissionFlightWatchState,
  opts: EvaluateMissionFlightOpts,
  baseReason: string,
): MissionFlightEvent | null {
  const airborneAtMs = state.airborneAtMs;
  const expectedRouteMs = state.expectedRouteMs;
  if (
    typeof airborneAtMs !== 'number' ||
    !Number.isFinite(airborneAtMs) ||
    typeof expectedRouteMs !== 'number' ||
    !Number.isFinite(expectedRouteMs) ||
    expectedRouteMs <= 0
  ) {
    return null;
  }
  const check = evaluateMinAirborneElapsed({
    airborneAtMs,
    expectedRouteMs,
    nowMs: opts.nowMs ?? Date.now(),
    airborneEndedAtMs: state.airborneEndedAtMs,
    distanceNm: opts.distanceNm ?? state.routeDistanceNm,
  });
  if (check.ok) return null;
  return {
    type: 'settle_blocked',
    reason: `${baseReason}, but ${check.message}`,
  };
}

function gateSettleByDestination(
  sample: FlightGroundSample,
  state: MissionFlightWatchState,
  opts: EvaluateMissionFlightOpts,
  baseReason: string,
): MissionFlightEvent {
  const timeBlock = gateSettleByMinAirborne(state, opts, baseReason);
  if (timeBlock) return timeBlock;

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

function withAirborneClock(
  state: MissionFlightWatchState,
  mission: MissionIntent,
  opts: EvaluateMissionFlightOpts,
  airborne: boolean,
): MissionFlightWatchState {
  if (!airborne || state.airborneAtMs !== undefined) return state;
  const nowMs = opts.nowMs ?? Date.now();
  const expectedRouteMs =
    opts.expectedRouteMs ??
    resolveExpectedRouteMs(mission, {
      distanceNm: opts.distanceNm,
      fallbackHours: opts.fallbackHours,
    });
  return {
    ...state,
    airborneAtMs: nowMs,
    expectedRouteMs,
    routeDistanceNm:
      typeof opts.distanceNm === 'number' && Number.isFinite(opts.distanceNm)
        ? opts.distanceNm
        : state.routeDistanceNm,
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

  const confirmTicks = sample.onGround
    ? 0
    : (state.airborneConfirmTicks ?? 0) + 1;
  const convincing = isConvincingAirborne(sample);
  const confirmReady =
    !sample.onGround && confirmTicks >= DEPART_CONFIRM_TICKS;
  // Do not mark sawAirborne on a lone onGround=false flicker at 0 kt — that
  // poisoned catch-up depart + "ready to settle" after a fake wheels-up.
  const sawAirborneNow =
    state.sawAirborne ||
    convincing ||
    (confirmReady && departFrom.includes(mission.status));

  let nextState: MissionFlightWatchState = {
    sawAirborne: sawAirborneNow,
    lastOnGround: sample.onGround,
    airborneConfirmTicks: confirmTicks,
    airborneAtMs: state.airborneAtMs,
    airborneEndedAtMs: state.airborneEndedAtMs,
    expectedRouteMs: state.expectedRouteMs,
    routeDistanceNm:
      typeof opts.distanceNm === 'number' && Number.isFinite(opts.distanceNm)
        ? opts.distanceNm
        : state.routeDistanceNm,
    lastAirborneVsFpm: state.lastAirborneVsFpm,
    landingFpm: state.landingFpm,
  };
  if (
    !sample.onGround &&
    typeof sample.verticalSpeedFpm === 'number' &&
    Number.isFinite(sample.verticalSpeedFpm)
  ) {
    nextState = { ...nextState, lastAirborneVsFpm: sample.verticalSpeedFpm };
  }
  nextState = withAirborneClock(
    nextState,
    mission,
    opts,
    sawAirborneNow && !sample.onGround,
  );

  // Bootstrap: record first sample without firing transitions.
  if (state.lastOnGround === undefined) {
    return { event: { type: 'none' }, nextState };
  }

  const leftGround = state.lastOnGround === true && sample.onGround === false;
  const touchedDown = state.lastOnGround === false && sample.onGround === true;
  const stayAirborne =
    state.lastOnGround === false && sample.onGround === false;

  if (
    departFrom.includes(mission.status) &&
    !sample.onGround &&
    (convincing || confirmReady) &&
    (leftGround || stayAirborne || state.sawAirborne)
  ) {
    nextState = withAirborneClock(nextState, mission, opts, true);
    nextState = {
      ...nextState,
      sawAirborne: true,
      airborneEndedAtMs: undefined,
      landingFpm: undefined,
    };
    return {
      event: {
        type: 'depart',
        reason: convincing
          ? 'wheels-up (convincing airborne)'
          : 'wheels-up (sustained airborne)',
      },
      nextState,
    };
  }

  // Do NOT clear touchdown on a short bounce (wheels leave briefly after landing).
  // Only a real go-around / climb-out clears the first-contact stamp below.

  if (touchedDown && (state.sawAirborne || nextState.sawAirborne)) {
    const nowMs = opts.nowMs ?? Date.now();
    // Lock first-contact VS; later bounce touches must not overwrite.
    const landingFpm =
      nextState.landingFpm ??
      state.landingFpm ??
      state.lastAirborneVsFpm ??
      sample.verticalSpeedFpm;
    nextState = {
      ...nextState,
      airborneEndedAtMs: nextState.airborneEndedAtMs ?? nowMs,
      landingFpm:
        typeof landingFpm === 'number' && Number.isFinite(landingFpm)
          ? Math.round(landingFpm)
          : nextState.landingFpm,
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
        nextState,
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
      event: gateSettleByDestination(
        sample,
        nextState,
        opts,
        'engines off after landing',
      ),
      nextState,
    };
  }

  // Go-around: climbing away after a touchdown clears landing lock for phase/settle.
  // Short landing bounces (low VS / low AGL) keep the first-contact stamp.
  if (
    !sample.onGround &&
    typeof nextState.airborneEndedAtMs === 'number' &&
    isGoAroundClimb(sample)
  ) {
    nextState = {
      ...nextState,
      airborneEndedAtMs: undefined,
      landingFpm: undefined,
    };
  }

  return { event: { type: 'none' }, nextState };
}

/** True when airborne after touchdown looks like a go-around, not a bounce. */
function isGoAroundClimb(sample: FlightGroundSample): boolean {
  const vs =
    typeof sample.verticalSpeedFpm === 'number' &&
    Number.isFinite(sample.verticalSpeedFpm)
      ? sample.verticalSpeedFpm
      : undefined;
  const agl =
    typeof sample.aglFt === 'number' && Number.isFinite(sample.aglFt)
      ? sample.aglFt
      : undefined;
  // Require a real climb-out: brief bounce hops (~3 m / ~10 ft, mild VS) must
  // keep the first-contact stamp. Old thresholds (VS≥400 or AGL≥80) false-fired.
  if (agl != null && agl >= 150) return true;
  if (vs != null && vs >= 500 && (agl == null || agl >= 40)) return true;
  return false;
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
