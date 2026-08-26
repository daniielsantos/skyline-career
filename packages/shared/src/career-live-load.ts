import { careerFuelMatchOk, careerLoadWeightMatchOk, careerPreflightReady, payloadMatchToleranceLb } from './career-mission.js';
import {
  DEFAULT_AVGAS_LB_PER_GAL,
  DEFAULT_JET_A_LB_PER_GAL,
} from './ofp-compliance.js';
import type { OfpStationRoleMap } from './types/ofp-compliance.js';

/**
 * Live payload for `pax_and_cargo`: OFP payload is cabin + holds, not cockpit crew.
 * Prefer `payloadStations` (pack passenger + baggage). Else all minus crew
 * (default S1/S2; Maddog crew is S6/S7).
 */
export function paxAndCargoLiveStationSumLb(
  stations: Record<number, number>,
  crewStations?: readonly number[] | null,
  payloadStations?: readonly number[] | null,
): number {
  const payloadIdx = (payloadStations ?? []).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  if (payloadIdx.length > 0) {
    const want = new Set(payloadIdx);
    let sum = 0;
    for (const [key, lb] of Object.entries(stations)) {
      const idx = Number(key);
      if (!want.has(idx)) continue;
      if (Number.isFinite(lb)) sum += lb;
    }
    return sum;
  }
  const crewIdx =
    crewStations && crewStations.length > 0 ? crewStations : [1, 2];
  const crew = new Set(crewIdx.filter((n) => Number.isFinite(n) && n > 0));
  let sum = 0;
  for (const [key, lb] of Object.entries(stations)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || crew.has(idx)) continue;
    if (Number.isFinite(lb)) sum += lb;
  }
  return sum;
}

/**
 * Career pax_and_cargo Loaded vs Due: SimBrief payload is ZFW − OEW.
 * When EFB/CDU ZFW + OFP empty are available, use that residual (PMDG classic
 * stations remap crew/service and under-read cabin+holds after CDU ZFW inject).
 * Else sum pack passenger + baggage + service (never cockpit crew).
 */
export function careerPaxAndCargoLivePayloadLb(opts: {
  stations?: Record<number, number>;
  stationRoles?: OfpStationRoleMap;
  zfwLb?: number;
  ofpEmptyLb?: number;
}): number | undefined {
  if (
    typeof opts.zfwLb === 'number' &&
    Number.isFinite(opts.zfwLb) &&
    typeof opts.ofpEmptyLb === 'number' &&
    Number.isFinite(opts.ofpEmptyLb)
  ) {
    const fromZfw = opts.zfwLb - opts.ofpEmptyLb;
    if (fromZfw > 500) {
      return fromZfw;
    }
  }
  const roles = opts.stationRoles;
  if (!roles || !opts.stations) return undefined;
  const payloadStations = [
    ...(roles.passengerStations ?? []),
    ...(roles.baggageStations ?? []),
    ...(roles.serviceStations ?? []),
  ].filter((n) => Number.isFinite(n) && n > 0);
  const stationSum = paxAndCargoLiveStationSumLb(
    opts.stations,
    roles.crewStations,
    payloadStations.length > 0 ? payloadStations : undefined,
  );
  return stationSum > 0 ? stationSum : undefined;
}

/**
 * Fenix/JF EFB can zero ZFW while PAYLOAD STATION WEIGHT stays loaded.
 * Watch must not replace that mass-balance read with the cabin station sum.
 */
export function pickPaxAndCargoDisplayedLiveLb(opts: {
  payloadSource: 'stations' | 'mass-balance' | 'tfdi-efb' | 'a2a-lvars' | 'none';
  resolvedPayloadLb?: number | null;
  cabinStationSumLb?: number;
}): number | undefined {
  if (
    opts.payloadSource === 'mass-balance' &&
    typeof opts.resolvedPayloadLb === 'number' &&
    Number.isFinite(opts.resolvedPayloadLb)
  ) {
    return Math.max(0, opts.resolvedPayloadLb);
  }
  if (
    typeof opts.cabinStationSumLb === 'number' &&
    Number.isFinite(opts.cabinStationSumLb)
  ) {
    return opts.cabinStationSumLb;
  }
  if (
    typeof opts.resolvedPayloadLb === 'number' &&
    Number.isFinite(opts.resolvedPayloadLb)
  ) {
    return opts.resolvedPayloadLb;
  }
  return undefined;
}

