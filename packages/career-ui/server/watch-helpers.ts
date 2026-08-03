/**
 * Live MSFS watch helpers for career-ui — mirrors agent CLI `career watch`.
 */

import {
  createMissionFlightWatchState,
  applyWalletDelta,
  createCruiseSampleState,
  createFlightScoreAccumulator,
  cruiseSampleStatus,
  DEFAULT_CRUISE_EMA_ALPHA,
  departMission,
  estimateMissionBlockHours,
  evaluateLoadVerification,
  evaluateMinAirborneElapsed,
  evaluateMissionFlightTransition,
  finalizeFlightScore,
  flightPhaseFromSample,
  isUsableFuelTankBreakdown,
  loadVerificationDrifted,
  mergeAirframePerfOverride,
  DEFAULT_JET_A_LB_PER_GAL,
  pickFuelTankBreakdown,
  pickStableLiveFuelLb,
  pushCruiseTick,
  pushFlightScoreSample,
  resolveLivePayloadLb,
  sanitizeFuelDensityLbPerGal,
  KG_TO_LB,
  resolveAirportCoords,
  resolveExpectedRouteMs,
  routeDistanceNm,
  settleMission,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type CruiseSampleState,
  type CruiseSampleStatus,
  type FlightGroundSample,
  type FlightScoreAccumulator,
  type FlightScoreSnapshot,
  type FuelTankBreakdown,
  type MissionFlightEvent,
  type MissionFlightWatchState,
  type MissionIntent,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge, setNamedPipeDebugLog } from '../../agent/src/named-pipe-sim-bridge.ts';
import {
  readLiveCruiseTasKt,
  sampleLiveCruiseFuelFlowKgPerHour,
} from '../../agent/src/sample-cruise-burn.ts';
import { watchDebugLog, WATCH_DEBUG_LOG_PATH } from './debug-log.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import { preflightBlocksDepart } from './preflight-helpers.ts';
import { withSimBridgeExclusive } from './simbridge-gate.ts';

export type WatchLoadVerification = {
  ready: boolean;
  fuel: {
    plannedLb?: number;
    liveLb: number;
    ok: boolean;
    tanks?: FuelTankBreakdown;
  };
  payload: {
    plannedLb?: number;
    liveLb?: number;
    ok: boolean;
    stations?: Record<number, number>;
  };
};

export type WatchFlightTimePayload = {
  airborneAtMs: number;
  expectedRouteMs: number;
  requiredMs: number;
  elapsedMs: number;
  ratio: number;
  met: boolean;
};

export type WatchStatusPayload = {
  running: boolean;
  missionId: string | null;
  missionStatus: string | null;
  phase: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  groundSpeedKt: number | null;
  position: { lat: number; lon: number } | null;
  /** Live fuel total (lb) sampled on the Watch pipe. */
  liveFuelLb: number | null;
  /** Live payload total (lb) — stations/mass-balance policy. */
  livePayloadLb: number | null;
  /**
   * Authoritative Loaded vs Due from the Watch owner (also persisted on mission).
   * UI should prefer this over inventing ready client-side.
   */
  loadVerification: WatchLoadVerification | null;
  sawAirborne: boolean;
  lastEvent: MissionFlightEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  /** False when Watch is running but the NDJSON pipe socket dropped. */
  pipeConnected: boolean;
  settlement: {
    payoutUsd: number;
    penaltyUsd: number;
    lateTicks: number;
    onTime: boolean;
    deliveredKg: number;
    residualFuelKg: number | null;
    /** Touchdown vertical speed (fpm), typically negative. */
    landingFpm: number | null;
    /** Airborne wall-clock duration (ms), when known. */
    flightDurationMs: number | null;
    /** Flight scorecard from Watch telemetry. */
    flightScore: FlightScoreSnapshot | null;
  } | null;
  walletUsd: number | null;
  autoDepart: boolean;
  autoSettle: boolean;
  intervalSec: number;
  allowDepartOverride: boolean;
  /** Live airborne progress vs planned route (anti time-compression). */
  flightTime: WatchFlightTimePayload | null;
  /** Stable-cruise burn/TAS sampler progress for this watch session. */
  cruiseSample: CruiseSampleStatus | null;
};

type WatchCallbacks = {
  /** Consistent world+missions snapshot (may run economy catch-up). */
  withCareerRead: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  /** Atomic load → mutate → persist for economy + missions. */
  withCareerWrite: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  /**
   * Reload missions under the career lock, then apply. Return false to skip
   * persist (e.g. mission already cancelled). Missions-only — do not nest
   * withCareerRead/Write (same non-reentrant lock).
   */
  updateOpenMission: (
    missionId: string,
    update: (
      missions: CareerMissionsState,
      mission: MissionIntent,
      idx: number,
    ) => Promise<boolean> | boolean,
  ) => Promise<boolean>;
};

type WatchOptions = {
  missionId: string;
  intervalSec?: number;
  autoDepart?: boolean;
  autoSettle?: boolean;
  requireEnginesOff?: boolean;
  requireDestProximity?: boolean;
  settleRadiusNm?: number;
  pipeName?: string;
  /** Allow auto-depart even when lastPreflightCheck verdict is fail. */
  allowDepartOverride?: boolean;
};

export async function sampleLiveFlight(
  bridge: NamedPipeSimBridge,
  opts?: {
    /** Keep last-known position when a lat/lon read soft-fails (avoids map blink). */
    previousPosition?: { lat: number; lon: number } | null;
  },
): Promise<
  FlightGroundSample & {
    bankDeg?: number;
    pitchDeg?: number;
    gForce?: number;
    indicatedAirspeedKt?: number;
    altitudeFt?: number;
    overspeedWarning?: boolean;
    stallWarning?: boolean;
    gearDown?: boolean;
    flapsPct?: number;
  }
