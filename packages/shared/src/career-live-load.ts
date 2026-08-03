import { careerLoadWeightMatchOk, careerPreflightReady } from './career-mission.js';

/** Default Loaded vs Due tolerances (lb). */
export const DEFAULT_FUEL_TOL_LB = 50;
export const DEFAULT_PAYLOAD_TOL_LB = 75;

/**
 * Resolve live payload from station SimVars and/or mass-balance.
 *
 * Policy:
 * - Stations near-zero while mass-balance still heavy → Accu-Sim under-read → trust MB,
 *   unless stations just cleared after a real prior station load (user emptied).
 * - Stations much heavier than mass-balance → ghost SimConnect stations (PMDG tablet
 *   cargo holds) → trust MB.
 * - Otherwise prefer station sum (includes intentionally emptied stations).
 * - Mass-balance may be 0 (emptied aircraft); never treat low MB as “unknown”.
 */
export function resolveLivePayloadLb(opts: {
  stationSumLb?: number;
  massBalanceLb?: number;
  /** Reserved for callers; planned is used only by evaluateLoadVerification. */
  plannedLb?: number;
  /**
   * Prior classic station sum from the last good sample. When stations drop from a
   * real load to ~empty, trust the empty read even if mass-balance still looks heavy.
   */
  previousStationSumLb?: number;
}): { payloadLb: number | undefined; source: 'stations' | 'mass-balance' | 'none' } {
  const station =
    typeof opts.stationSumLb === 'number' && Number.isFinite(opts.stationSumLb)
      ? Math.max(0, opts.stationSumLb)
      : undefined;
  const mb =
    typeof opts.massBalanceLb === 'number' && Number.isFinite(opts.massBalanceLb)
      ? Math.max(0, opts.massBalanceLb)
      : undefined;
  const prevStations =
    typeof opts.previousStationSumLb === 'number' &&
    Number.isFinite(opts.previousStationSumLb)
      ? Math.max(0, opts.previousStationSumLb)
      : undefined;

  if (
    mb !== undefined &&
    mb >= 50 &&
    (station === undefined || station + 75 < mb * 0.5)
  ) {
    // User cleared classic stations after they previously carried load — don't keep
    // PREFLIGHT READY via the under-read → mass-balance fallback.
    if (
      station !== undefined &&
      station < 50 &&
      prevStations !== undefined &&
      prevStations > 200
    ) {
      return { payloadLb: station, source: 'stations' };
    }
    return { payloadLb: mb, source: 'mass-balance' };
  }
  // Inflated classic stations vs tablet/EFB cargo (e.g. PMDG DC-6 Fuel/Load Manager).
  if (
    mb !== undefined &&
    station !== undefined &&
    station > mb * 2 + 200 &&
    station - mb > 400
  ) {
    return { payloadLb: mb, source: 'mass-balance' };
  }
  // Stations stuck at OFP load while TOTAL WEIGHT dropped (tablet/EFB emptied the
  // real mass but classic PAYLOAD STATION WEIGHT:* never cleared).
  const planned =
    typeof opts.plannedLb === 'number' && Number.isFinite(opts.plannedLb)
      ? Math.max(0, opts.plannedLb)
      : undefined;
  if (
    mb !== undefined &&
    station !== undefined &&
    planned !== undefined &&
    planned > 200 &&
    Math.abs(station - planned) <= 150 &&
    mb + 75 < planned * 0.5
  ) {
    return { payloadLb: mb, source: 'mass-balance' };
  }
  if (station !== undefined) {
    return { payloadLb: station, source: 'stations' };
  }
  if (mb !== undefined) {
    return { payloadLb: mb, source: 'mass-balance' };
  }
  return { payloadLb: undefined, source: 'none' };
}

export type LoadVerificationWeights = {
  ready: boolean;
  fuel: { plannedLb?: number; liveLb: number; ok: boolean };
  payload: { plannedLb?: number; liveLb?: number; ok: boolean };
};

export type FuelTankBreakdown = {
  left: number;
  right: number;
  center: number;
};

