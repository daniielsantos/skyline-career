/**
 * Stable-cruise detector for in-mission fuel-flow / TAS sampling.
 * Pure logic — no SimConnect. Career Watch feeds ticks; settle flushes a commit.
 */

import type { AirframePerfOverride } from './types/career-economy.js';

export const DEFAULT_CRUISE_MIN_STABLE_MS = 180_000; // 3 min
/** Light turbulence / tiny step-climbs; real climb is still ~800+ fpm. */
export const DEFAULT_CRUISE_MAX_VS_FPM = 400;
export const DEFAULT_CRUISE_MIN_TAS_KT = 60;
/** ~17 kt at 167 TAS — was 5% and reset on autopilot wander. */
export const DEFAULT_CRUISE_TAS_SPREAD = 0.1;
/** Was 10%; SimVar family jitter on GA was wiping the window. */
export const DEFAULT_CRUISE_FLOW_SPREAD = 0.2;
export const DEFAULT_CRUISE_MAX_ALT_SPREAD_FT = 1_200;
/** Ignore one-off SimVar spikes instead of wiping a healthy window. */
export const DEFAULT_CRUISE_FLOW_OUTLIER = 0.4;
export const DEFAULT_CRUISE_EMA_ALPHA = 0.3;

/**
 * Live Accu-Sim / fuel-total deltas can spike on short Watch ticks.
 * Keep learned burn near the hangar/catalog baseline.
 */
export const CRUISE_BURN_CATALOG_MIN_MULT = 0.5;
export const CRUISE_BURN_CATALOG_MAX_MULT = 1.75;

/** Clamp a live cruise burn sample to a band around catalog kg/h. */
export function clampCruiseFuelFlowToCatalog(
  liveKgPerHour: number,
  catalogKgPerHour: number | undefined,
): number {
  if (!Number.isFinite(liveKgPerHour) || !(liveKgPerHour > 0)) {
    return liveKgPerHour;
  }
  if (
    typeof catalogKgPerHour !== 'number' ||
    !Number.isFinite(catalogKgPerHour) ||
    !(catalogKgPerHour > 0)
  ) {
    return Math.round(liveKgPerHour * 10) / 10;
  }
  const min = catalogKgPerHour * CRUISE_BURN_CATALOG_MIN_MULT;
  const max = catalogKgPerHour * CRUISE_BURN_CATALOG_MAX_MULT;
  return Math.round(Math.min(max, Math.max(min, liveKgPerHour)) * 10) / 10;
}

export type CruiseTick = {
  atMs: number;
  onGround: boolean;
  altFt?: number;
  vsFpm?: number;
  tasKt?: number;
  fuelFlowKgPerHour?: number;
};

export type CruiseSampleCommit = {
  cruiseSpeedKt: number;
  cruiseFuelFlowKgPerHour: number;
  fuelBurnKgPerNm: number;
  sampleCount: number;
  durationSec: number;
  committedAtMs: number;
};

export type CruiseSampleState = {
  window: CruiseTick[];
  committed?: CruiseSampleCommit;
};

export type CruiseSamplePhase = 'idle' | 'collecting' | 'locked';

export type CruiseSampleStatus = {
  phase: CruiseSamplePhase;
  /** Stable window elapsed (ms). */
  elapsedMs: number;
  /** Required stable window (ms). */
  requiredMs: number;
  /** Live values while collecting / locked snapshot. */
  tasKt?: number;
  fuelFlowKgPerHour?: number;
  committed?: CruiseSampleCommit;
};

export type CruiseSampleOpts = {
  minStableMs?: number;
  maxVsFpm?: number;
  minTasKt?: number;
  maxTasSpread?: number;
  maxFlowSpread?: number;
  maxAltSpreadFt?: number;
  maxFlowOutlier?: number;
};

export function createCruiseSampleState(): CruiseSampleState {
  return { window: [] };
}