> {
  const snap = await bridge.snapshot();
  let position: { lat: number; lon: number } | undefined;
  let groundSpeedKt: number | undefined;
  try {
    const lat = await bridge.readSimVar({ name: 'PLANE LATITUDE', unit: 'degrees' });
    const lon = await bridge.readSimVar({ name: 'PLANE LONGITUDE', unit: 'degrees' });
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      !(lat === 0 && lon === 0)
    ) {
      position = { lat, lon };
    }
  } catch {
    position = undefined;
  }
  if (!position && opts?.previousPosition) {
    const prev = opts.previousPosition;
    if (
      Number.isFinite(prev.lat) &&
      Number.isFinite(prev.lon) &&
      !(prev.lat === 0 && prev.lon === 0)
    ) {
      position = { lat: prev.lat, lon: prev.lon };
    }
  }
  try {
    const gs = await bridge.readSimVar({
      name: 'GROUND VELOCITY',
      unit: 'knots',
    });
    if (Number.isFinite(gs) && gs >= 0) {
      groundSpeedKt = gs;
    }
  } catch {
    groundSpeedKt = undefined;
  }
  let verticalSpeedFpm: number | undefined;
  try {
    const vs = await bridge.readSimVar({
      name: 'VERTICAL SPEED',
      unit: 'feet per minute',
    });
    if (Number.isFinite(vs)) verticalSpeedFpm = vs;
  } catch {
    verticalSpeedFpm = undefined;
  }

  const readOpt = async (
    name: string,
    unit: string,
  ): Promise<number | undefined> => {
    try {
      const v = await bridge.readSimVar({ name, unit });
      return Number.isFinite(v) ? v : undefined;
    } catch {
      return undefined;
    }
  };

  const [bankDeg, pitchDeg, gForce, indicatedAirspeedKt, altitudeFt, gearPct, flapsPct] =
    await Promise.all([
      readOpt('PLANE BANK DEGREES', 'degrees'),
      readOpt('PLANE PITCH DEGREES', 'degrees'),
      readOpt('G FORCE', 'Gforce'),
      readOpt('AIRSPEED INDICATED', 'knots'),
      readOpt('PLANE ALTITUDE', 'feet'),
      readOpt('GEAR TOTAL PCT EXTENDED', 'percent'),
      readOpt('TRAILING EDGE FLAPS LEFT PERCENT', 'percent'),
    ]);

  let overspeedWarning: boolean | undefined;
  let stallWarning: boolean | undefined;
  try {
    const o = await bridge.readSimVar({ name: 'OVERSPEED WARNING', unit: 'bool' });
    if (Number.isFinite(o)) overspeedWarning = o > 0.5;
  } catch {
    overspeedWarning = undefined;
  }
  try {
    const s = await bridge.readSimVar({ name: 'STALL WARNING', unit: 'bool' });
    if (Number.isFinite(s)) stallWarning = s > 0.5;
  } catch {
    stallWarning = undefined;
  }

  return {
    onGround: snap.onGround,
    enginesRunning: snap.enginesRunning,
    position,
    groundSpeedKt,
    verticalSpeedFpm,
    bankDeg,
    pitchDeg,
    gForce,
    indicatedAirspeedKt,
    altitudeFt,
    overspeedWarning,
    stallWarning,
    gearDown:
      typeof gearPct === 'number' ? gearPct >= 80 : undefined,
    flapsPct,
  };
}

/**
 * Lightweight fuel + payload on an already-open Watch bridge.
 * Stations + mass-balance via resolveLivePayloadLb (same policy as preflight/inject).
 * Also returns classic L/R/C tank breakdown and per-station weights for UI schematics.
 */
