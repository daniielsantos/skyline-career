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
 * Parking-brake settle: treat as shutdown when GS is below this (kt).
 * Covers payware turboprops (PC-12) where ENG COMBUSTION:1 stays true after cutoff.
 */
export const PARKED_GROUND_SPEED_KT = 3;
/** TURB ENG N1 below this (%) is spooled down — not producing thrust. */
export const ENGINE_N1_OFF_PCT = 20;
/** GENERAL ENG RPM below this is stopped (piston / leftover Ng). */
export const ENGINE_RPM_OFF = 250;
/**
 * Live fuel flow (kg/h) that counts as engines producing — Accu-Sim pistons
 * often leave GENERAL ENG COMBUSTION at 0 while still burning.
 */
export const ENGINE_FUEL_FLOW_ON_KG_H = 5;

/**
 * Min ground speed (kt) to treat SIM ON GROUND=false as real wheels-up.
 * A single onGround flicker at 0 kt must not auto-depart the mission.
 */
export const DEPART_MIN_GROUND_SPEED_KT = 30;
/**
 * Min IAS (kt) that also counts as wheels-up — covers headwind takeoff where
 * GS stays below {@link DEPART_MIN_GROUND_SPEED_KT}.
 */
export const DEPART_MIN_IAS_KT = 40;
/** GS/IAS floor to accumulate sustained-airborne confirm ticks. */
export const DEPART_KINEMATICS_GS_KT = 15;
export const DEPART_KINEMATICS_IAS_KT = 25;
/**
 * Consecutive airborne samples with speed evidence required when GS/IAS are
 * below the convincing thresholds (e.g. a slow rotate).
 */
export const DEPART_CONFIRM_TICKS = 2;

function finitePositive(n: number | undefined, min: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= min;
}

/** Pause / slew / hangar — do not edge-detect depart or touchdown. */
export function isSimPlaybackFrozen(sample: FlightGroundSample): boolean {
  return sample.paused === true || sample.slewActive === true;
}

/**
 * Real kinematic flight, not a SIM ON GROUND blip.
 * AGL-only is not enough: MSFS menu / aircraft reload often reports
 * onGround=false with AGL in the hundreds while GS/IAS stay ~0.
 */
export function isConvincingAirborne(sample: FlightGroundSample): boolean {
  if (sample.onGround || isSimPlaybackFrozen(sample)) return false;
  return (
    finitePositive(sample.groundSpeedKt, DEPART_MIN_GROUND_SPEED_KT) ||
    finitePositive(sample.indicatedAirspeedKt, DEPART_MIN_IAS_KT)
  );
}

/**
 * Enough evidence to count a confirm tick.
 * Zero-speed "airborne" (menu, spawn drop, variant swap) resets the counter.
 * When GS and IAS are both missing (CLI host without those simvars), ticks
 * still accumulate — that is the legacy fallback, not a 0 kt reading.
 */
export function hasAirborneKinematics(sample: FlightGroundSample): boolean {
  if (sample.onGround || isSimPlaybackFrozen(sample)) return false;
  if (finitePositive(sample.groundSpeedKt, DEPART_KINEMATICS_GS_KT)) return true;
  if (finitePositive(sample.indicatedAirspeedKt, DEPART_KINEMATICS_IAS_KT)) {
    return true;
  }
  const gsKnown =
    typeof sample.groundSpeedKt === 'number' &&
    Number.isFinite(sample.groundSpeedKt);
  const iasKnown =
    typeof sample.indicatedAirspeedKt === 'number' &&
    Number.isFinite(sample.indicatedAirspeedKt);
  return !gsKnown && !iasKnown;
}

/** Minimal live gates used for career auto-depart / auto-settle. */
export interface FlightGroundSample {
  onGround: boolean;
  enginesRunning: boolean;
  /** Optional aircraft position (degrees). */
  position?: { lat: number; lon: number };
  /** Optional ground speed (knots) for taxi phase display. */
  groundSpeedKt?: number;
  /** Indicated airspeed (knots) — headwind takeoff still has IAS at rotate. */
  indicatedAirspeedKt?: number;
  /** Parking brake set — parked settle when combustion simvars stick. */
  parkingBrake?: boolean;
  /** Live vertical speed (feet per minute). Negative = descending. */
  verticalSpeedFpm?: number;
  /** Height above ground (feet) — used to separate bounce vs go-around. */
  aglFt?: number;
  /** Sim paused (ESC / World Map / aircraft select). */
  paused?: boolean;
  /** Slew / slew-to-spawn — GS is meaningless. */
  slewActive?: boolean;
}

