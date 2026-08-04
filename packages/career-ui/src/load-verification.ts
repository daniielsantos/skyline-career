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

/** Per-side classic fuel breakdown (aux/tip shown separately when present). */
export type LoadFuelTankBreakdown = {
  left: number;
  right: number;
  center: number;
  leftAux?: number;
  rightAux?: number;
  leftTip?: number;
  rightTip?: number;
};

function fuelTankBreakdownSum(tanks: LoadFuelTankBreakdown): number {
  return (
    Math.max(0, tanks.left) +
    Math.max(0, tanks.right) +
    Math.max(0, tanks.center) +
    Math.max(0, tanks.leftAux ?? 0) +
    Math.max(0, tanks.rightAux ?? 0) +
    Math.max(0, tanks.leftTip ?? 0) +
    Math.max(0, tanks.rightTip ?? 0)
  );
}

/** Classic L/R/C sometimes glitch to zero while FUEL TOTAL is still valid. */
export function isUsableFuelTankBreakdown(
  tanks: LoadFuelTankBreakdown,
  totalFuelLb?: number | null,
): boolean {
  const sum = fuelTankBreakdownSum(tanks);
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
 * Never keep an all-zero glitch when FUEL TOTAL is still high.
 */
export function pickFuelTankBreakdown(
  next: LoadFuelTankBreakdown | undefined,
  prev: LoadFuelTankBreakdown | undefined,
  totalFuelLb?: number | null,
): LoadFuelTankBreakdown | undefined {
  if (next && isUsableFuelTankBreakdown(next, totalFuelLb)) return next;
  if (prev && isUsableFuelTankBreakdown(prev, totalFuelLb)) return prev;
  return undefined;
}

/** Jet-A / avgas nominal densities (lb/US gal) — mirror shared ofp-compliance. */
const CLIENT_JET_A_LB_PER_GAL = 6.7;
const CLIENT_AVGAS_LB_PER_GAL = 6.0;

/**
 * Reject single-sample fuel dips that match Jet-A→avgas density flicker.
 * Browser-safe mirror of shared pickStableLiveFuelLb.
 */
export function pickStableLiveFuelLb(opts: {
  next: number | undefined | null;
  prev: number | undefined | null;
  plannedLb?: number;
  tolLb?: number;
}): number | undefined {
  const next =
    typeof opts.next === 'number' && Number.isFinite(opts.next)
      ? opts.next
      : undefined;
  const prev =
    typeof opts.prev === 'number' && Number.isFinite(opts.prev)
      ? opts.prev
      : undefined;
  if (next === undefined) return prev;
  if (prev === undefined) return next;

  const planned =
    typeof opts.plannedLb === 'number' && Number.isFinite(opts.plannedLb)
      ? opts.plannedLb
      : undefined;
  const tol = opts.tolLb ?? DEFAULT_FUEL_TOL_LB;
  if (planned === undefined || planned < 100) return next;

  const prevOk = Math.abs(prev - planned) <= tol;
  const nextOk = Math.abs(next - planned) <= tol;
  if (!prevOk || nextOk || next >= prev) return next;

  const densityRatio = CLIENT_AVGAS_LB_PER_GAL / CLIENT_JET_A_LB_PER_GAL;
  if (Math.abs(next - prev * densityRatio) <= Math.max(15, tol * 0.4)) {
    return prev;
  }
  return next;
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
  tankCapacity?: LoadFuelTankBreakdown;
};

export type LoadVerificationPayload = {
  plannedLb?: number;
  cargoLb?: number;
  crewLb?: number;
  liveLb?: number;
  ok: boolean;
  stations?: Record<number, number>;
  stationMax?: Record<number, number>;
};

/**
 * Preflight Due line: total station payload, with mission cargo vs crew floor.
 * Crew is always n×170 in the plan — soft-cap cargo on crew seats stays in cargoLb.
 */
export function formatPayloadDueLine(
  payload: Pick<LoadVerificationPayload, 'plannedLb' | 'cargoLb' | 'crewLb'>,
  formatLb: (lb: number | undefined) => string,
): string {
  const due = formatLb(payload.plannedLb);
  const cargo =
    typeof payload.cargoLb === 'number' && Number.isFinite(payload.cargoLb)
      ? payload.cargoLb
      : undefined;
  const crew =
    typeof payload.crewLb === 'number' && Number.isFinite(payload.crewLb)
      ? payload.crewLb
      : undefined;
  if (cargo !== undefined && crew !== undefined) {
    return `Due ${due} · ${formatLb(cargo)} cargo + ${formatLb(crew)} crew`;
  }
  return `Due ${due}`;
}

export function evaluateLoadVerification(opts: {
  plannedFuelLb?: number;
  liveFuelLb?: number;
  plannedPayloadLb?: number;
  livePayloadLb?: number;
  fuelTolLb?: number;
  payloadTolLb?: number;
  fuelTanks?: LoadFuelTankBreakdown;
  fuelTankCapacity?: LoadFuelTankBreakdown;
  payloadStations?: Record<number, number>;
  payloadStationMax?: Record<number, number>;
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
      ...(opts.fuelTankCapacity ? { tankCapacity: opts.fuelTankCapacity } : {}),
    },
    payload: {
      plannedLb: opts.plannedPayloadLb,
      liveLb: livePayload,
      ok: payloadOk,
      ...(opts.payloadStations ? { stations: opts.payloadStations } : {}),
      ...(opts.payloadStationMax ? { stationMax: opts.payloadStationMax } : {}),
    },
  };
}