/** Default Loaded vs Due tolerances (lb). */
export const DEFAULT_FUEL_TOL_LB = 50;
export const DEFAULT_PAYLOAD_TOL_LB = 75;
export { DEFAULT_FUEL_TAXI_BURN_LB } from './career-mission.js';

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

  // Classic stations moved vs last good sample → user edited EFB/tablet.
  // 15 lb (not the 75 lb READY tol) so the 2nd/3rd cargo step still counts.
  // Exception: Accu-Sim/tablet dumped real mass while PAYLOAD STATION WEIGHT
  // barely twitched — trust gross−empty−fuel, not the ghost station sum.
  if (
    station !== undefined &&
    prevStations !== undefined &&
    Math.abs(station - prevStations) >= 15
  ) {
    if (
      mb !== undefined &&
      station > mb * 2 + 200 &&
      station - mb > 400
    ) {
      return { payloadLb: mb, source: 'mass-balance' };
    }
    return { payloadLb: station, source: 'stations' };
  }

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
    // Already tracking classic stations (post-inject). A lagging TOTAL WEIGHT
    // must not revert the first EFB edit on the next Watch tick.
    if (station !== undefined && prevStations !== undefined) {
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
  fuel: {
    plannedLb?: number;
    liveLb: number;
    ok: boolean;
    taxiBurnLb?: number;
  };
  payload: { plannedLb?: number; liveLb?: number; ok: boolean };
};

export type FuelTankBreakdown = {
  left: number;
  right: number;
  center: number;
  /** Classic LEFT AUX (often tip tanks on jets) — omitted when unused. */
  leftAux?: number;
  rightAux?: number;
  /** Classic LEFT/RIGHT TIP — omitted when unused. */
  leftTip?: number;
  rightTip?: number;
};

