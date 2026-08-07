/**
 * Live weather-ops score from Watch ambient samples.
 * Headwind + rain + visibility → settle bonus (soft-fail friendly).
 */

export type WeatherOpsPhaseHint =
  | 'takeoff'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'approach'
  | 'landing'
  | string;

export type WeatherOpsTick = {
  atMs: number;
  onGround: boolean;
  phase?: WeatherOpsPhaseHint;
  /** Wind speed (kt). */
  windKt?: number;
  /** Meteorological wind FROM direction (deg true). */
  windFromDeg?: number;
  /** Aircraft true heading (deg). */
  headingTrueDeg?: number;
  /** Precipitation rate (mm of water). */
  precipMm?: number;
  /** Ambient visibility (meters). */
  visibilityM?: number;
};

export type WeatherOpsAccumulator = {
  scoreSumMs: number;
  totalMs: number;
  sampleCount: number;
  approachSampleCount: number;
  headwindSum: number;
  headwindCount: number;
  visSum: number;
  visCount: number;
  rainTicks: number;
  lastAtMs?: number;
  /** Peak approach/landing visibility score contribution for debrief. */
  minApproachVisM?: number;
};

export type WeatherOpsSnapshot = {
  avgScore: number;
  bonusFrac: number;
  sampleCount: number;
  approachSampleCount: number;
  airborneMs: number;
  avgHeadwindKt: number;
  avgVisM: number | null;
  /** Fraction of samples with precipMm > 0. */
  rainFraction: number;
  minApproachVisM: number | null;
  eligible: boolean;
};

const MIN_SAMPLES = 8;
const MIN_AIRBORNE_MS = 5 * 60_000;
const ROUTE_FRACTION = 0.2;

export function createWeatherOpsAccumulator(): WeatherOpsAccumulator {
  return {
    scoreSumMs: 0,
    totalMs: 0,
    sampleCount: 0,
    approachSampleCount: 0,
    headwindSum: 0,
    headwindCount: 0,
    visSum: 0,
    visCount: 0,
    rainTicks: 0,
  };
}

/** Headwind component (kt); positive = into the nose. */
export function headwindKtFromWind(
  windKt: number,
  windFromDeg: number,
  headingTrueDeg: number,
): number {
  if (
    !Number.isFinite(windKt) ||
    !Number.isFinite(windFromDeg) ||
    !Number.isFinite(headingTrueDeg) ||
    windKt <= 0
  ) {
    return 0;
  }
  const deltaDeg = windFromDeg - headingTrueDeg;
  const rad = (deltaDeg * Math.PI) / 180;
  return Math.max(0, windKt * Math.cos(rad));
}

export function headwindFactorScore(headwindKt: number): number {
  if (!Number.isFinite(headwindKt) || headwindKt <= 0) return 0;
  return Math.min(70, (headwindKt / 25) * 70);
}

export function precipFactorScore(precipMm: number | undefined): number {
  if (typeof precipMm !== 'number' || !Number.isFinite(precipMm) || precipMm <= 0) {
    return 0;
  }
  if (precipMm < 1) return 10;
  if (precipMm < 5) return 18;
  return 25;
}

/** Piecewise linear visibility severity (0–80). */
export function visibilityFactorScore(visibilityM: number | undefined): number {
  if (typeof visibilityM !== 'number' || !Number.isFinite(visibilityM)) return 0;
  if (visibilityM >= 10_000) return 0;
  if (visibilityM <= 1_500) return 80;
  if (visibilityM <= 3_000) {
    // 1500→80, 3000→55
    return 80 - ((visibilityM - 1_500) / 1_500) * 25;
  }
  if (visibilityM <= 5_000) {
    // 3000→55, 5000→35
    return 55 - ((visibilityM - 3_000) / 2_000) * 20;
  }
  // 5000→35, 10000→0
  return 35 - ((visibilityM - 5_000) / 5_000) * 35;
}

function isApproachPhase(phase: WeatherOpsPhaseHint | undefined): boolean {
  return phase === 'approach' || phase === 'landing';
}

export function weatherOpsTickScore(tick: WeatherOpsTick): {
  score: number;
  headwindKt: number;
  visScore: number;
  rainScore: number;
  hwScore: number;
} | null {
  const hasWind =
    typeof tick.windKt === 'number' &&
    Number.isFinite(tick.windKt) &&
    typeof tick.windFromDeg === 'number' &&
    Number.isFinite(tick.windFromDeg) &&
    typeof tick.headingTrueDeg === 'number' &&
    Number.isFinite(tick.headingTrueDeg);
  const hasVis =
    typeof tick.visibilityM === 'number' && Number.isFinite(tick.visibilityM);
  if (!hasWind && !hasVis) return null;

  const hw = hasWind
    ? headwindKtFromWind(tick.windKt!, tick.windFromDeg!, tick.headingTrueDeg!)
    : 0;
  const hwScore = headwindFactorScore(hw);
  const rainScore = precipFactorScore(tick.precipMm);
  const visScore = visibilityFactorScore(tick.visibilityM);

  const approach = isApproachPhase(tick.phase);
  const raw = approach
    ? 0.5 * visScore + 0.3 * hwScore + 0.2 * rainScore
    : (hwScore + rainScore + visScore) / 3;
  return {
    score: Math.min(100, Math.max(0, raw)),
    headwindKt: hw,
    visScore,
    rainScore,
    hwScore,
  };
}

