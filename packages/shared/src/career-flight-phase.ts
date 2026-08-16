/**
 * Career Watch flight-phase state machine + adaptive poll intervals.
 * Telemetry/UI only — does not advance mission status.
 */

import {
  TAXI_GROUND_SPEED_EXIT_KT,
  TAXI_GROUND_SPEED_KT,
  type FlightGroundSample,
} from './career-flight-watch.js';

export type CareerFlightPhase =
  | 'ground'
  | 'taxi_out'
  | 'takeoff'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'approach'
  | 'landing'
  | 'taxi_in';

export const CAREER_FLIGHT_PHASES: readonly CareerFlightPhase[] = [
  'ground',
  'taxi_out',
  'takeoff',
  'climb',
  'cruise',
  'descent',
  'approach',
  'landing',
  'taxi_in',
] as const;

/** Human labels for Watch / Dispatch footer. */
export const CAREER_FLIGHT_PHASE_LABEL: Record<CareerFlightPhase, string> = {
  ground: 'On ground',
  taxi_out: 'Taxi out',
  takeoff: 'Takeoff',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
  approach: 'Approach',
  landing: 'Landing',
  taxi_in: 'Taxi in',
};

export type FlightPhaseSample = FlightGroundSample & {
  /** Height above ground / radio altitude (ft), when available. */
  aglFt?: number;
  /** MSL altitude (ft), optional context. */
  altitudeFt?: number;
  /** Great-circle distance to destination (nm). */
  distanceToDestNm?: number;
  /** True once this watch session has seen wheels-up. */
  sawAirborne: boolean;
  /** True after first touchdown following airborne. */
  postTouchdown: boolean;
};

export type FlightPhaseAdvanceOpts = {
  /** Wall-clock when wheels left the ground. */
  airborneAtMs?: number;
  /** Wall-clock of first touchdown. */
  touchdownAtMs?: number;
  nowMs?: number;
  /** Enter approach within this radius (nm). Default 15. */
  approachRadiusNm?: number;
  /** Exit approach sticky beyond this radius (nm). Default 18. */
  approachExitRadiusNm?: number;
  /** Enter landing when AGL at/below this near dest (ft). Default 500. */
  landingAglFt?: number;
  /** Takeoff window after wheels-up (ms). Default 60s. */
  takeoffWindowMs?: number;
  /**
   * After takeoff, keep climb at least this long before cruise is allowed (ms).
   * Default 90s. Strong descent can still leave climb.
   */
  minClimbAfterTakeoffMs?: number;
  /**
   * While AGL is below this, prefer climb over cruise after departure (ft).
   * Default 2500. Ignored when AGL is unavailable.
   */
  climbHoldBelowAglFt?: number;
  /** Keep "landing" phase briefly after touchdown (ms). Default 8s. */
  landingHoldMs?: number;
};

const VS_CLIMB_ENTER = 400;
const VS_CLIMB_EXIT = 200;
const VS_DESCENT_ENTER = -400;
const VS_DESCENT_EXIT = -200;
const VS_CRUISE_ABS = 200;
const TAKEOFF_ROLL_GS_KT = 55;
const NEAR_DEST_LANDING_NM = 3;
const DEFAULT_MIN_CLIMB_AFTER_TAKEOFF_MS = 90_000;
const DEFAULT_CLIMB_HOLD_BELOW_AGL_FT = 2_500;

