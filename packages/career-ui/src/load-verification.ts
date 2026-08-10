/**
 * Browser-safe Loaded vs Due gate (mirrors @msfs-compat/shared evaluateLoadVerification).
 * Do not import @msfs-compat/shared from Vite client code — the package index pulls node:fs.
 */

const DEFAULT_FUEL_TOL_LB = 50;
const DEFAULT_PAYLOAD_TOL_LB = 75;
/** Sim may sit this far under OFP block after taxi / APU without leaving Ready. */
const DEFAULT_FUEL_TAXI_BURN_LB = 150;

function matchOk(
  liveLb: number | undefined,
  plannedLb: number | undefined,
  toleranceLb: number,
): boolean {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) return true;
  if (liveLb === undefined || !Number.isFinite(liveLb)) return false;
  return Math.abs(liveLb - plannedLb) <= Math.max(0, toleranceLb);
}

/** Fuel: allow undershoot for taxi burn; keep overshoot on the tight band. */
export function matchFuelOk(
  liveLb: number | undefined,
  plannedLb: number | undefined,
  toleranceLb: number,
  taxiBurnLb: number = DEFAULT_FUEL_TAXI_BURN_LB,
): boolean {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) return true;
  if (liveLb === undefined || !Number.isFinite(liveLb)) return false;
  const tol = Math.max(0, toleranceLb);
  const taxi = Math.max(0, taxiBurnLb);
  const delta = liveLb - plannedLb;
  if (delta > 0) return delta <= tol;
  return -delta <= tol + taxi;
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

export { fuelTankBreakdownSum };

function outerTankLb(tanks: LoadFuelTankBreakdown): number {
  return (
    Math.max(0, tanks.leftAux ?? 0) +
    Math.max(0, tanks.rightAux ?? 0) +
    Math.max(0, tanks.leftTip ?? 0) +
    Math.max(0, tanks.rightTip ?? 0)
  );
}

function mainTankLb(tanks: LoadFuelTankBreakdown): number {
  return (
    Math.max(0, tanks.left) +
    Math.max(0, tanks.right) +
    Math.max(0, tanks.center)
  );
}

/** Tip/aux collapse while mains hold or rise — SimConnect / mid-inject flicker. */
export function outerTanksCollapsedWhileMainsStable(
  next: LoadFuelTankBreakdown,
  prev: LoadFuelTankBreakdown,
): boolean {
  const prevOuter = outerTankLb(prev);
  const nextOuter = outerTankLb(next);
  if (prevOuter < 25) return false;
  if (nextOuter > prevOuter * 0.15) return false;
  const prevMain = mainTankLb(prev);
  const nextMain = mainTankLb(next);
  const mainTol = Math.max(40, prevMain * 0.08);
  return nextMain >= prevMain - mainTol;
}

/** Classic L/R/C sometimes glitch to zero while FUEL TOTAL is still valid. */
export function isUsableFuelTankBreakdown(
  tanks: LoadFuelTankBreakdown,
  totalFuelLb?: number | null,
  prev?: LoadFuelTankBreakdown | null,
): boolean {
  const sum = fuelTankBreakdownSum(tanks);
  const total =
    typeof totalFuelLb === 'number' && Number.isFinite(totalFuelLb)
      ? Math.max(0, totalFuelLb)
      : undefined;
  if (sum < 1) {
    // Failed reads leave total undefined — do not treat that as an empty aircraft.
    return total !== undefined && total < 1;
  }
  if (total !== undefined && total > 50 && sum < total * 0.15) {
    return false;
  }
  if (prev && outerTanksCollapsedWhileMainsStable(tanks, prev)) {
    return false;
  }
  return true;
}

/**
 * Prefer a usable next tank map; otherwise keep previous *if still usable*.
 * Never keep an all-zero glitch when FUEL TOTAL is still high.
 * Tip/aux-only collapse → keep fresh mains, hold previous outers.
 */
export function pickFuelTankBreakdown(
  next: LoadFuelTankBreakdown | undefined,
  prev: LoadFuelTankBreakdown | undefined,
  totalFuelLb?: number | null,
): LoadFuelTankBreakdown | undefined {
  if (next && isUsableFuelTankBreakdown(next, totalFuelLb, prev)) return next;
  if (
    next &&
    prev &&
    outerTanksCollapsedWhileMainsStable(next, prev) &&
    isUsableFuelTankBreakdown(
      { left: next.left, right: next.right, center: next.center },
      totalFuelLb,
    )
  ) {
    return {
      left: next.left,
      right: next.right,
      center: next.center,
      ...(prev.leftAux != null ? { leftAux: prev.leftAux } : {}),
      ...(prev.rightAux != null ? { rightAux: prev.rightAux } : {}),
      ...(prev.leftTip != null ? { leftTip: prev.leftTip } : {}),
      ...(prev.rightTip != null ? { rightTip: prev.rightTip } : {}),
    };
  }
  if (prev && isUsableFuelTankBreakdown(prev, totalFuelLb)) return prev;
  return undefined;
}