/**
 * Light SimVar batch shared by Watch probe, SimBridge status, and Preflight
 * live-reader — same thresholds via {@link inferEnginesRunning}.
 */
export const ENGINE_RUNNING_PROBE_SIMVARS = [
  { name: 'TURB ENG N1:1', unit: 'percent' },
  { name: 'TURB ENG N1:2', unit: 'percent' },
  { name: 'GENERAL ENG RPM:1', unit: 'rpm' },
  { name: 'GENERAL ENG RPM:2', unit: 'rpm' },
  { name: 'GENERAL ENG COMBUSTION:1', unit: 'bool' },
  { name: 'GENERAL ENG COMBUSTION:2', unit: 'bool' },
  { name: 'ENG FUEL FLOW PPH:1', unit: 'pounds per hour' },
  { name: 'ENG FUEL FLOW PPH:2', unit: 'pounds per hour' },
] as const;

function finiteProbeSample(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * Map an {@link ENGINE_RUNNING_PROBE_SIMVARS} result array into
 * {@link inferEnginesRunning}. Values may be sparse/undefined when a read fails.
 */
export function inferEnginesRunningFromProbeBatch(
  values: readonly unknown[],
  snapshotRunning: boolean,
): boolean {
  const n1Eng1 = finiteProbeSample(values[0]);
  const n1Eng2 = finiteProbeSample(values[1]);
  const rpmEng1 = finiteProbeSample(values[2]);
  const rpmEng2 = finiteProbeSample(values[3]);
  const combEng1 = finiteProbeSample(values[4]);
  const combEng2 = finiteProbeSample(values[5]);
  const pph1 = finiteProbeSample(values[6]);
  const pph2 = finiteProbeSample(values[7]);
  const n1Pct = [n1Eng1, n1Eng2].filter(
    (n): n is number => typeof n === 'number',
  );
  const rpm = [rpmEng1, rpmEng2].filter(
    (n): n is number => typeof n === 'number',
  );
  const combustion = [combEng1, combEng2]
    .filter((n): n is number => typeof n === 'number')
    .map((n) => n > 0.5);
  const pph = [pph1, pph2].filter(
    (n): n is number => typeof n === 'number' && n > 0.3,
  );
  const fuelFlowKgPerHour =
    pph.length > 0
      ? Math.round(pph.reduce((s, n) => s + n, 0) * 0.45359237 * 10) / 10
      : undefined;
  return inferEnginesRunning({
    snapshotRunning,
    n1Pct,
    rpm,
    combustion,
    fuelFlowKgPerHour,
  });
}

/**
 * Prefer N1 / RPM / GENERAL ENG COMBUSTION / fuel flow over the snapshot
 * ENG COMBUSTION:1 bit, which stays true after cutoff / world-menu spawn on
 * several MSFS turboprops (ATR, PC-12). Accu-Sim pistons often leave
 * GENERAL ENG COMBUSTION at 0 while running — use RPM or fuel flow, not the
 * Host snapshot bit.
 *
 * Without positive spool/flow evidence, returns false — never trusts the Host
 * sticky bit alone (empty samples after a failed read included).
 */
export function inferEnginesRunning(input: {
  snapshotRunning: boolean;
  n1Pct?: number[];
  rpm?: number[];
  combustion?: boolean[];
  /** Live fuel flow (kg/h); strong positive evidence when combustion is stuck 0. */
  fuelFlowKgPerHour?: number;
}): boolean {
  // Positive N1/RPM = live spool. Raw zeros still count as “sampled dead”
  // (ATR after world menu). Accu-Sim running uses RPM or fuel flow, not N1.
  const n1Raw = (input.n1Pct ?? []).filter((n) => Number.isFinite(n));
  const n1 = n1Raw.filter((n) => n > 0);
  const rpmRaw = (input.rpm ?? []).filter((n) => Number.isFinite(n));
  const rpm = rpmRaw.filter((n) => n > 0);
  const comb = input.combustion ?? [];
  const flow =
    typeof input.fuelFlowKgPerHour === 'number' &&
    Number.isFinite(input.fuelFlowKgPerHour)
      ? input.fuelFlowKgPerHour
      : undefined;

  if (n1.some((n) => n >= ENGINE_N1_OFF_PCT)) {
    // N1 alone sticks after cutoff / world menu — only trust spool when RPM or
    // fuel flow corroborates (turboprop idle still burns; residual N1 does not).
    if (rpm.some((r) => r >= ENGINE_RPM_OFF)) return true;
    if (flow !== undefined && flow >= ENGINE_FUEL_FLOW_ON_KG_H) return true;
    // fall through to combustion / flow gates
  }
  if (n1.length > 0 && n1.every((n) => n < ENGINE_N1_OFF_PCT)) return false;

  if (comb.some((c) => c)) {
    // Sticky combustion after cutoff: low RPM still means shutdown.
    if (rpmRaw.length > 0 && rpmRaw.every((r) => r < ENGINE_RPM_OFF)) return false;
    if (rpm.some((r) => r >= ENGINE_RPM_OFF)) return true;
    if (flow !== undefined && flow >= ENGINE_FUEL_FLOW_ON_KG_H) return true;
    // ATR / PC-12 / world-menu spawn: ENG COMBUSTION stays 1 with N1/RPM/flow
    // at 0. That is not a running engine (Accu-Sim running has comb=false).
    return false;
  }
  if (rpm.some((r) => r >= ENGINE_RPM_OFF)) return true;
  if (flow !== undefined && flow >= ENGINE_FUEL_FLOW_ON_KG_H) return true;

  if (rpm.length > 0 && rpm.every((r) => r < ENGINE_RPM_OFF)) return false;
  // Host snapshot is ENG COMBUSTION:1 — same sticky bit after menu spawn.
  // Accu-Sim with engines actually running should have hit RPM or fuel flow.
  // Empty samples (read failed / not probed) → false; do not revive sticky Host.
  // `snapshotRunning` kept for call-site compatibility; never trusted alone.
  void input.snapshotRunning;
  return false;
}

/**
 * Ready to settle after landing: nearly stopped, and either engines off or
 * parking brake set.
 *
 * Always require low ground speed when GS is known — a false “engines off”
 * reading on touchdown must not settle mid-rollout.
 */
export function isShutdownOrParked(sample: FlightGroundSample): boolean {
  const gs = sample.groundSpeedKt;
  if (typeof gs === 'number' && Number.isFinite(gs) && gs >= PARKED_GROUND_SPEED_KT) {
    return false;
  }
  if (!sample.enginesRunning) return true;
  return sample.parkingBrake === true;
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
  // Motion alone is enough for taxi display — enginesRunning is unreliable on
  // Accu-Sim when classic COMBUSTION/RPM simvars stay at 0.
  if (moving) return 'taxi';
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

  // Menu / slew: ignore the sample entirely so lastOnGround does not flip
  // and unpause on the ramp does not look like a touchdown.
  if (isSimPlaybackFrozen(sample)) {
    return { event: { type: 'none' }, nextState: state };
  }

  const confirmTicks = sample.onGround
    ? 0
    : hasAirborneKinematics(sample)
      ? (state.airborneConfirmTicks ?? 0) + 1
      : 0;
  const convincing = isConvincingAirborne(sample);
  const confirmReady =
    !sample.onGround && confirmTicks >= DEPART_CONFIRM_TICKS;
  // Do not mark sawAirborne on a lone onGround=false flicker at 0 kt — that
  // poisoned catch-up depart + "ready to settle" after a fake wheels-up.
  // AGL-only / zero-speed "airborne" (aircraft select, variant reload) also
  // must not stamp sawAirborne.
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

  const shutdownOrParked = isShutdownOrParked(sample);

  if (
    touchedDown &&
    mission.status === 'in_flight' &&
    (state.sawAirborne || nextState.sawAirborne) &&
    (!requireEnginesOff || shutdownOrParked)
  ) {
    return {
      event: gateSettleByDestination(
        sample,
        nextState,
        opts,
        requireEnginesOff
          ? shutdownOrParked && sample.enginesRunning
            ? 'touchdown + parked'
            : 'touchdown + engines off'
          : 'touchdown (SIM ON GROUND true)',
      ),
      nextState,
    };
  }

  // Touchdown with engines still running: wait (taxi-in) unless parked.
  if (
    touchedDown &&
    mission.status === 'in_flight' &&
    requireEnginesOff &&
    !shutdownOrParked
  ) {
    return { event: { type: 'none' }, nextState };
  }

  if (
    mission.status === 'in_flight' &&
    sample.onGround &&
    (state.sawAirborne || nextState.sawAirborne) &&
    requireEnginesOff &&
    state.lastOnGround === true &&
    shutdownOrParked
  ) {
    return {
      event: gateSettleByDestination(
        sample,
        nextState,
        opts,
        sample.enginesRunning ? 'parked after landing' : 'engines off after landing',
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