export function deriveFuelBurnKgPerNm(
  cruiseFuelFlowKgPerHour: number | undefined,
  cruiseSpeedKt: number | undefined,
): number | undefined {
  if (
    typeof cruiseFuelFlowKgPerHour !== 'number' ||
    !Number.isFinite(cruiseFuelFlowKgPerHour) ||
    cruiseFuelFlowKgPerHour <= 0
  ) {
    return undefined;
  }
  if (
    typeof cruiseSpeedKt !== 'number' ||
    !Number.isFinite(cruiseSpeedKt) ||
    cruiseSpeedKt <= 0
  ) {
    return undefined;
  }
  return Math.round((cruiseFuelFlowKgPerHour / cruiseSpeedKt) * 1000) / 1000;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function relativeSpread(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  if (!(mid > 0)) return Number.POSITIVE_INFINITY;
  return (max - min) / mid;
}

/** Hard leave-cruise: ground or real climb/descent. Clears the window. */
function tickLeavesCruise(
  tick: CruiseTick,
  opts: Required<CruiseSampleOpts>,
): boolean {
  if (tick.onGround) return true;
  if (
    typeof tick.vsFpm === 'number' &&
    Number.isFinite(tick.vsFpm) &&
    Math.abs(tick.vsFpm) > opts.maxVsFpm
  ) {
    return true;
  }
  return false;
}

/** Soft sampleable tick — missing TAS/flow skips without wiping the window. */
function tickIsSampleable(
  tick: CruiseTick,
  opts: Required<CruiseSampleOpts>,
): boolean {
  if (
    typeof tick.tasKt !== 'number' ||
    !Number.isFinite(tick.tasKt) ||
    tick.tasKt < opts.minTasKt
  ) {
    return false;
  }
  if (
    typeof tick.fuelFlowKgPerHour !== 'number' ||
    !Number.isFinite(tick.fuelFlowKgPerHour) ||
    !(tick.fuelFlowKgPerHour > 0)
  ) {
    return false;
  }
  return true;
}

function windowIsStable(
  window: CruiseTick[],
  opts: Required<CruiseSampleOpts>,
): boolean {
  if (window.length < 2) return false;
  const tas = window.map((t) => t.tasKt!);
  const flow = window.map((t) => t.fuelFlowKgPerHour!);
  if (relativeSpread(tas) > opts.maxTasSpread) return false;
  if (relativeSpread(flow) > opts.maxFlowSpread) return false;
  const alts = window
    .map((t) => t.altFt)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (alts.length >= 2) {
    const altSpread = Math.max(...alts) - Math.min(...alts);
    if (altSpread > opts.maxAltSpreadFt) return false;
  }
  return true;
}

function resolveOpts(opts?: CruiseSampleOpts): Required<CruiseSampleOpts> {
  return {
    minStableMs: opts?.minStableMs ?? DEFAULT_CRUISE_MIN_STABLE_MS,
    maxVsFpm: opts?.maxVsFpm ?? DEFAULT_CRUISE_MAX_VS_FPM,
    minTasKt: opts?.minTasKt ?? DEFAULT_CRUISE_MIN_TAS_KT,
    maxTasSpread: opts?.maxTasSpread ?? DEFAULT_CRUISE_TAS_SPREAD,
    maxFlowSpread: opts?.maxFlowSpread ?? DEFAULT_CRUISE_FLOW_SPREAD,
    maxAltSpreadFt: opts?.maxAltSpreadFt ?? DEFAULT_CRUISE_MAX_ALT_SPREAD_FT,
    maxFlowOutlier: opts?.maxFlowOutlier ?? DEFAULT_CRUISE_FLOW_OUTLIER,
  };
}

function buildCommit(window: CruiseTick[], atMs: number): CruiseSampleCommit | undefined {
  const tas = median(window.map((t) => t.tasKt!));
  const flow = median(window.map((t) => t.fuelFlowKgPerHour!));
  const burn = deriveFuelBurnKgPerNm(flow, tas);
  if (burn == null) return undefined;
  const durationSec = Math.max(
    0,
    Math.round((window[window.length - 1]!.atMs - window[0]!.atMs) / 1000),
  );
  return {
    cruiseSpeedKt: Math.round(tas),
    cruiseFuelFlowKgPerHour: Math.round(flow * 10) / 10,
    fuelBurnKgPerNm: burn,
    sampleCount: window.length,
    durationSec,
    committedAtMs: atMs,
  };
}

/**
 * Feed one live tick.
 * - Ground / high VS clears the window.
 * - Missing TAS/flow or one-off flow spikes skip without wiping progress.
 * - Commits when a continuous stable window reaches minStableMs.
 */
export function pushCruiseTick(
  state: CruiseSampleState,
  tick: CruiseTick,
  opts?: CruiseSampleOpts,
): { state: CruiseSampleState; justCommitted?: CruiseSampleCommit } {
  const resolved = resolveOpts(opts);
  if (tickLeavesCruise(tick, resolved)) {
    return { state: { window: [], committed: state.committed } };
  }
  if (!tickIsSampleable(tick, resolved)) {
    return { state };
  }

  // Established window: ignore abrupt SimVar fuel-flow spikes (e.g. 58→450 kg/h).
  if (state.window.length >= 3) {
    const medFlow = median(state.window.map((t) => t.fuelFlowKgPerHour!));
    const flow = tick.fuelFlowKgPerHour!;
    if (
      medFlow > 0 &&
      Math.abs(flow - medFlow) / medFlow > resolved.maxFlowOutlier
    ) {
      return { state };
    }
  }

  const window = [...state.window, tick];
  // Drop leading ticks until the remaining window is internally stable.
  let start = 0;
  while (start < window.length - 1) {
    const slice = window.slice(start);
    if (windowIsStable(slice, resolved) || slice.length < 2) break;
    start += 1;
  }
  const stableWindow = window.slice(start);
  if (stableWindow.length >= 2 && !windowIsStable(stableWindow, resolved)) {
    // Prefer keeping prior progress over restarting on a borderline tick.
    if (state.window.length >= 3) {
      return { state };
    }
    return {
      state: {
        window: [tick],
        committed: state.committed,
      },
    };
  }

  const elapsed =
    stableWindow.length >= 2
      ? stableWindow[stableWindow.length - 1]!.atMs - stableWindow[0]!.atMs
      : 0;

  let committed = state.committed;
  let justCommitted: CruiseSampleCommit | undefined;
  if (elapsed >= resolved.minStableMs && windowIsStable(stableWindow, resolved)) {
    const next = buildCommit(stableWindow, tick.atMs);
    if (
      next &&
      (!committed || next.sampleCount >= committed.sampleCount)
    ) {
      committed = next;
      justCommitted = next;
    }
  }

  return {
    state: { window: stableWindow, committed },
    justCommitted,
  };
}

export function cruiseSampleStatus(
  state: CruiseSampleState,
  opts?: CruiseSampleOpts,
): CruiseSampleStatus {
  const resolved = resolveOpts(opts);
  const last = state.window[state.window.length - 1];
  const elapsedMs =
    state.window.length >= 2
      ? Math.max(
          0,
          state.window[state.window.length - 1]!.atMs - state.window[0]!.atMs,
        )
      : 0;

  if (state.committed) {
    return {
      phase: 'locked',
      // Cap at the lock threshold — wall-clock past 3 min is not useful in UI.
      elapsedMs: resolved.minStableMs,
      requiredMs: resolved.minStableMs,
      tasKt: state.committed.cruiseSpeedKt,
      fuelFlowKgPerHour: state.committed.cruiseFuelFlowKgPerHour,
      committed: state.committed,
    };
  }

  if (state.window.length > 0 && last) {
    return {
      phase: 'collecting',
      elapsedMs,
      requiredMs: resolved.minStableMs,
      tasKt: last.tasKt,
      fuelFlowKgPerHour: last.fuelFlowKgPerHour,
    };
  }

  return {
    phase: 'idle',
    elapsedMs: 0,
    requiredMs: resolved.minStableMs,
  };
}

/** EMA-merge a committed cruise sample into a persisted airframe override. */
export function mergeAirframePerfOverride(
  prev: AirframePerfOverride | undefined,
  sample: CruiseSampleCommit,
  alpha = DEFAULT_CRUISE_EMA_ALPHA,
  opts?: { catalogCruiseFuelFlowKgPerHour?: number },
): AirframePerfOverride {
  const a = Math.min(1, Math.max(0, alpha));
  const sampleFlow = clampCruiseFuelFlowToCatalog(
    sample.cruiseFuelFlowKgPerHour,
    opts?.catalogCruiseFuelFlowKgPerHour ?? prev?.cruiseFuelFlowKgPerHour,
  );
  const blend = (oldVal: number | undefined, nextVal: number): number => {
    if (oldVal == null || !(oldVal > 0)) return nextVal;
    return oldVal * (1 - a) + nextVal * a;
  };
  const cruiseFuelFlowKgPerHour =
    Math.round(blend(prev?.cruiseFuelFlowKgPerHour, sampleFlow) * 10) / 10;
  const cruiseSpeedKt = Math.round(
    blend(prev?.cruiseSpeedKt, sample.cruiseSpeedKt),
  );
  const fuelBurnKgPerNm =
    deriveFuelBurnKgPerNm(cruiseFuelFlowKgPerHour, cruiseSpeedKt) ??
    sample.fuelBurnKgPerNm;
  return {
    cruiseFuelFlowKgPerHour,
    cruiseSpeedKt,
    fuelBurnKgPerNm,
    updatedAtIso: new Date(sample.committedAtMs).toISOString(),
    sampleCount: (prev?.sampleCount ?? 0) + 1,
  };
}