/** Sum all classic tank sides present on a breakdown (lb). */
export function fuelTankBreakdownSum(tanks: FuelTankBreakdown): number {
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

function outerTankLb(tanks: FuelTankBreakdown): number {
  return (
    Math.max(0, tanks.leftAux ?? 0) +
    Math.max(0, tanks.rightAux ?? 0) +
    Math.max(0, tanks.leftTip ?? 0) +
    Math.max(0, tanks.rightTip ?? 0)
  );
}

function mainTankLb(tanks: FuelTankBreakdown): number {
  return (
    Math.max(0, tanks.left) +
    Math.max(0, tanks.right) +
    Math.max(0, tanks.center)
  );
}

/**
 * True when tip/aux collapse toward zero while main tanks hold or rise —
 * typical SimConnect hole on jets with tip/aux tanks (also mid fuel-inject
 * when mains are ramping up and AUX briefly reads 0).
 */
export function outerTanksCollapsedWhileMainsStable(
  next: FuelTankBreakdown,
  prev: FuelTankBreakdown,
): boolean {
  const prevOuter = outerTankLb(prev);
  const nextOuter = outerTankLb(next);
  if (prevOuter < 25) return false;
  if (nextOuter > prevOuter * 0.15) return false;
  const prevMain = mainTankLb(prev);
  const nextMain = mainTankLb(next);
  const mainTol = Math.max(40, prevMain * 0.08);
  // Mains held (±tol) OR increased (inject ramp) while outers vanished.
  return nextMain >= prevMain - mainTol;
}

/**
 * Tip/aux read ~0 while mains stay loaded — trust it when FUEL TOTAL agrees
 * with mains-only (real drain / M&B clear). Keep sticky when TOTAL still
 * looks like mains+previous outers (Learjet SimConnect flicker).
 *
 * The tolerance is bounded by *how much outer fuel vanished*, not by a share of
 * the total: on a 30 000 lb jet a flat 3% would swallow an entire 800 lb tip
 * pair and release the sticky on the very flicker it exists to absorb.
 */
export function outerTankCollapseIsTrusted(
  next: FuelTankBreakdown,
  prev: FuelTankBreakdown,
  totalFuelLb?: number | null,
): boolean {
  if (!outerTanksCollapsedWhileMainsStable(next, prev)) return false;
  const total =
    typeof totalFuelLb === 'number' && Number.isFinite(totalFuelLb)
      ? Math.max(0, totalFuelLb)
      : undefined;
  if (total === undefined) return false;
  const lostOuter = outerTankLb(prev) - outerTankLb(next);
  if (lostOuter < 25) return false;
  const tol = Math.max(
    20,
    Math.min(Math.max(40, total * 0.03), lostOuter * 0.5),
  );
  return Math.abs(total - mainTankLb(next)) <= tol;
}

/**
 * Mark outers we confirmed empty with explicit zeros. An absent key only means
 * "not read" (SimConnect omits tanks it cannot see), so downstream heuristics
 * cannot tell a drained tip from an unreadable one without this marker.
 */
function withDrainedOuters(
  next: FuelTankBreakdown,
  prev: FuelTankBreakdown,
): FuelTankBreakdown {
  return {
    left: next.left,
    right: next.right,
    center: next.center,
    ...(prev.leftAux != null ? { leftAux: next.leftAux ?? 0 } : {}),
    ...(prev.rightAux != null ? { rightAux: next.rightAux ?? 0 } : {}),
    ...(prev.leftTip != null ? { leftTip: next.leftTip ?? 0 } : {}),
    ...(prev.rightTip != null ? { rightTip: next.rightTip ?? 0 } : {}),
  };
}

/**
 * Classic L/R/C SimVars sometimes return all zeros while FUEL TOTAL is still valid.
 * Reject those glitches so UI keeps the previous schematic / omits tanks.
 * Also reject tip/aux-only collapses (Learjet post-inject flicker) unless
 * FUEL TOTAL confirms the outers are really empty.
 */
export function isUsableFuelTankBreakdown(
  tanks: FuelTankBreakdown,
  totalFuelLb?: number | null,
  prev?: FuelTankBreakdown | null,
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
    return outerTankCollapseIsTrusted(tanks, prev, totalFuelLb);
  }
  return true;
}

/**
 * Prefer a usable next tank map; otherwise keep previous *if still usable*.
 * Never keep an all-zero glitch when FUEL TOTAL is still high — that froze the
 * Preflight L/R schematic at 0 while Sim total stayed correct.
 * When only tip/aux collapse (mains held or rising), keep fresh mains and
 * hold the previous outer tanks so the tip schematic does not flash empty —
 * unless TOTAL already matches mains-only (tips truly drained).
 */