export function pushWeatherOpsTick(
  acc: WeatherOpsAccumulator,
  tick: WeatherOpsTick,
): WeatherOpsAccumulator {
  if (tick.onGround) return acc;
  const scored = weatherOpsTickScore(tick);
  if (!scored) return acc;

  const dtMs =
    typeof acc.lastAtMs === 'number' && tick.atMs > acc.lastAtMs
      ? Math.min(30_000, tick.atMs - acc.lastAtMs)
      : 5_000;

  const next: WeatherOpsAccumulator = {
    ...acc,
    scoreSumMs: acc.scoreSumMs + scored.score * dtMs,
    totalMs: acc.totalMs + dtMs,
    sampleCount: acc.sampleCount + 1,
    approachSampleCount:
      acc.approachSampleCount + (isApproachPhase(tick.phase) ? 1 : 0),
    lastAtMs: tick.atMs,
  };

  if (scored.headwindKt > 0 || (typeof tick.windKt === 'number' && tick.windKt > 0)) {
    next.headwindSum = acc.headwindSum + scored.headwindKt;
    next.headwindCount = acc.headwindCount + 1;
  }
  if (typeof tick.visibilityM === 'number' && Number.isFinite(tick.visibilityM)) {
    next.visSum = acc.visSum + tick.visibilityM;
    next.visCount = acc.visCount + 1;
    if (isApproachPhase(tick.phase)) {
      next.minApproachVisM =
        typeof acc.minApproachVisM === 'number'
          ? Math.min(acc.minApproachVisM, tick.visibilityM)
          : tick.visibilityM;
    }
  }
  if (typeof tick.precipMm === 'number' && tick.precipMm > 0) {
    next.rainTicks = acc.rainTicks + 1;
  }
  return next;
}

export function weatherOpsBonusFrac(avgScore: number, eligible: boolean): number {
  if (!eligible || !Number.isFinite(avgScore)) return 0;
  if (avgScore < 25) return 0;
  if (avgScore < 50) return 0.05;
  if (avgScore < 75) return 0.1;
  return 0.15;
}

export function weatherOpsEligible(
  acc: Pick<WeatherOpsAccumulator, 'sampleCount' | 'totalMs'>,
  opts?: { expectedRouteMs?: number },
): boolean {
  if (acc.sampleCount < MIN_SAMPLES) return false;
  const routeFloor =
    typeof opts?.expectedRouteMs === 'number' &&
    Number.isFinite(opts.expectedRouteMs) &&
    opts.expectedRouteMs > 0
      ? Math.min(MIN_AIRBORNE_MS, opts.expectedRouteMs * ROUTE_FRACTION)
      : MIN_AIRBORNE_MS;
  return acc.totalMs >= routeFloor;
}

export function finalizeWeatherOpsScore(
  acc: WeatherOpsAccumulator,
  opts?: { expectedRouteMs?: number },
): WeatherOpsSnapshot {
  const avgScore =
    acc.totalMs > 0 ? Math.round((acc.scoreSumMs / acc.totalMs) * 10) / 10 : 0;
  const eligible = weatherOpsEligible(acc, opts);
  const bonusFrac = weatherOpsBonusFrac(avgScore, eligible);
  return {
    avgScore,
    bonusFrac,
    sampleCount: acc.sampleCount,
    approachSampleCount: acc.approachSampleCount,
    airborneMs: Math.round(acc.totalMs),
    avgHeadwindKt:
      acc.headwindCount > 0
        ? Math.round((acc.headwindSum / acc.headwindCount) * 10) / 10
        : 0,
    avgVisM:
      acc.visCount > 0 ? Math.round(acc.visSum / acc.visCount) : null,
    rainFraction:
      acc.sampleCount > 0
        ? Math.round((acc.rainTicks / acc.sampleCount) * 1000) / 1000
        : 0,
    minApproachVisM:
      typeof acc.minApproachVisM === 'number' ? Math.round(acc.minApproachVisM) : null,
    eligible,
  };
}

/** Live status strip while Watch is running. */
export function weatherOpsStatus(
  acc: WeatherOpsAccumulator,
  opts?: { expectedRouteMs?: number },
): Pick<
  WeatherOpsSnapshot,
  'avgScore' | 'sampleCount' | 'eligible' | 'avgHeadwindKt' | 'avgVisM' | 'rainFraction'
> {
  const snap = finalizeWeatherOpsScore(acc, opts);
  return {
    avgScore: snap.avgScore,
    sampleCount: snap.sampleCount,
    eligible: snap.eligible,
    avgHeadwindKt: snap.avgHeadwindKt,
    avgVisM: snap.avgVisM,
    rainFraction: snap.rainFraction,
  };
}
