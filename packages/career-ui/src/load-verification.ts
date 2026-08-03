/**
 * Browser-safe Loaded vs Due gate (mirrors @msfs-compat/shared evaluateLoadVerification).
 * Do not import @msfs-compat/shared from Vite client code — the package index pulls node:fs.
 */

const DEFAULT_FUEL_TOL_LB = 50;
const DEFAULT_PAYLOAD_TOL_LB = 75;

function matchOk(
  liveLb: number | undefined,
  plannedLb: number | undefined,
  toleranceLb: number,
): boolean {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) return true;
  if (liveLb === undefined || !Number.isFinite(liveLb)) return false;
  return Math.abs(liveLb - plannedLb) <= Math.max(0, toleranceLb);
}

/** Per-side classic fuel breakdown (aux/tip folded into L/R by the live reader). */
export type LoadFuelTankBreakdown = {
  left: number;
  right: number;
  center: number;
};

/** Classic L/R/C sometimes glitch to zero while FUEL TOTAL is still valid. */
export function isUsableFuelTankBreakdown(
  tanks: LoadFuelTankBreakdown,
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

export function pickFuelTankBreakdown(
  next: LoadFuelTankBreakdown | undefined,
  prev: LoadFuelTankBreakdown | undefined,
  totalFuelLb?: number | null,
): LoadFuelTankBreakdown | undefined {
  if (next && isUsableFuelTankBreakdown(next, totalFuelLb)) return next;
  return prev;
}

/** Prefer defined live payload; never let a missing sample wipe a good total. */
export function pickLivePayloadLb(
  next: number | undefined,
  prev: number | undefined,
): number | undefined {
  return typeof next === 'number' && Number.isFinite(next) ? next : prev;
}

export type LoadVerificationFuel = {
  plannedLb?: number;
  liveLb: number;
  ok: boolean;
  tanks?: LoadFuelTankBreakdown;
};

export type LoadVerificationPayload = {
  plannedLb?: number;
  liveLb?: number;
  ok: boolean;
  stations?: Record<number, number>;
};

export function evaluateLoadVerification(opts: {
  plannedFuelLb?: number;
  liveFuelLb?: number;
  plannedPayloadLb?: number;
  livePayloadLb?: number;
  fuelTolLb?: number;
  payloadTolLb?: number;
  fuelTanks?: LoadFuelTankBreakdown;
  payloadStations?: Record<number, number>;
}): {
  ready: boolean;
  fuel: LoadVerificationFuel;
  payload: LoadVerificationPayload;
} {
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

  const fuelOk = matchOk(liveFuel, opts.plannedFuelLb, fuelTol);
  const payloadOk = matchOk(livePayload, opts.plannedPayloadLb, payloadTol);
  const ready = fuelOk && payloadOk;

  return {
    ready,
    fuel: {
      plannedLb: opts.plannedFuelLb,
      liveLb: liveFuel ?? 0,
      ok: fuelOk,
      ...(opts.fuelTanks ? { tanks: opts.fuelTanks } : {}),
    },
    payload: {
      plannedLb: opts.plannedPayloadLb,
      liveLb: livePayload,
      ok: payloadOk,
      ...(opts.payloadStations ? { stations: opts.payloadStations } : {}),
    },
  };
}