/**
 * Classic L/R/C SimVars sometimes return all zeros while FUEL TOTAL is still valid.
 * Reject those glitches so UI keeps the previous schematic / omits tanks.
 */
export function isUsableFuelTankBreakdown(
  tanks: FuelTankBreakdown,
  totalFuelLb?: number | null,
): boolean {
  const sum =
    Math.max(0, tanks.left) +
    Math.max(0, tanks.right) +
    Math.max(0, tanks.center);
  const total =
    typeof totalFuelLb === 'number' && Number.isFinite(totalFuelLb)
      ? Math.max(0, totalFuelLb)
      : undefined;
  if (sum < 1) {
    return total === undefined || total < 1;
  }
  if (total !== undefined && total > 50 && sum < total * 0.15) {
    return false;
  }
  return true;
}

/**
 * Prefer a usable next tank map; otherwise keep previous *if still usable*.
 * Never keep an all-zero glitch when FUEL TOTAL is still high — that froze the
 * Preflight L/R schematic at 0 while Sim total stayed correct.
 */
export function pickFuelTankBreakdown(
  next: FuelTankBreakdown | undefined,
  prev: FuelTankBreakdown | undefined,
  totalFuelLb?: number | null,
): FuelTankBreakdown | undefined {
  if (next && isUsableFuelTankBreakdown(next, totalFuelLb)) return next;
  if (prev && isUsableFuelTankBreakdown(prev, totalFuelLb)) return prev;
  return undefined;
}

/**
 * Same numeric gate used by Career Preflight / Watch / UI Loaded vs Due.
 * Missing live with a planned target → fail (never keep a stale READY).
 */
export function evaluateLoadVerification(opts: {
  plannedFuelLb?: number;
  liveFuelLb?: number;
  plannedPayloadLb?: number;
  livePayloadLb?: number;
  fuelTolLb?: number;
  payloadTolLb?: number;
}): LoadVerificationWeights {
  const fuelTol = opts.fuelTolLb ?? DEFAULT_FUEL_TOL_LB;
  const payloadTol = opts.payloadTolLb ?? DEFAULT_PAYLOAD_TOL_LB;
  const liveFuel =
    typeof opts.liveFuelLb === 'number' && Number.isFinite(opts.liveFuelLb)
      ? opts.liveFuelLb
      : undefined;
  const livePayload =
    typeof opts.livePayloadLb === 'number' && Number.isFinite(opts.livePayloadLb)
      ? opts.livePayloadLb
      : undefined;

  const fuelOk = careerLoadWeightMatchOk(
    liveFuel,
    opts.plannedFuelLb,
    fuelTol,
  );
  const payloadOk = careerLoadWeightMatchOk(
    livePayload,
    opts.plannedPayloadLb,
    payloadTol,
  );
  const ready = careerPreflightReady({
    fuelFailed: !fuelOk,
    payloadFailed: !payloadOk,
  });

  return {
    ready,
    fuel: {
      plannedLb: opts.plannedFuelLb,
      liveLb: liveFuel ?? 0,
      ok: fuelOk,
    },
    payload: {
      plannedLb: opts.plannedPayloadLb,
      liveLb: livePayload,
      ok: payloadOk,
    },
  };
}

/** True when live weights drifted enough to rewrite persisted verification. */
export function loadVerificationDrifted(
  prev: LoadVerificationWeights | undefined | null,
  next: LoadVerificationWeights,
  minDeltaLb = 15,
): boolean {
  if (!prev) return true;
  if (prev.ready !== next.ready) return true;
  if (prev.fuel.ok !== next.fuel.ok || prev.payload.ok !== next.payload.ok) {
    return true;
  }
  if (Math.abs((prev.fuel.liveLb ?? 0) - (next.fuel.liveLb ?? 0)) >= minDeltaLb) {
    return true;
  }
  if (
    Math.abs((prev.payload.liveLb ?? 0) - (next.payload.liveLb ?? 0)) >= minDeltaLb
  ) {
    return true;
  }
  return false;
}
