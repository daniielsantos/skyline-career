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

export function evaluateLoadVerification(opts: {
  plannedFuelLb?: number;
  liveFuelLb?: number;
  plannedPayloadLb?: number;
  livePayloadLb?: number;
  fuelTolLb?: number;
  payloadTolLb?: number;
}): {
  ready: boolean;
  fuel: { plannedLb?: number; liveLb: number; ok: boolean };
  payload: { plannedLb?: number; liveLb?: number; ok: boolean };
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
    },
    payload: {
      plannedLb: opts.plannedPayloadLb,
      liveLb: livePayload,
      ok: payloadOk,
    },
  };
}
