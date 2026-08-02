import { careerLoadWeightMatchOk, careerPreflightReady } from './career-mission.js';

/** Default Loaded vs Due tolerances (lb). */
export const DEFAULT_FUEL_TOL_LB = 50;
export const DEFAULT_PAYLOAD_TOL_LB = 75;

/**
 * Resolve live payload from station SimVars and/or mass-balance.
 *
 * Policy:
 * - Stations near-zero while mass-balance still heavy → Accu-Sim under-read → trust MB.
 * - Otherwise prefer station sum (includes intentionally emptied stations).
 * - Mass-balance may be 0 (emptied aircraft); never treat low MB as “unknown”.
 */
export function resolveLivePayloadLb(opts: {
  stationSumLb?: number;
  massBalanceLb?: number;
  /** Reserved for callers; planned is used only by evaluateLoadVerification. */
  plannedLb?: number;
}): { payloadLb: number | undefined; source: 'stations' | 'mass-balance' | 'none' } {
  const station =
    typeof opts.stationSumLb === 'number' && Number.isFinite(opts.stationSumLb)
      ? Math.max(0, opts.stationSumLb)
      : undefined;
  const mb =
    typeof opts.massBalanceLb === 'number' && Number.isFinite(opts.massBalanceLb)
      ? Math.max(0, opts.massBalanceLb)
      : undefined;

  if (
    mb !== undefined &&
    mb >= 50 &&
    (station === undefined || station + 75 < mb * 0.5)
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
