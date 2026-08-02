/**
 * Stable-cruise detector for in-mission fuel-flow / TAS sampling.
 * Pure logic — no SimConnect. Career Watch feeds ticks; settle flushes a commit.
 */

import type { AirframePerfOverride } from './types/career-economy.js';

export const DEFAULT_CRUISE_MIN_STABLE_MS = 180_000; // 3 min
export const DEFAULT_CRUISE_MAX_VS_FPM = 150;
export const DEFAULT_CRUISE_MIN_TAS_KT = 60;
export const DEFAULT_CRUISE_TAS_SPREAD = 0.05;
export const DEFAULT_CRUISE_FLOW_SPREAD = 0.1;
export const DEFAULT_CRUISE_MAX_ALT_SPREAD_FT = 500;
export const DEFAULT_CRUISE_EMA_ALPHA = 0.3;

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

function tickPassesGates(tick: CruiseTick, opts: Required<CruiseSampleOpts>): boolean {
  if (tick.onGround) return false;
  if (
    typeof tick.vsFpm === 'number' &&
    Number.isFinite(tick.vsFpm) &&
    Math.abs(tick.vsFpm) > opts.maxVsFpm
  ) {
    return false;
  }
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
 * Feed one live tick. Clears the window on unstable samples.
 * Commits (or upgrades) when a continuous stable window reaches minStableMs.
 */
export function pushCruiseTick(
  state: CruiseSampleState,
  tick: CruiseTick,
  opts?: CruiseSampleOpts,
): { state: CruiseSampleState; justCommitted?: CruiseSampleCommit } {
  const resolved = resolveOpts(opts);
  if (!tickPassesGates(tick, resolved)) {
    return { state: { window: [], committed: state.committed } };
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
      elapsedMs: Math.max(elapsedMs, state.committed.durationSec * 1000),
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
): AirframePerfOverride {
  const a = Math.min(1, Math.max(0, alpha));
  const blend = (oldVal: number | undefined, nextVal: number): number => {
    if (oldVal == null || !(oldVal > 0)) return nextVal;
    return oldVal * (1 - a) + nextVal * a;
  };
  const cruiseFuelFlowKgPerHour =
    Math.round(
      blend(prev?.cruiseFuelFlowKgPerHour, sample.cruiseFuelFlowKgPerHour) * 10,
    ) / 10;
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