export function pickFuelTankBreakdown(
  next: FuelTankBreakdown | undefined,
  prev: FuelTankBreakdown | undefined,
  totalFuelLb?: number | null,
): FuelTankBreakdown | undefined {
  if (next && prev && outerTankCollapseIsTrusted(next, prev, totalFuelLb)) {
    return withDrainedOuters(next, prev);
  }
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

/**
 * When tip/aux are held for the schematic but FUEL TOTAL / tank-sum under-read
 * (Learjet flash: Sim 2508 = L+R while TL/TR still show 527), prefer the
 * breakdown sum so the Fuel card matches the tanks row.
 */
export function liveFuelLbCoherentWithTanks(
  liveFuelLb: number | undefined | null,
  tanks: FuelTankBreakdown | undefined | null,
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

/**
 * Reject single-sample fuel dips that match the Jet-A→avgas density flicker
 * (~6.7→6.0 ≈ 10.4%) so Preflight Ready does not flap while fuel is unchanged.
 * Also rejects dips that line up with tip/aux SimConnect collapse.
 */
export function pickStableLiveFuelLb(opts: {
  next: number | undefined | null;
  prev: number | undefined | null;
  plannedLb?: number;
  tolLb?: number;
  nextTanks?: FuelTankBreakdown | null;
  prevTanks?: FuelTankBreakdown | null;
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
    // Even when next "wins", lift it to match held tip tanks on the schematic.
    return liveFuelLbCoherentWithTanks(next, opts.nextTanks ?? opts.prevTanks);
  }

  // Density flicker: live weight scales by avgas/Jet-A when gallons are unchanged.
  const densityRatio = DEFAULT_AVGAS_LB_PER_GAL / DEFAULT_JET_A_LB_PER_GAL;
  if (Math.abs(next - prev * densityRatio) <= Math.max(15, tol * 0.4)) {
    const nextSum = opts.nextTanks
      ? fuelTankBreakdownSum(opts.nextTanks)
      : undefined;
    const prevSum = opts.prevTanks
      ? fuelTankBreakdownSum(opts.prevTanks)
      : undefined;
    // Tanks dropped with the total → real EFB/M&B drain, not a density blip.
    if (
      nextSum !== undefined &&
      prevSum !== undefined &&
      Math.abs(prevSum - nextSum) >= 15
    ) {
      return liveFuelLbCoherentWithTanks(next, opts.nextTanks);
    }
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

  // Tips held on schematic while total under-read (nextTanks already merged).
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
  /** Prefer SimBrief OFP taxi fuel when known (else default flat/1% floor). */
  taxiBurnLb?: number;
}): LoadVerificationWeights {
  const fuelTol = opts.fuelTolLb ?? DEFAULT_FUEL_TOL_LB;
  const payloadTol =
    opts.payloadTolLb ??
    payloadMatchToleranceLb(opts.plannedPayloadLb);
  const liveFuel =
    typeof opts.liveFuelLb === 'number' && Number.isFinite(opts.liveFuelLb)
      ? opts.liveFuelLb
      : undefined;
  const livePayload =
    typeof opts.livePayloadLb === 'number' && Number.isFinite(opts.livePayloadLb)
      ? opts.livePayloadLb
      : undefined;

  const fuelOk = careerFuelMatchOk(
    liveFuel,
    opts.plannedFuelLb,
    fuelTol,
    opts.taxiBurnLb,
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
      ...(typeof opts.taxiBurnLb === 'number'
        ? { taxiBurnLb: opts.taxiBurnLb }
        : {}),
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

/**
 * True when a new station map looks like a truncated IPC pass (timeouts
 * mid-loop) rather than a real EFB unload. UI paints missing keys as 0, so
 * persisting {1:170,2:170} after a 16-station inject wipes S3+.
 */
export function stationSampleIncomplete(
  prev: Record<number, number> | undefined | null,
  next: Record<number, number> | undefined | null,
): boolean {
  if (!next) return true;
  if (!prev) return false;
  const prevKeys = Object.keys(prev).length;
  const nextKeys = Object.keys(next).length;
  if (prevKeys >= 8 && nextKeys > 0 && nextKeys < 8) return true;
  if (prevKeys >= 12 && nextKeys <= prevKeys - 6) return true;
  return false;
}

/** True when classic station weights moved enough to persist / paint. */
export function stationWeightsDrifted(
  prev: Record<number, number> | undefined | null,
  next: Record<number, number> | undefined | null,
  minDeltaLb = 5,
): boolean {
  if (!next) return false;
  if (stationSampleIncomplete(prev, next)) return false;
  if (!prev) return true;
  const keys = new Set([
    ...Object.keys(prev).map(Number),
    ...Object.keys(next).map(Number),
  ]);
  for (const key of keys) {
    if (Math.abs((prev[key] ?? 0) - (next[key] ?? 0)) >= minDeltaLb) {
      return true;
    }
  }
  return false;
}