/** Prefer tank-sum when tip/aux are shown but FUEL TOTAL under-read (Sim 2508 vs TL+TR). */
export function liveFuelLbCoherentWithTanks(
  liveFuelLb: number | undefined | null,
  tanks: LoadFuelTankBreakdown | undefined | null,
): number | undefined {
  const live =
    typeof liveFuelLb === 'number' && Number.isFinite(liveFuelLb)
      ? liveFuelLb
      : undefined;
  if (!tanks) return live;
  const sum = fuelTankBreakdownSum(tanks);
  if (sum < 1) return live;
  if (live === undefined) return sum;
  if (sum > live + 40) return sum;
  return live;
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
  nextTanks?: LoadFuelTankBreakdown | null;
  prevTanks?: LoadFuelTankBreakdown | null;
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
  if (!prevOk || nextOk || next >= prev) {
    return liveFuelLbCoherentWithTanks(next, opts.nextTanks ?? opts.prevTanks);
  }

  const densityRatio = CLIENT_AVGAS_LB_PER_GAL / CLIENT_JET_A_LB_PER_GAL;
  if (Math.abs(next - prev * densityRatio) <= Math.max(15, tol * 0.4)) {
    return liveFuelLbCoherentWithTanks(prev, opts.prevTanks);
  }

  if (
    opts.prevTanks &&
    opts.nextTanks &&
    outerTanksCollapsedWhileMainsStable(opts.nextTanks, opts.prevTanks)
  ) {
    const lostOuter =
      outerTankLb(opts.prevTanks) - outerTankLb(opts.nextTanks);
    const drop = prev - next;
    if (
      lostOuter > 30 &&
      Math.abs(drop - lostOuter) <= Math.max(50, lostOuter * 0.3)
    ) {
      return liveFuelLbCoherentWithTanks(prev, opts.prevTanks);
    }
  }

  const coherentNext = liveFuelLbCoherentWithTanks(next, opts.nextTanks);
  if (
    coherentNext !== undefined &&
    prevOk &&
    Math.abs(coherentNext - planned!) <= tol
  ) {
    return coherentNext;
  }
  return coherentNext ?? next;
}

/**
 * Final Fuel-card gate: hold tip/aux, then force Sim total to match the tank
 * row. Fixes the Learjet flash where schematic shows TL/TR 527 but Sim stays
 * at L+R only (2508) because an earlier path skipped coherence.
 */
export function stabilizeDisplayedFuel(opts: {
  liveLb?: number;
  plannedLb?: number;
  tanks?: LoadFuelTankBreakdown;
  tankCapacity?: LoadFuelTankBreakdown;
  stickyLiveLb?: number;
  stickyTanks?: LoadFuelTankBreakdown;
}): {
  liveLb: number | undefined;
  tanks: LoadFuelTankBreakdown | undefined;
} {
  let tanks =
    pickFuelTankBreakdown(
      opts.tanks,
      opts.stickyTanks,
      opts.liveLb ?? opts.stickyLiveLb,
    ) ??
    opts.tanks ??
    opts.stickyTanks;

  // Cold sticky: mains full + Due shortfall + tip/aux capacity → attribute
  // the gap to outers (Learjet AUX hole reads as L+R only = 2508).
  tanks = inferMissingOuterTanks({
    tanks,
    tankCapacity: opts.tankCapacity,
    liveLb: opts.liveLb,
    plannedLb: opts.plannedLb,
  });

  const stable =
    pickStableLiveFuelLb({
      next: opts.liveLb,
      prev: opts.stickyLiveLb,
      plannedLb: opts.plannedLb,
      nextTanks: tanks,
      prevTanks: opts.stickyTanks,
    }) ?? opts.liveLb;

  let liveLb = liveFuelLbCoherentWithTanks(stable, tanks) ?? stable;

  // Last resort: never paint Sim below the visible tank sum.
  if (tanks) {
    const sum = fuelTankBreakdownSum(tanks);
    if (sum > (liveLb ?? 0) + 40) liveLb = sum;
  }

  // Prefer sticky total when it still matches Due and the new reading does not.
  const planned = opts.plannedLb;
  const sticky = opts.stickyLiveLb;
  if (
    planned != null &&
    Number.isFinite(planned) &&
    sticky != null &&
    Number.isFinite(sticky) &&
    Math.abs(sticky - planned) <= DEFAULT_FUEL_TOL_LB &&
    (liveLb == null || Math.abs(liveLb - planned) > DEFAULT_FUEL_TOL_LB)
  ) {
    liveLb = sticky;
  }

  return { liveLb, tanks };
}

/**
 * When wing mains are essentially full, tip/aux capacity exists, outers read
 * empty, and Due is higher than the L/R sum — treat the shortfall as tip fuel
 * for display (SimConnect AUX hole on Learjet-class jets).
 */
export function inferMissingOuterTanks(opts: {
  tanks?: LoadFuelTankBreakdown;
  tankCapacity?: LoadFuelTankBreakdown;
  liveLb?: number;
  plannedLb?: number;
}): LoadFuelTankBreakdown | undefined {
  const tanks = opts.tanks;
  const cap = opts.tankCapacity;
  if (!tanks || !cap) return tanks;
  const outerCap =
    (cap.leftAux ?? 0) +
    (cap.rightAux ?? 0) +
    (cap.leftTip ?? 0) +
    (cap.rightTip ?? 0);
  if (outerCap < 25) return tanks;
  if (outerTankLb(tanks) >= 25) return tanks;

  const leftCap = cap.left ?? 0;
  const rightCap = cap.right ?? 0;
  if (leftCap < 50 || rightCap < 50) return tanks;
  if (tanks.left < leftCap * 0.9 || tanks.right < rightCap * 0.9) return tanks;

  const planned = opts.plannedLb;
  if (planned == null || !Number.isFinite(planned) || planned < 100) {
    return tanks;
  }
  const mainSum = tanks.left + tanks.right + tanks.center;
  const deficit = planned - mainSum;
  if (deficit < 40) return tanks;

  const useAux = (cap.leftAux ?? 0) + (cap.rightAux ?? 0) > 25;
  const half = deficit / 2;
  if (useAux) {
    return { ...tanks, leftAux: half, rightAux: half };
  }
  return { ...tanks, leftTip: half, rightTip: half };
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

  const fuelOk = matchFuelOk(liveFuel, opts.plannedFuelLb, fuelTol);
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