export async function sampleLiveLoadLb(
  bridge: NamedPipeSimBridge,
  plannedPayloadLb?: number,
  previousStationSumLb?: number,
): Promise<{
  fuelLb: number | null;
  payloadLb: number | null;
  payloadSource: 'stations' | 'mass-balance' | 'none';
  massBalanceLb?: number | null;
  emptyWeightLb?: number | null;
  grossWeightLb?: number | null;
  stationSumLb?: number | null;
  fuelTanks?: FuelTankBreakdown;
  stations?: Record<number, number>;
}> {
  let density = DEFAULT_JET_A_LB_PER_GAL;
  let totalCapacityGal: number | undefined;
  try {
    const dens = await bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
    try {
      const cap = await bridge.readSimVar({
        name: 'FUEL TOTAL CAPACITY',
        unit: 'gallons',
      });
      if (Number.isFinite(cap) && cap > 0) totalCapacityGal = cap;
    } catch {
      /* capacity optional — density sanitize still applies defaults */
    }
    density = sanitizeFuelDensityLbPerGal(
      Number.isFinite(dens) && dens > 0.1 ? dens : undefined,
      { totalCapacityGal },
    );
  } catch {
    density = sanitizeFuelDensityLbPerGal(undefined, { totalCapacityGal });
  }

  const readGal = async (name: string): Promise<number> => {
    try {
      const gal = await bridge.readSimVar({ name, unit: 'gallons' });
      return Number.isFinite(gal) && gal > 0 ? gal : 0;
    } catch {
      return 0;
    }
  };

  const leftMain = await readGal('FUEL TANK LEFT MAIN QUANTITY');
  const rightMain = await readGal('FUEL TANK RIGHT MAIN QUANTITY');
  const centerGal =
    (await readGal('FUEL TANK CENTER QUANTITY')) +
    (await readGal('FUEL TANK CENTER2 QUANTITY'));
  const leftAux = await readGal('FUEL TANK LEFT AUX QUANTITY');
  const rightAux = await readGal('FUEL TANK RIGHT AUX QUANTITY');
  const leftTip = await readGal('FUEL TANK LEFT TIP QUANTITY');
  const rightTip = await readGal('FUEL TANK RIGHT TIP QUANTITY');

  const leftLb = (leftMain + leftAux + leftTip) * density;
  const rightLb = (rightMain + rightAux + rightTip) * density;
  const centerLb = centerGal * density;
  const tankTotalLb = leftLb + rightLb + centerLb;
  const fuelTanks = { left: leftLb, right: rightLb, center: centerLb };

  let fuelLb: number | null = tankTotalLb > 0 ? tankTotalLb : null;
  try {
    const fuel = await bridge.readSimVar({
      name: 'FUEL TOTAL QUANTITY WEIGHT',
      unit: 'pounds',
    });
    if (Number.isFinite(fuel) && fuel >= 0) {
      // Prefer total when it is meaningfully larger (collector / unmapped tanks).
      fuelLb =
        fuel > tankTotalLb * 1.02 + 1 ? fuel : Math.max(tankTotalLb, fuel);
    }
  } catch {
    try {
      const gal = await bridge.readSimVar({
        name: 'FUEL TOTAL QUANTITY',
        unit: 'gallons',
      });
      const fuel = gal * density;
      if (Number.isFinite(fuel) && fuel >= 0) {
        fuelLb =
          fuel > tankTotalLb * 1.02 + 1 ? fuel : Math.max(tankTotalLb, fuel);
      }
    } catch {
      /* keep tank sum */
    }
  }

  const stations: Record<number, number> = {};
  let stationSum = 0;
  let stationsRead = 0;
  for (let index = 1; index <= 16; index += 1) {
    try {
      const w = await bridge.readSimVar({
        name: `PAYLOAD STATION WEIGHT:${index}`,
        unit: 'pounds',
      });
      if (Number.isFinite(w) && w >= 0) {
        stations[index] = w;
        stationSum += w;
        stationsRead += 1;
      }
    } catch {
      /* station missing — stop after a gap of failures at the start */
      if (stationsRead === 0 && index >= 8) break;
    }
  }

  let massBalanceLb: number | undefined;
  let emptyWeightLb: number | undefined;
  let grossWeightLb: number | undefined;
  if (fuelLb !== null) {
    try {
      const empty = await bridge.readSimVar({
        name: 'EMPTY WEIGHT',
        unit: 'pounds',
      });
      const gross = await bridge.readSimVar({
        name: 'TOTAL WEIGHT',
        unit: 'pounds',
      });
      if (Number.isFinite(empty) && empty > 0) emptyWeightLb = empty;
      if (Number.isFinite(gross) && gross > 0) grossWeightLb = gross;
      if (
        emptyWeightLb !== undefined &&
        grossWeightLb !== undefined &&
        grossWeightLb > emptyWeightLb
      ) {
        massBalanceLb = Math.max(
          0,
          grossWeightLb - emptyWeightLb - Math.max(0, fuelLb),
        );
      }
    } catch {
      massBalanceLb = undefined;
    }
  }

  const resolved = resolveLivePayloadLb({
    stationSumLb: stationsRead > 0 ? stationSum : undefined,
    massBalanceLb,
    plannedLb: plannedPayloadLb,
    previousStationSumLb,
  });

  // Local fallback: even if @msfs-compat/shared dist is stale, trust a clear
  // drop in classic stations so Preflight can leave READY after the user empties.
  let payloadLb =
    resolved.payloadLb !== undefined ? resolved.payloadLb : null;
  let payloadSource = resolved.source;
  if (
    stationsRead > 0 &&
    stationSum < 50 &&
    typeof previousStationSumLb === 'number' &&
    previousStationSumLb > 200 &&
    (payloadLb === null || payloadLb >= 50)
  ) {
    payloadLb = stationSum;
    payloadSource = 'stations';
  }
  // Stations stuck near planned while mass-balance collapsed (tablet empty).
  if (
    typeof massBalanceLb === 'number' &&
    stationsRead > 0 &&
    typeof plannedPayloadLb === 'number' &&
    plannedPayloadLb > 200 &&
    Math.abs(stationSum - plannedPayloadLb) <= 150 &&
    massBalanceLb + 75 < plannedPayloadLb * 0.5 &&
    (payloadLb === null || payloadLb > massBalanceLb + 100)
  ) {
    payloadLb = massBalanceLb;
    payloadSource = 'mass-balance';
  }

  const usableTanks = isUsableFuelTankBreakdown(fuelTanks, fuelLb)
    ? fuelTanks
    : undefined;

  return {
    fuelLb,
    payloadLb,
    payloadSource,
    massBalanceLb: massBalanceLb ?? null,
    emptyWeightLb: emptyWeightLb ?? null,
    grossWeightLb: grossWeightLb ?? null,
    stationSumLb: stationsRead > 0 ? stationSum : null,
    ...(usableTanks ? { fuelTanks: usableTanks } : {}),
    ...(stationsRead > 0 ? { stations } : {}),
  };
}