function num(v: number | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function isTaxiMoving(
  gs: number | undefined,
  prev: string | null | undefined,
): boolean {
  const wasTaxi =
    prev === 'taxi_out' || prev === 'taxi_in' || prev === 'taxi';
  const threshold = wasTaxi ? TAXI_GROUND_SPEED_EXIT_KT : TAXI_GROUND_SPEED_KT;
  return typeof gs === 'number' && Number.isFinite(gs) && gs >= threshold;
}

function isCareerFlightPhase(v: string | null | undefined): v is CareerFlightPhase {
  return (
    typeof v === 'string' &&
    (CAREER_FLIGHT_PHASES as readonly string[]).includes(v)
  );
}

/**
 * Advance the Watch flight phase with hysteresis.
 * `prev` may be a legacy phase string (`taxi`, `airborne`, …) on first migrate.
 */
export function advanceFlightPhase(
  prev: string | null | undefined,
  sample: FlightPhaseSample,
  opts: FlightPhaseAdvanceOpts = {},
): CareerFlightPhase {
  const nowMs = opts.nowMs ?? Date.now();
  const approachRadius = opts.approachRadiusNm ?? 15;
  const approachExit = opts.approachExitRadiusNm ?? 18;
  const landingAgl = opts.landingAglFt ?? 500;
  const takeoffWindowMs = opts.takeoffWindowMs ?? 60_000;
  const minClimbAfterTakeoffMs =
    opts.minClimbAfterTakeoffMs ?? DEFAULT_MIN_CLIMB_AFTER_TAKEOFF_MS;
  const climbHoldBelowAglFt =
    opts.climbHoldBelowAglFt ?? DEFAULT_CLIMB_HOLD_BELOW_AGL_FT;
  const landingHoldMs = opts.landingHoldMs ?? 8_000;

  const prevPhase: CareerFlightPhase | null = isCareerFlightPhase(prev)
    ? prev
    : prev === 'taxi'
      ? sample.sawAirborne || sample.postTouchdown
        ? 'taxi_in'
        : 'taxi_out'
      : prev === 'airborne'
        ? 'cruise'
        : prev === 'ground+engines'
          ? 'ground'
          : null;

  const gs = num(sample.groundSpeedKt);
  const vs = num(sample.verticalSpeedFpm) ?? 0;
  const agl = num(sample.aglFt);
  const dist = num(sample.distanceToDestNm);
  const nearDest =
    typeof dist === 'number' && dist <= approachRadius;
  const farFromDest =
    typeof dist !== 'number' || dist > approachExit;
  const lowAgl =
    typeof agl === 'number' && agl <= landingAgl;
  const veryNearDest =
    typeof dist === 'number' && dist <= NEAR_DEST_LANDING_NM;

  // --- Post-touchdown (arrival) ---
  if (sample.postTouchdown) {
    const vsClimbOut = vs >= VS_CLIMB_ENTER;
    const aglClimbOut =
      typeof agl === 'number' && agl > landingAgl + 200;
    // Go-around / false touchdown: do not stick in landing while climbing away.
    const climbingOut = !sample.onGround && (vsClimbOut || aglClimbOut);
    if (!climbingOut) {
      const tdAt = opts.touchdownAtMs;
      const inLandingHold =
        typeof tdAt === 'number' &&
        Number.isFinite(tdAt) &&
        nowMs - tdAt < landingHoldMs;

      if (!sample.onGround) {
        return 'landing'; // bounce arc
      }
      if (inLandingHold && (prevPhase === 'landing' || prevPhase === 'approach')) {
        return 'landing';
      }
      if (isTaxiMoving(gs, prevPhase ?? 'taxi_in')) {
        return 'taxi_in';
      }
      return 'ground';
    }
  }

  // --- Still on ground, not yet airborne ---
  // Taxi / takeoff-roll from kinematics. Do not require enginesRunning — Accu-Sim
  // pistons often leave classic COMBUSTION/RPM at 0 while the engines are alive.
  if (sample.onGround && !sample.sawAirborne) {
    if (typeof gs === 'number' && gs >= TAKEOFF_ROLL_GS_KT) {
      return 'takeoff';
    }
    if (isTaxiMoving(gs, prevPhase)) {
      return 'taxi_out';
    }
    return 'ground';
  }

  // --- Airborne ---
  if (!sample.onGround) {
    const airborneAt = opts.airborneAtMs;
    const airborneAgeMs =
      typeof airborneAt === 'number' && Number.isFinite(airborneAt)
        ? Math.max(0, nowMs - airborneAt)
        : undefined;
    const inTakeoffWindow =
      typeof airborneAgeMs === 'number' && airborneAgeMs < takeoffWindowMs;
    const lowAfterRotate =
      typeof agl === 'number' ? agl < 1_000 : inTakeoffWindow;
    /** Hold climb after departure so soft VS cannot skip takeoff → cruise. */
    const holdDepartureClimb =
      (typeof airborneAgeMs === 'number' &&
        airborneAgeMs < minClimbAfterTakeoffMs) ||
      (typeof agl === 'number' && agl < climbHoldBelowAglFt);
    const climbingAway = vs >= VS_CLIMB_ENTER;
    /** Short hops are "near dest" from rotate — don't treat departure as arrival. */
    const arrivalAllowed =
      !inTakeoffWindow &&
      prevPhase !== 'takeoff' &&
      !climbingAway &&
      !(holdDepartureClimb && vs > VS_DESCENT_EXIT);

    // Landing / flare: low AGL near dest, or very close and descending.
    if (
      arrivalAllowed &&
      nearDest &&
      (lowAgl ||
        (veryNearDest && vs <= VS_DESCENT_EXIT) ||
        (prevPhase === 'landing' && (lowAgl || veryNearDest) && !climbingAway))
    ) {
      return 'landing';
    }

    // Approach sticky near destination.
    if (
      arrivalAllowed &&
      nearDest &&
      (vs <= VS_CRUISE_ABS ||
        lowAgl ||
        prevPhase === 'approach' ||
        prevPhase === 'landing' ||
        prevPhase === 'descent')
    ) {
      if (!(prevPhase === 'approach' && vs >= VS_CLIMB_ENTER && farFromDest)) {
        return 'approach';
      }
    }
    if (
      arrivalAllowed &&
      prevPhase === 'approach' &&
      !farFromDest &&
      vs < VS_CLIMB_ENTER
    ) {
      return 'approach';
    }

    // Takeoff: stay in the wheels-up window while still low; leaving always
    // enters climb (never jump straight to cruise on a soft VS sample).
    if (prevPhase === 'takeoff' || (inTakeoffWindow && lowAfterRotate)) {
      if (
        inTakeoffWindow &&
        (typeof agl !== 'number' || agl < 1_500) &&
        vs > VS_DESCENT_EXIT
      ) {
        return 'takeoff';
      }
      if (vs <= VS_DESCENT_ENTER) {
        return arrivalAllowed && nearDest ? 'approach' : 'descent';
      }
      return 'climb';
    }

    // Climb / descent / cruise with hysteresis + departure climb hold.
    if (prevPhase === 'climb' || (prevPhase === 'landing' && climbingAway)) {
      if (vs <= VS_DESCENT_ENTER) {
        return arrivalAllowed && nearDest ? 'approach' : 'descent';
      }
      if (holdDepartureClimb || climbingAway) return 'climb';
      if (vs >= VS_CLIMB_EXIT) return 'climb';
      return 'cruise';
    }
    if (prevPhase === 'descent') {
      if (vs <= VS_DESCENT_EXIT) {
        return nearDest ? 'approach' : 'descent';
      }
      if (vs >= VS_CLIMB_ENTER) return 'climb';
      return 'cruise';
    }
    if (prevPhase === 'cruise') {
      if (vs >= VS_CLIMB_ENTER) return 'climb';
      if (vs <= VS_DESCENT_ENTER) {
        return nearDest ? 'approach' : 'descent';
      }
      return 'cruise';
    }

    if (vs >= VS_CLIMB_ENTER) {
      return inTakeoffWindow && lowAfterRotate ? 'takeoff' : 'climb';
    }
    if (vs <= VS_DESCENT_ENTER) {
      return nearDest ? 'approach' : 'descent';
    }
    // Fresh airborne with soft VS: prefer climb while the departure hold applies.
    if (holdDepartureClimb && vs > VS_DESCENT_EXIT) return 'climb';
    if (Math.abs(vs) <= VS_CRUISE_ABS) return 'cruise';
    return vs > 0 ? 'climb' : 'descent';
  }

  // Ground after airborne but postTouchdown not yet stamped — treat as landing/taxi.
  if (sample.sawAirborne && sample.onGround) {
    if (isTaxiMoving(gs, prevPhase ?? 'taxi_in')) {
      return 'taxi_in';
    }
    return prevPhase === 'landing' ? 'landing' : 'ground';
  }

  return 'ground';
}

/** Adaptive Watch poll interval (ms) by phase. */
export function watchIntervalMsForPhase(
  phase: CareerFlightPhase | string | null | undefined,
  opts?: { cruiseCapMs?: number },
): number {
  const cruiseCap = Math.max(
    1_000,
    Math.min(
      10_000,
      typeof opts?.cruiseCapMs === 'number' && Number.isFinite(opts.cruiseCapMs)
        ? Math.round(opts.cruiseCapMs)
        : 5_000,
    ),
  );

  switch (phase) {
    case 'takeoff':
    case 'landing':
      // Floor matches Watch scheduleNextTick (≥200). Tight enough to catch
      // short bounce arcs without hammering SimBridge below that.
      return 200;
    case 'approach':
      // Still slower than landing, but short enough that a late AGL sample
      // before the <800 ft short-final override does not miss the flare window.
      return 500;
    case 'climb':
    case 'descent':
      return 3_000;
    case 'cruise':
      return cruiseCap;
    case 'taxi_out':
    case 'taxi_in':
    case 'taxi':
      return 2_000;
    case 'ground':
    case 'ground+engines':
    default:
      return 2_000;
  }
}

export function formatFlightPhaseLabel(
  phase: string | null | undefined,
): string {
  if (!phase) return '—';
  if (isCareerFlightPhase(phase)) return CAREER_FLIGHT_PHASE_LABEL[phase];
  if (phase === 'taxi') return 'Taxi';
  if (phase === 'airborne') return 'Airborne';
  if (phase === 'ground+engines') return 'On ground · engines';
  return phase;
}