export async function readLiveResidualFuelKg(
  bridge: NamedPipeSimBridge,
): Promise<number> {
  let fuelLb: number;
  try {
    fuelLb = await bridge.readSimVar({
      name: 'FUEL TOTAL QUANTITY WEIGHT',
      unit: 'pounds',
    });
  } catch {
    const [quantityGal, poundsPerGal] = await Promise.all([
      bridge.readSimVar({ name: 'FUEL TOTAL QUANTITY', unit: 'gallons' }),
      bridge.readSimVar({ name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' }),
    ]);
    fuelLb = quantityGal * poundsPerGal;
  }
  if (!Number.isFinite(fuelLb) || fuelLb < 0) {
    throw new Error(`Invalid live residual fuel weight: ${fuelLb}`);
  }
  return fuelLb / KG_TO_LB;
}

export async function probeLiveResidualFuelKg(pipeName?: string): Promise<number> {
  const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
  try {
    await bridge.open('Skyline Career UI Settle Fuel Sync');
    return await readLiveResidualFuelKg(bridge);
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Best-effort landing rate (fpm). Prefers latched touchdown normal velocity
 * (fps → fpm); falls back to live VERTICAL SPEED when that is unavailable.
 */
export async function readLiveLandingFpm(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  try {
    const tdFps = await bridge.readSimVar({
      name: 'PLANE TOUCHDOWN NORMAL VELOCITY',
      unit: 'feet per second',
    });
    if (Number.isFinite(tdFps) && Math.abs(tdFps) > 0.05) {
      return Math.round(tdFps * 60);
    }
  } catch {
    /* fall through */
  }
  try {
    const vs = await bridge.readSimVar({
      name: 'VERTICAL SPEED',
      unit: 'feet per minute',
    });
    if (Number.isFinite(vs) && Math.abs(vs) > 5) return Math.round(vs);
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function probeLiveLandingFpm(
  pipeName?: string,
): Promise<number | undefined> {
  const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
  try {
    await bridge.open('Skyline Career UI Settle Landing FPM');
    return await readLiveLandingFpm(bridge);
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}

export class CareerWatchSession {
  private bridge: NamedPipeSimBridge | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private watchState: MissionFlightWatchState = createMissionFlightWatchState();
  private running = false;
  private missionId: string | null = null;
  private missionStatus: string | null = null;
  private lastSample: FlightGroundSample | null = null;
  /** Sticky display phase (taxi hysteresis). */
  private lastPhase: string | null = null;
  private lastLiveFuelLb: number | null = null;
  private lastLivePayloadLb: number | null = null;
  private lastLoadVerification: WatchLoadVerification | null = null;
  private lastEvent: MissionFlightEvent | null = null;
  private lastEventAtIso: string | null = null;
  private lastError: string | null = null;
  private settlement: WatchStatusPayload['settlement'] = null;
  private walletUsd: number | null = null;
  /** Wall clock of last fully successful Watch tick (pipe + sample). */
  private lastSuccessfulTickAtMs = 0;
  /** Last time we ran the heavy Loaded vs Due SimVar pass. */
  private lastLoadSampleAtMs = 0;
  private consecutivePipeErrors = 0;
  private opts: Required<
    Pick<
      WatchOptions,
      | 'intervalSec'
      | 'autoDepart'
      | 'autoSettle'
      | 'requireEnginesOff'
      | 'requireDestProximity'
      | 'settleRadiusNm'
      | 'allowDepartOverride'
    >
  > & { pipeName?: string } = {
    intervalSec: 5,
    autoDepart: true,
    autoSettle: true,
    requireEnginesOff: true,
    requireDestProximity: true,
    settleRadiusNm: 12,
    allowDepartOverride: false,
  };
  private tickInFlight = false;
  /** Earliest time we may retry SimBridge after a pipe drop. */
  private pipeRetryAtMs = 0;
  private pipeBackoffMs = 2_000;
  private preflightDepartBlockedLogged = false;
  private cruiseState: CruiseSampleState = createCruiseSampleState();
  private cruiseStatus: CruiseSampleStatus | null = null;
  private scoreAcc: FlightScoreAccumulator = createFlightScoreAccumulator();
  private lastFlightScore: FlightScoreSnapshot | null = null;

  constructor(private readonly cb: WatchCallbacks) {}

  /** Last touchdown VS captured by Watch (before settle), if any. */
  getCapturedLandingFpm(): number | undefined {
    const fpm = this.watchState.landingFpm;
    return typeof fpm === 'number' && Number.isFinite(fpm) ? fpm : undefined;
  }

  /** Touchdown wall-clock from Watch, if wheels-down was observed. */
  getCapturedAirborneEndedAtMs(): number | undefined {
    const ended = this.watchState.airborneEndedAtMs;
    return typeof ended === 'number' && Number.isFinite(ended) ? ended : undefined;
  }

  /** Finalized scorecard from this Watch session (updated each tick). */
  getCapturedFlightScore(): FlightScoreSnapshot | null {
    return this.lastFlightScore;
  }

  getStatus(): WatchStatusPayload {
    const nowMs = Date.now();
    const airborneAtMs = this.watchState.airborneAtMs;
    const expectedRouteMs = this.watchState.expectedRouteMs;
    let flightTime: WatchFlightTimePayload | null = null;
    if (
      typeof airborneAtMs === 'number' &&
      Number.isFinite(airborneAtMs) &&
      typeof expectedRouteMs === 'number' &&
      Number.isFinite(expectedRouteMs) &&
      expectedRouteMs > 0
    ) {
      const check = evaluateMinAirborneElapsed({
        airborneAtMs,
        expectedRouteMs,
        nowMs,
        airborneEndedAtMs: this.watchState.airborneEndedAtMs,
      });
      flightTime = {
        airborneAtMs,
        expectedRouteMs,
        requiredMs: check.requiredMs,
        elapsedMs: check.elapsedMs,
        ratio: check.elapsedMs / expectedRouteMs,
        met: check.ok,
      };
    }
    if (this.lastSample) {
      this.lastPhase = flightPhaseFromSample(this.lastSample, this.lastPhase);
    }
    return {
      running: this.running,
      missionId: this.missionId,
      missionStatus: this.missionStatus,
      phase: this.lastPhase,
      onGround: this.lastSample?.onGround ?? null,
      enginesRunning: this.lastSample?.enginesRunning ?? null,
      groundSpeedKt:
        typeof this.lastSample?.groundSpeedKt === 'number'
          ? this.lastSample.groundSpeedKt
          : null,
      position: this.lastSample?.position ?? null,
      liveFuelLb: this.lastLiveFuelLb,
      livePayloadLb: this.lastLivePayloadLb,
      loadVerification: this.lastLoadVerification,
      sawAirborne: this.watchState.sawAirborne,
      lastEvent: this.lastEvent,
      lastEventAtIso: this.lastEventAtIso,
      lastError: this.lastError,
      // Hold "connected" briefly across single pipe blips so the footer/map don't
      // flap MSFS CONNECTED ↔ RECONNECTING while SimBridge recovers.
      pipeConnected: (() => {
        const hardDown =
          !this.bridge?.isPipeConnected &&
          Date.now() - this.lastSuccessfulTickAtMs > 12_000;
        const reconnecting =
          typeof this.lastError === 'string' &&
          /not connected|pipe closed|0xC00000B0|Reconnecting|retry in/i.test(
            this.lastError,
          ) &&
          this.consecutivePipeErrors >= 2;
        if (hardDown || reconnecting) return false;
        if (this.bridge?.isPipeConnected) return true;
        return (
          this.running &&
          this.lastSuccessfulTickAtMs > 0 &&
          Date.now() - this.lastSuccessfulTickAtMs < 12_000
        );
      })(),
      settlement: this.settlement,
      walletUsd: this.walletUsd,
      autoDepart: this.opts.autoDepart,
      autoSettle: this.opts.autoSettle,
      intervalSec: this.opts.intervalSec,
      allowDepartOverride: this.opts.allowDepartOverride,
      flightTime,
      cruiseSample: this.cruiseStatus,
    };
  }

  async start(opts: WatchOptions): Promise<WatchStatusPayload> {
    // Idempotent for same mission even when the pipe is down — reconnect belongs
    // to tick backoff. stop()/start() on every UI retry was thrashing the host.
    if (this.running && this.missionId === opts.missionId) {
      watchDebugLog('watch', 'start skipped — already running', {
        missionId: opts.missionId,
        pipeConnected: this.bridge?.isPipeConnected ?? false,
        lastError: this.lastError,
      });
      return this.getStatus();
    }
    if (this.running) {
      await this.stop();
    }

    this.opts = {
      intervalSec: Math.max(1, Math.floor(opts.intervalSec ?? 5)),
      autoDepart: opts.autoDepart !== false,
      autoSettle: opts.autoSettle !== false,
      requireEnginesOff: opts.requireEnginesOff !== false,
      requireDestProximity: opts.requireDestProximity !== false,
      settleRadiusNm: opts.settleRadiusNm ?? 12,
      allowDepartOverride: opts.allowDepartOverride === true,
      pipeName: opts.pipeName,
    };
    this.missionId = opts.missionId;
    this.lastSample = null;
    this.lastPhase = null;
    this.lastLiveFuelLb = null;
    this.lastLivePayloadLb = null;
    this.lastLoadVerification = null;
    this.lastEvent = null;
    this.lastEventAtIso = null;
    this.lastError = null;
    this.pipeRetryAtMs = 0;
    this.pipeBackoffMs = 2_000;
    this.lastSuccessfulTickAtMs = 0;
    this.lastLoadSampleAtMs = 0;
    this.consecutivePipeErrors = 0;
    this.settlement = null;
    this.preflightDepartBlockedLogged = false;
    this.cruiseState = createCruiseSampleState();
    this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
    this.scoreAcc = createFlightScoreAccumulator();
    this.lastFlightScore = finalizeFlightScore(this.scoreAcc);

    const loaded = await this.cb.withCareerRead((_world, missions) => {
      const mission = missions.missions.find((m) => m.id === opts.missionId);
      return mission
        ? { mission, walletUsd: missions.walletUsd }
        : null;
    });
    if (!loaded) {
      this.missionId = null;
      throw new Error(`Unknown mission ${opts.missionId}`);
    }
    const { mission } = loaded;
    if (!['accepted', 'dispatched', 'in_flight'].includes(mission.status)) {
      this.missionId = null;
      throw new Error(`Mission ${mission.id} is ${mission.status} — nothing to watch`);
    }
    this.missionStatus = mission.status;
    this.walletUsd = loaded.walletUsd;
    this.watchState = createMissionFlightWatchState({
      sawAirborne: mission.status === 'in_flight',
      airborneAtMs: mission.airborneAtMs,
      expectedRouteMs:
        mission.expectedRouteMs ??
        (mission.status === 'in_flight'
          ? resolveExpectedRouteMs(mission)
          : undefined),
    });

    const bridge = new NamedPipeSimBridge(
      opts.pipeName ? { pipeName: opts.pipeName } : {},
    );
    setNamedPipeDebugLog((message, data) => {
      watchDebugLog('pipe', message, data);
    });
    watchDebugLog('watch', 'start', {
      missionId: mission.id,
      intervalSec: this.opts.intervalSec,
      logPath: WATCH_DEBUG_LOG_PATH,
    });
    try {
      await withSimBridgeExclusive(async () => {
        await bridge.open('Skyline Career UI Watch');
      });
    } catch (error) {
      this.missionId = null;
      this.missionStatus = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      watchDebugLog('watch', 'start failed', { error: this.lastError });
      throw error;
    }
    this.bridge = bridge;
    this.running = true;

    // Brief settle after open — immediate sample right after a probe/preflight
    // close was returning 0xC00000B0 and kicking the reconnect storm.
    await new Promise((resolve) => setTimeout(resolve, 400));

    // First sample immediately, then on interval.
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.intervalSec * 1000);

    return this.getStatus();
  }

  async stop(): Promise<WatchStatusPayload> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.bridge) {
      try {
        // Keep shared SimConnect alive for inject / preflight.
        await this.bridge.close({ disconnectHost: false });
      } catch {
        /* ignore */
      }
      this.bridge = null;
    }
    return this.getStatus();
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.bridge || !this.missionId || this.tickInFlight) {
      return;
    }
    // OFP inject owns SimConnect traffic — concurrent Watch samples on a second
    // pipe client were a common trigger for STATUS_PIPE_DISCONNECTED (0xC00000B0).
    if (isOfpLoadActive()) {
      watchDebugLog('watch', 'tick skipped — OFP inject active', {
        missionId: this.missionId,
      });
      return;
    }
    if (Date.now() < this.pipeRetryAtMs) {
      return;
    }
    this.tickInFlight = true;
    const tickStarted = Date.now();
    try {
      // Reopen only after backoff — never in the error handler (that ignored waitMs).
      if (!this.bridge.isPipeConnected) {
        watchDebugLog('watch', 'pipe reopen after backoff', {
          missionId: this.missionId,
        });
        await withSimBridgeExclusive(async () => {
          await this.bridge!.open('Skyline Career UI Watch');
        });
      }
      watchDebugLog('watch', 'tick begin', {
        missionId: this.missionId,
        pipeConnected: this.bridge.isPipeConnected,
      });
      const sample = await sampleLiveFlight(this.bridge, {
        previousPosition: this.lastSample?.position ?? null,
      });
      this.lastSample = sample;
      this.lastError = null;
      this.pipeBackoffMs = 2_000;
      this.pipeRetryAtMs = 0;
      this.consecutivePipeErrors = 0;
      this.lastSuccessfulTickAtMs = Date.now();

      const snap = await this.cb.withCareerRead((world, missions) => {
        const idx = missions.missions.findIndex((m) => m.id === this.missionId);
        if (idx < 0) return null;
        const current = missions.missions[idx]!;
        return { world, missions, idx, current };
      });
      if (!snap) {
        this.lastError = `Unknown mission ${this.missionId}`;
        watchDebugLog('watch', 'unknown mission — stop', {
          missionId: this.missionId,
        });
        await this.stop();
        return;
      }
      const { world, current } = snap;
      this.missionStatus = current.status;
      this.walletUsd = snap.missions.walletUsd;

      if (current.status === 'settled' || current.status === 'cancelled' || current.status === 'failed') {
        watchDebugLog('watch', 'mission terminal — stop', {
          status: current.status,
        });
        await this.stop();
        return;
      }

      // Loaded vs Due: Watch owns the pipe — sample + persist (single source of truth).
      // Heavy tank/station reads every tick were thrashing SimBridge (status + map blink).
      // When already READY, refresh load at most every 10s; always sample when not ready.
      const prevVerification = current.lastPreflightCheck?.loadVerification;
      const loadDue =
        !prevVerification?.ready ||
        this.lastLoadSampleAtMs === 0 ||
        Date.now() - this.lastLoadSampleAtMs >= 10_000;
      if (
        prevVerification &&
        current.status === 'dispatched' &&
        sample.onGround &&
        loadDue
      ) {
        try {
          const prevWatchFuel = prevVerification.fuel as WatchLoadVerification['fuel'];
          const prevWatchPayload =
            prevVerification.payload as WatchLoadVerification['payload'];
          const previousStationSumLb = prevWatchPayload.stations
            ? Object.values(prevWatchPayload.stations).reduce(
                (sum, lb) => sum + (Number.isFinite(lb) ? lb : 0),
                0,
              )
            : undefined;
          const load = await sampleLiveLoadLb(
            this.bridge,
            prevVerification.payload.plannedLb,
            previousStationSumLb,
          );
          this.lastLoadSampleAtMs = Date.now();
          // Only keep prior totals when this sample failed to read them (null).
          // Zero is a real reading (user emptied fuel/payload) and must update READY.
          // Density flicker (Jet-A↔avgas) is rejected via pickStableLiveFuelLb.
          const rawFuelLb =
            load.fuelLb !== null ? load.fuelLb : undefined;
          const liveFuelLb = pickStableLiveFuelLb({
            next: rawFuelLb,
            prev: prevVerification.fuel.liveLb,
            plannedLb: prevVerification.fuel.plannedLb,
          });
          const fuelSampleRejected =
            typeof rawFuelLb === 'number' &&
            typeof liveFuelLb === 'number' &&
            Math.abs(rawFuelLb - liveFuelLb) > 1;
          const livePayloadLb =
            load.payloadLb !== null
              ? load.payloadLb
              : (prevVerification.payload.liveLb ?? undefined);
          this.lastLiveFuelLb =
            typeof liveFuelLb === 'number' ? liveFuelLb : load.fuelLb;
          this.lastLivePayloadLb =
            typeof livePayloadLb === 'number' ? livePayloadLb : load.payloadLb;
          const nextWeights = evaluateLoadVerification({
            plannedFuelLb: prevVerification.fuel.plannedLb,
            liveFuelLb,
            plannedPayloadLb: prevVerification.payload.plannedLb,
            livePayloadLb,
          });
          const tanks = pickFuelTankBreakdown(
            fuelSampleRejected ? undefined : load.fuelTanks,
            prevWatchFuel.tanks,
            liveFuelLb,
          );
          // Prefer fresh station map (including all-zero) over a stale schematic.
          const stations = load.stations ?? prevWatchPayload.stations;
          const stationSumNow = load.stations
            ? Object.values(load.stations).reduce(
                (sum, lb) => sum + (Number.isFinite(lb) ? lb : 0),
                0,
              )
            : undefined;
          watchDebugLog('load', 'sample', {
            fuelLb: load.fuelLb,
            payloadLb: load.payloadLb,
            payloadSource: load.payloadSource,
            massBalanceLb: load.massBalanceLb,
            emptyWeightLb: load.emptyWeightLb,
            grossWeightLb: load.grossWeightLb,
            stationSumLb: load.stationSumLb,
            previousStationSumLb,
            stationSumNow,
            plannedPayloadLb: prevVerification.payload.plannedLb,
            prevLivePayloadLb: prevVerification.payload.liveLb,
            prevReady: prevVerification.ready,
            nextReady: nextWeights.ready,
            nextPayloadOk: nextWeights.payload.ok,
            nextFuelOk: nextWeights.fuel.ok,
            tanks: load.fuelTanks ?? null,
            stationKeys: load.stations ? Object.keys(load.stations).length : 0,
          });
          this.lastLoadVerification = {
            ...nextWeights,
            fuel: {
              ...nextWeights.fuel,
              ...(tanks ? { tanks } : {}),
            },
            payload: {
              ...nextWeights.payload,
              ...(stations ? { stations } : {}),
            },
          };
          if (
            loadVerificationDrifted(
              {
                ready: prevVerification.ready,
                fuel: prevVerification.fuel,
                payload: prevVerification.payload,
              },
              nextWeights,
            )
          ) {
            watchDebugLog('load', 'persist drift', {
              ready: nextWeights.ready,
              liveFuelLb: nextWeights.fuel.liveLb,
              livePayloadLb: nextWeights.payload.liveLb,
            });
            await this.cb.updateOpenMission(
              this.missionId,
              (_missions, openMission, openIdx) => {
                const prev = openMission.lastPreflightCheck;
                if (!prev?.loadVerification) return false;
                const prevLv = prev.loadVerification as WatchLoadVerification;
                const mergedTanks = pickFuelTankBreakdown(
                  load.fuelTanks,
                  prevLv.fuel.tanks,
                  liveFuelLb,
                );
                const mergedStations = load.stations ?? prevLv.payload.stations;
                const { tanks: _prevTanks, ...prevFuelRest } =
                  prev.loadVerification.fuel;
                openMission.lastPreflightCheck = {
                  ...prev,
                  checkedAtIso: new Date().toISOString(),
                  verdict: nextWeights.ready
                    ? prev.verdict === 'fail'
                      ? 'pass'
                      : prev.verdict
                    : 'fail',
                  loadVerification: {
                    ...prev.loadVerification,
                    ready: nextWeights.ready,
                    fuel: {
                      ...prevFuelRest,
                      ...nextWeights.fuel,
                      ...(mergedTanks ? { tanks: mergedTanks } : {}),
                    },
                    payload: {
                      ...prev.loadVerification.payload,
                      ...nextWeights.payload,
                      ...(mergedStations ? { stations: mergedStations } : {}),
                    },
                    aircraft: {
                      onGround: sample.onGround,
                      enginesRunning: sample.enginesRunning,
                    },
                  },
                };
                // Keep local mission snapshot in sync for depart gate below.
                current.lastPreflightCheck = openMission.lastPreflightCheck;
                return true;
              },
            );
          } else {
            // Totals stable — still refresh schematic + ok flags from this sample.
            this.lastLoadVerification = {
              ...nextWeights,
              fuel: {
                ...nextWeights.fuel,
                ...(tanks ? { tanks } : {}),
              },
              payload: {
                ...nextWeights.payload,
                ...(stations ? { stations } : {}),
              },
            };
          }
        } catch (loadErr) {
          const msg =
            loadErr instanceof Error ? loadErr.message : String(loadErr);
          this.lastError = msg;
          watchDebugLog('load', 'sample failed', { error: msg });
        }
      } else {
        watchDebugLog('load', 'sample skipped', {
          hasPrevVerification: Boolean(prevVerification),
          status: current.status,
          onGround: sample.onGround,
        });
      }

      const destTerminal = world.airports.find((a) => a.icao === current.destIcao);
      const destCoords = resolveAirportCoords(current.destIcao, destTerminal);
      const distanceNm = routeDistanceNm(
        world,
        current.originIcao,
        current.destIcao,
      );
      const fallbackHours = estimateMissionBlockHours(
        world,
        current.originIcao,
        current.destIcao,
        current.aircraftClassId,
      );
      const expectedRouteMs =
        current.expectedRouteMs ??
        resolveExpectedRouteMs(current, { distanceNm, fallbackHours });
      const nowMs = Date.now();
      const { event, nextState } = evaluateMissionFlightTransition(
        current,
        sample,
        this.watchState,
        {
          requireEnginesOffToSettle: this.opts.requireEnginesOff,
          requireDestProximity: this.opts.requireDestProximity,
          destCoords,
          settleRadiusNm: this.opts.settleRadiusNm,
          nowMs,
          expectedRouteMs,
          distanceNm,
          fallbackHours,
        },
      );
      this.watchState = nextState;
      this.lastEvent = event;
      this.lastEventAtIso = new Date().toISOString();

      // Flight score: envelope peaks + taxi GS + landing snapshot.
      const postTouchdown =
        typeof nextState.airborneEndedAtMs === 'number' ||
        (nextState.sawAirborne && sample.onGround && nextState.landingFpm != null);
      this.scoreAcc = pushFlightScoreSample(this.scoreAcc, {
        onGround: sample.onGround,
        sawAirborne: nextState.sawAirborne,
        postTouchdown,
        groundSpeedKt: sample.groundSpeedKt,
        bankDeg: sample.bankDeg,
        pitchDeg: sample.pitchDeg,
        gForce: sample.gForce,
        indicatedAirspeedKt: sample.indicatedAirspeedKt,
        altitudeFt: sample.altitudeFt,
        overspeedWarning: sample.overspeedWarning,
        stallWarning: sample.stallWarning,
        gearDown: sample.gearDown,
        flapsPct: sample.flapsPct,
        landingVsFpm:
          postTouchdown && nextState.landingFpm != null
            ? nextState.landingFpm
            : undefined,
      });
      this.lastFlightScore = finalizeFlightScore(this.scoreAcc, {
        landingVsFpm: nextState.landingFpm,
      });

      // Stable-cruise burn/TAS sample while airborne on an active freighter leg.
      if (
        current.status === 'in_flight' &&
        !sample.onGround &&
        this.bridge
      ) {
        try {
          let altFt: number | undefined;
          try {
            const alt = await this.bridge.readSimVar({
              name: 'PLANE ALTITUDE',
              unit: 'feet',
            });
            if (Number.isFinite(alt)) altFt = alt;
          } catch {
            altFt = undefined;
          }
          const [tasKt, fuelFlowKgPerHour] = await Promise.all([
            readLiveCruiseTasKt(this.bridge),
            sampleLiveCruiseFuelFlowKgPerHour(this.bridge),
          ]);
          const pushed = pushCruiseTick(this.cruiseState, {
            atMs: nowMs,
            onGround: sample.onGround,
            altFt,
            vsFpm: sample.verticalSpeedFpm,
            tasKt,
            fuelFlowKgPerHour,
          });
          this.cruiseState = pushed.state;
          this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
        } catch {
          this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
        }
      } else if (sample.onGround && this.cruiseState.window.length > 0) {
        // Break the stable window on touchdown; keep any locked commit.
        this.cruiseState = {
          window: [],
          committed: this.cruiseState.committed,
        };
        this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
      }

      // Persist airborne clock if Watch first saw wheels-up on an already in-flight mission.
      if (
        current.status === 'in_flight' &&
        nextState.airborneAtMs !== undefined &&
        (current.airborneAtMs !== nextState.airborneAtMs ||
          current.expectedRouteMs !== nextState.expectedRouteMs)
      ) {
        await this.cb.updateOpenMission(
          this.missionId,
          async (freshMissions, openMission, openIdx) => {
            if (openMission.status !== 'in_flight') return false;
            freshMissions.missions[openIdx] = {
              ...openMission,
              airborneAtMs: openMission.airborneAtMs ?? nextState.airborneAtMs,
              expectedRouteMs:
                openMission.expectedRouteMs ?? nextState.expectedRouteMs,
            };
            return true;
          },
        );
      }

      if (event.type === 'depart' && this.opts.autoDepart) {
        if (
          preflightBlocksDepart(current) &&
          !this.opts.allowDepartOverride
        ) {
          if (!this.preflightDepartBlockedLogged) {
            this.lastError =
              'Auto-depart blocked: Preflight not ready — fix load or restart Watch with override';
            this.preflightDepartBlockedLogged = true;
          }
        } else {
          const saved = await this.cb.withCareerWrite((worldFresh, freshMissions) => {
            const openIdx = freshMissions.missions.findIndex(
              (m) => m.id === this.missionId,
            );
            if (openIdx < 0) return false;
            const openMission = freshMissions.missions[openIdx]!;
            if (
              openMission.status !== 'accepted' &&
              openMission.status !== 'dispatched'
            ) {
              return false;
            }
            const departed = departMission(worldFresh, openMission, {
              fleet: freshMissions,
              nowMs: nextState.airborneAtMs ?? nowMs,
              distanceNm,
              expectedRouteMs: nextState.expectedRouteMs ?? expectedRouteMs,
            });
            freshMissions.missions[openIdx] = departed.mission;
            if (departed.fuelDebitUsd > 0) {
              applyWalletDelta(freshMissions, {
                amountUsd: -departed.fuelDebitUsd,
                kind: 'fuel',
                atTick: worldFresh.tick,
                missionId: departed.mission.id,
                icao: departed.mission.originIcao,
                note: `${departed.mission.originIcao}→${departed.mission.destIcao}`,
              });
            }
            this.missionStatus = departed.mission.status;
            this.walletUsd = freshMissions.walletUsd;
            this.watchState = {
              ...this.watchState,
              airborneAtMs: departed.mission.airborneAtMs,
              expectedRouteMs: departed.mission.expectedRouteMs,
            };
            return true;
          });
          if (!saved) {
            await this.stop();
            return;
          }
        }
      } else if (event.type === 'settle' && this.opts.autoSettle) {
        let residualFuelKg: number | undefined;
        try {
          residualFuelKg = await readLiveResidualFuelKg(this.bridge);
        } catch {
          residualFuelKg = undefined;
        }
        // Prefer sim touchdown-normal velocity when available (more accurate than
        // the last airborne VERTICAL SPEED sample).
        let landingFpm = this.watchState.landingFpm;
        try {
          const tdFps = await this.bridge.readSimVar({
            name: 'PLANE TOUCHDOWN NORMAL VELOCITY',
            unit: 'feet per second',
          });
          if (Number.isFinite(tdFps) && Math.abs(tdFps) > 0.05) {
            landingFpm = Math.round(tdFps * 60);
            this.watchState = { ...this.watchState, landingFpm };
          }
        } catch {
          /* keep Watch-captured VS */
        }
        const saved = await this.cb.withCareerWrite((worldFresh, freshMissions) => {
          const openIdx = freshMissions.missions.findIndex(
            (m) => m.id === this.missionId,
          );
          if (openIdx < 0) return false;
          const openMission = freshMissions.missions[openIdx]!;
          if (
            openMission.status !== 'accepted' &&
            openMission.status !== 'dispatched' &&
            openMission.status !== 'in_flight'
          ) {
            return false;
          }
          const result = settleMission(worldFresh, openMission, {
            fleet: freshMissions,
            residualFuelKg,
            landingFpm,
            airborneEndedAtMs: this.watchState.airborneEndedAtMs,
            nowMs: Date.now(),
            flightScore:
              this.lastFlightScore ??
              finalizeFlightScore(this.scoreAcc, {
                landingVsFpm: landingFpm,
              }),
          });
          freshMissions.missions[openIdx] = result.mission;
          const cruiseCommit = this.cruiseState.committed;
          const airframeTypeId = openMission.airframeTypeId?.trim();
          if (cruiseCommit && airframeTypeId) {
            const prev =
              freshMissions.airframePerfOverrides?.[airframeTypeId];
            const merged = mergeAirframePerfOverride(
              prev,
              cruiseCommit,
              DEFAULT_CRUISE_EMA_ALPHA,
            );
            freshMissions.airframePerfOverrides = {
              ...(freshMissions.airframePerfOverrides ?? {}),
              [airframeTypeId]: merged,
            };
          }
          if (result.walletCreditUsd > 0) {
            applyWalletDelta(freshMissions, {
              amountUsd: result.walletCreditUsd,
              kind: 'freight_payout',
              atTick: worldFresh.tick,
              missionId: result.mission.id,
              icao: result.mission.destIcao,
              note: `${result.mission.originIcao}→${result.mission.destIcao}`,
            });
          }
          if (result.fuelDebitUsd > 0) {
            applyWalletDelta(freshMissions, {
              amountUsd: -result.fuelDebitUsd,
              kind: 'fuel',
              atTick: worldFresh.tick,
              missionId: result.mission.id,
              icao: result.mission.destIcao,
              note: 'settlement fuel',
            });
          }
          this.missionStatus = result.mission.status;
          this.walletUsd = freshMissions.walletUsd;
          this.settlement = {
            payoutUsd: result.settlement.payoutUsd,
            penaltyUsd: result.settlement.penaltyUsd,
            lateTicks: result.settlement.lateTicks,
            onTime: result.settlement.onTime,
            deliveredKg: result.settlement.deliveredKg,
            residualFuelKg: result.mission.settledFuelKg ?? null,
            landingFpm: result.mission.settledLandingFpm ?? null,
            flightDurationMs: result.mission.settledFlightDurationMs ?? null,
            flightScore: result.mission.settledFlightScore ?? null,
          };
          return true;
        });
        if (!saved) {
          await this.stop();
          return;
        }
        await this.stop();
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.consecutivePipeErrors += 1;
      watchDebugLog('watch', 'tick error', {
        error: this.lastError,
        pipeConnected: this.bridge?.isPipeConnected ?? false,
        consecutivePipeErrors: this.consecutivePipeErrors,
        ms: Date.now() - tickStarted,
      });
      // Close + schedule reopen on next tick. Immediate open here raced probes
      // and ignored waitMs (connect/close storm → host 0xC00000B0).
      if (
        this.bridge &&
        /not connected|pipe closed|0xC00000B0|EPIPE|ENOENT/i.test(this.lastError)
      ) {
        const waitMs = this.pipeBackoffMs;
        this.pipeRetryAtMs = Date.now() + waitMs;
        this.pipeBackoffMs = Math.min(20_000, this.pipeBackoffMs * 2);
        this.lastError = `Pipe closed — retry in ${Math.round(waitMs / 1000)}s`;
        watchDebugLog('watch', 'pipe backoff', { waitMs });
        try {
          await this.bridge.close({ disconnectHost: false });
        } catch {
          /* ignore */
        }
      }
    } finally {
      watchDebugLog('watch', 'tick end', {
        ms: Date.now() - tickStarted,
        lastError: this.lastError,
        liveFuelLb: this.lastLiveFuelLb,
        livePayloadLb: this.lastLivePayloadLb,
        ready: this.lastLoadVerification?.ready ?? null,
        pipeConnected: this.bridge?.isPipeConnected ?? false,
      });
      this.tickInFlight = false;
    }
  }
}
