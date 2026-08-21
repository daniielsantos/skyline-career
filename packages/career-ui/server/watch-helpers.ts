/**
 * Live MSFS watch helpers for career-ui — mirrors agent CLI `career watch`.
 */

import {
  advanceFlightPhase,
  createMissionFlightWatchState,
  applyWalletDelta,
  createCruiseSampleState,
  createFlightScoreAccumulator,
  clearFlightScoreLanding,
  createWeatherOpsAccumulator,
  cruiseSampleStatus,
  DEFAULT_CRUISE_EMA_ALPHA,
  departMission,
  revertFalseDepartMission,
  distanceNm as greatCircleDistanceNm,
  estimateMissionBlockHours,
  evaluateLoadVerification,
  evaluateOriginProximity,
  evaluateMinAirborneElapsed,
  evaluateMissionFlightTransition,
  inferEnginesRunning,
  isSimPlaybackFrozen,
  mergeAirborneClockOntoMission,
  resumeAirborneAtMs,
  finalizeFlightScore,
  finalizeWeatherOpsScore,
  fuelTankBreakdownSum,
  isUsableFuelTankBreakdown,
  loadVerificationDrifted,
  stationSampleIncomplete,
  stationWeightsDrifted,
  mergeAirframePerfOverride,
  clampCruiseFuelFlowToCatalog,
  DEFAULT_JET_A_LB_PER_GAL,
  pickFuelTankBreakdown,
  pickStableLiveFuelLb,
  patchFlightScoreLandingVs,
  evaluateRunwayTouchdown,
  pickFirstContactCoords,
  pushCruiseTick,
  pushFlightScoreSample,
  pushWeatherOpsTick,
  resolveLivePayloadLb,
  sanitizeFuelDensityLbPerGal,
  KG_TO_LB,
  normalizeSimPercent,
  resolveAirportCoords,
  resolveExpectedRouteMs,
  rebaseExpectedRouteMsFromCruise,
  routeDistanceNm,
  settleMission,
  watchIntervalMsForPhase,
  weatherOpsStatus,
  fuelBurnMultFromAircraft,
  findCareerPlayerAirframe,
  isPaxAndCargoLoadLayout,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type CargoOpsDelta,
  type CruiseSampleState,
  type CruiseSampleStatus,
  type FlightGroundSample,
  type FlightScoreAccumulator,
  type FlightScoreSnapshot,
  type FuelTankBreakdown,
  type MissionFlightEvent,
  type MissionFlightWatchState,
  type MissionIntent,
  type RunwayTouchdownSnapshot,
  type WeatherOpsAccumulator,
  type WeatherOpsSnapshot,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge, setNamedPipeDebugLog } from '../../agent/src/named-pipe-sim-bridge.ts';
import {
  formatIpcError,
  isIpcTimeout,
  isSimDownError,
  nextPipeBackoffMs,
  pingNeedsSessionReset,
  shouldReopenSimSession,
  simIpcSessionDied,
} from '../../agent/src/sim-session-health.ts';
import {
  readA2aAccusimLvars,
  readTfdiMd11EfbLvars,
} from '../../agent/src/ofp-compliance/live-reader.ts';
import { adjustPlannedPayloadForLiveCrewStations } from '../../agent/src/ofp-load-plan.ts';
import { readLiveCgStateBestEffort } from '../../agent/src/live-cg.ts';
import {
  readLiveCruiseTasKt,
  sampleLiveCruiseFuelFlowKgPerHour,
} from '../../agent/src/sample-cruise-burn.ts';
import { watchDebugLog, WATCH_DEBUG_LOG_PATH } from './debug-log.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import {
  pickStationMax,
  pickTankCapacity,
  resolveCatalogCgEnvelope,
} from './schematic-capacity.ts';
import { withSimBridgeExclusive } from './simbridge-gate.ts';
import { getRepoRoot } from './skyline-paths.ts';

export type WatchLoadVerification = {
  ready: boolean;
  fuel: {
    plannedLb?: number;
    liveLb: number;
    ok: boolean;
    /** SimBrief OFP taxi fuel (lb) used as Loaded vs Due undershoot slack. */
    taxiBurnLb?: number;
    tanks?: FuelTankBreakdown;
    /** Classic L/R/C capacity (lb) for schematic fill. */
    tankCapacity?: FuelTankBreakdown;
  };
  payload: {
    plannedLb?: number;
    /** Mission cargo portion of plannedLb (excludes crew floor). */
    cargoLb?: number;
    /** Crew floor portion of plannedLb (n × 170 lb). */
    crewLb?: number;
    /** Nominal crew floor before empty-station adjust (Watch re-eval). */
    crewFloorLb?: number;
    liveLb?: number;
    ok: boolean;
    stations?: Record<number, number>;
    /** Profile maxLoad (lb) keyed by station index. */
    stationMax?: Record<number, number>;
  };
  cg?: {
    liveMac?: number;
    minMac?: number;
    maxMac?: number;
    ok: boolean;
    severity: 'info' | 'warn';
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
    /** Weather-ops bonus included in payout. */
    weatherBonusUsd?: number;
    /** Weather-ops snapshot from this Watch session. */
    weatherOps?: WeatherOpsSnapshot | null;
    /** Dest runway touchdown projection (catalog). */
    runwayTouch?: RunwayTouchdownSnapshot | null;
    /** Cargo Ops ladder deltas from this settle. */
    cargoOpsDeltas?: CargoOpsDelta[];
  } | null;
  walletUsd: number | null;
  autoDepart: boolean;
  autoSettle: boolean;
  /** Cruise poll cap (seconds) — adaptive phase intervals may be faster. */
  intervalSec: number;
  /** Effective poll interval for the current phase (ms). */
  intervalMs: number;
  allowDepartOverride: boolean;
  /** Live airborne progress vs planned route (anti time-compression). */
  flightTime: WatchFlightTimePayload | null;
  /** Stable-cruise burn/TAS sampler progress for this watch session. */
  cruiseSample: (CruiseSampleStatus & {
    /** Why the 0/180s window is not advancing (Watch-only). */
    hint?: string;
  }) | null;
  /** Live weather-ops score progress (headwind / rain / visibility). */
  weatherOps: ReturnType<typeof weatherOpsStatus> | null;
  /**
   * Live distance to mission origin (Watch tick). UI Origin card prefers this
   * over a stale Validate snapshot on lastPreflightCheck.location.
   */
  originProximity: {
    ok: boolean;
    originIcao: string;
    distanceNm?: number;
    radiusNm: number;
    code: string;
  } | null;
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

function finiteNum(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function galOrZero(value: number | undefined): number {
  const n = finiteNum(value);
  return n !== undefined && n > 0 ? n : 0;
}

const FLIGHT_SAMPLE_VARS = [
  { name: 'PLANE LATITUDE', unit: 'degrees' },
  { name: 'PLANE LONGITUDE', unit: 'degrees' },
  { name: 'GROUND VELOCITY', unit: 'knots' },
  { name: 'VERTICAL SPEED', unit: 'feet per minute' },
  { name: 'PLANE BANK DEGREES', unit: 'degrees' },
  { name: 'PLANE PITCH DEGREES', unit: 'degrees' },
  { name: 'G FORCE', unit: 'Gforce' },
  { name: 'AIRSPEED INDICATED', unit: 'knots' },
  { name: 'AIRSPEED TRUE', unit: 'knots' },
  { name: 'PLANE ALTITUDE', unit: 'feet' },
  { name: 'GEAR TOTAL PCT EXTENDED', unit: 'Percent over 100' },
  { name: 'GEAR HANDLE POSITION', unit: 'number' },
  { name: 'TRAILING EDGE FLAPS LEFT PERCENT', unit: 'Percent over 100' },
  { name: 'PLANE ALT ABOVE GROUND', unit: 'feet' },
  { name: 'IS GEAR RETRACTABLE', unit: 'bool' },
  { name: 'TURB ENG N1:1', unit: 'percent' },
  { name: 'TURB ENG N1:2', unit: 'percent' },
  { name: 'GENERAL ENG RPM:1', unit: 'rpm' },
  { name: 'GENERAL ENG RPM:2', unit: 'rpm' },
  { name: 'GENERAL ENG COMBUSTION:1', unit: 'bool' },
  { name: 'GENERAL ENG COMBUSTION:2', unit: 'bool' },
  { name: 'OVERSPEED WARNING', unit: 'bool' },
  { name: 'STALL WARNING', unit: 'bool' },
  /** Cruise burn — same tick as flight sample (avoids a 2nd IPC that often TIMEOUTs). */
  { name: 'NUMBER OF ENGINES', unit: 'number' },
  { name: 'ENG FUEL FLOW PPH:1', unit: 'pounds per hour' },
  { name: 'ENG FUEL FLOW PPH:2', unit: 'pounds per hour' },
  { name: 'RECIP ENG FUEL FLOW:1', unit: 'pounds per hour' },
  { name: 'RECIP ENG FUEL FLOW:2', unit: 'pounds per hour' },
  { name: 'ENG FUEL FLOW GPH:1', unit: 'gallons per hour' },
  { name: 'ENG FUEL FLOW GPH:2', unit: 'gallons per hour' },
  { name: 'GENERAL ENG FUEL FLOW:1', unit: 'pounds per hour' },
  /** Fallback burn for Accu-Sim (Aerostar) when eng flow SimVars stay 0. */
  { name: 'FUEL TOTAL QUANTITY WEIGHT', unit: 'pounds' },
] as const;

const MAX_FLIGHT_FLOW_LB_PER_HOUR = 40_000;
const FALLBACK_AVGAS_LB_PER_GAL = 6.7;

function pickEngineFlowLbPerHour(
  candidates: Array<{ raw?: number; asGph?: boolean }>,
): number | undefined {
  for (const candidate of candidates) {
    const raw = candidate.raw;
    if (
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      !(raw > (candidate.asGph ? 0.05 : 0.3))
    ) {
      continue;
    }
    const lb = candidate.asGph ? raw * FALLBACK_AVGAS_LB_PER_GAL : raw;
    if (lb < MAX_FLIGHT_FLOW_LB_PER_HOUR) return lb;
  }
  return undefined;
}

function sumFlightFuelFlowKgPerHour(opts: {
  numberOfEngines?: number;
  combustion: boolean[];
  pph: Array<number | undefined>;
  recip: Array<number | undefined>;
  gph: Array<number | undefined>;
  general: Array<number | undefined>;
}): number | undefined {
  let maxEngines = 2;
  if (
    typeof opts.numberOfEngines === 'number' &&
    Number.isFinite(opts.numberOfEngines) &&
    opts.numberOfEngines >= 1
  ) {
    maxEngines = Math.min(2, Math.floor(opts.numberOfEngines));
  }
  const combustionKnown = opts.combustion.some(Boolean);
  const accumulate = (requireCombustion: boolean): number | undefined => {
    let totalLb = 0;
    let engines = 0;
    for (let engine = 1; engine <= maxEngines; engine += 1) {
      if (
        requireCombustion &&
        combustionKnown &&
        opts.combustion[engine - 1] !== true
      ) {
        continue;
      }
      const lb = pickEngineFlowLbPerHour([
        { raw: opts.pph[engine - 1] },
        { raw: opts.recip[engine - 1] },
        { raw: opts.gph[engine - 1], asGph: true },
        { raw: opts.general[engine - 1] },
      ]);
      if (lb == null) continue;
      totalLb += lb;
      engines += 1;
    }
    if (engines === 0) return undefined;
    const kgPerHour = Math.round(totalLb * 0.45359237 * 10) / 10;
    return kgPerHour > 0 && kgPerHour < 50_000 ? kgPerHour : undefined;
  };
  return accumulate(true) ?? (combustionKnown ? accumulate(false) : undefined);
}

/** Instantaneous burn from successive FUEL TOTAL QUANTITY WEIGHT samples. */
export function fuelFlowKgPerHourFromTotalWeightDelta(opts: {
  prevLb: number;
  nextLb: number;
  dtMs: number;
}): number | undefined {
  const dtMs = opts.dtMs;
  // Watch cruise ticks are ~5s; Aerostar burns ~0.15 lb in that window at 100 lb/h.
  if (!(dtMs >= 3_000) || !(dtMs <= 60_000)) return undefined;
  const burnedLb = opts.prevLb - opts.nextLb;
  if (!(burnedLb >= 0.05) || !(opts.prevLb > 0) || !(opts.nextLb >= 0)) {
    return undefined;
  }
  const lbPerHour = burnedLb / (dtMs / 3_600_000);
  if (!(lbPerHour > 5) || !(lbPerHour < MAX_FLIGHT_FLOW_LB_PER_HOUR)) {
    return undefined;
  }
  const kgPerHour = Math.round(lbPerHour * 0.45359237 * 10) / 10;
  return kgPerHour > 0 && kgPerHour < 50_000 ? kgPerHour : undefined;
}

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
    trueAirspeedKt?: number;
    altitudeFt?: number;
    overspeedWarning?: boolean;
    stallWarning?: boolean;
    gearDown?: boolean;
    gearRetractable?: boolean;
    flapsPct?: number;
    aglFt?: number;
    /** Live fuel flow for cruise burn sampling (eng 1–2 families). */
    fuelFlowKgPerHour?: number;
    /** Total fuel weight — Accu-Sim burn fallback via delta. */
    fuelTotalLb?: number;
  }
> {
  const snap = await bridge.snapshot();
  // One SimConnect request. TIMEOUT/NOT_CONNECTED throws — Watch resets next tick.
  const v = await bridge.readSimVars([...FLIGHT_SAMPLE_VARS]);
  const lat = finiteNum(v[0]);
  const lon = finiteNum(v[1]);
  let position: { lat: number; lon: number } | undefined;
  if (
    lat !== undefined &&
    lon !== undefined &&
    !(lat === 0 && lon === 0)
  ) {
    position = { lat, lon };
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
  const gs = finiteNum(v[2]);
  const groundSpeedKt =
    gs !== undefined && gs >= 0 ? gs : undefined;
  const verticalSpeedFpm = finiteNum(v[3]);
  const bankDeg = finiteNum(v[4]);
  const pitchDeg = finiteNum(v[5]);
  const gForce = finiteNum(v[6]);
  const indicatedAirspeedKt = finiteNum(v[7]);
  const trueAirspeedKt = finiteNum(v[8]);
  const altitudeFt = finiteNum(v[9]);
  const gearPctRaw = finiteNum(v[10]);
  const gearHandleRaw = finiteNum(v[11]);
  const flapsPctRaw = finiteNum(v[12]);
  const aglFt = finiteNum(v[13]);
  const gearRetractableRaw = finiteNum(v[14]);
  const n1Eng1 = finiteNum(v[15]);
  const n1Eng2 = finiteNum(v[16]);
  const rpmEng1 = finiteNum(v[17]);
  const rpmEng2 = finiteNum(v[18]);
  const combEng1 = finiteNum(v[19]);
  const combEng2 = finiteNum(v[20]);
  const overspeedRaw = finiteNum(v[21]);
  const stallRaw = finiteNum(v[22]);
  const numberOfEngines = finiteNum(v[23]);
  const flowPph1 = finiteNum(v[24]);
  const flowPph2 = finiteNum(v[25]);
  const flowRecip1 = finiteNum(v[26]);
  const flowRecip2 = finiteNum(v[27]);
  const flowGph1 = finiteNum(v[28]);
  const flowGph2 = finiteNum(v[29]);
  const flowGeneral1 = finiteNum(v[30]);
  const fuelTotalLb = finiteNum(v[31]);
  const overspeedWarning =
    overspeedRaw !== undefined ? overspeedRaw > 0.5 : undefined;
  const stallWarning = stallRaw !== undefined ? stallRaw > 0.5 : undefined;

  const gearRetractable =
    typeof gearRetractableRaw === 'number'
      ? gearRetractableRaw > 0.5
      : undefined;
  const gearPct =
    typeof gearPctRaw === 'number' ? normalizeSimPercent(gearPctRaw) : undefined;
  const flapsPct =
    typeof flapsPctRaw === 'number' ? normalizeSimPercent(flapsPctRaw) : undefined;
  const gearFromPct =
    typeof gearPct === 'number' ? gearPct >= 80 : undefined;
  const gearFromHandle =
    typeof gearHandleRaw === 'number' && Number.isFinite(gearHandleRaw)
      ? gearHandleRaw >= 0.8
      : undefined;
  const gearDown =
    gearFromPct === true || gearFromHandle === true
      ? true
      : gearFromPct === false && gearFromHandle !== true
        ? false
        : gearFromHandle === false && gearFromPct !== true
          ? false
          : undefined;

  const n1Pct = [n1Eng1, n1Eng2].filter(
    (n): n is number => typeof n === 'number',
  );
  const rpm = [rpmEng1, rpmEng2].filter(
    (n): n is number => typeof n === 'number',
  );
  const combustion = [combEng1, combEng2]
    .filter((n): n is number => typeof n === 'number')
    .map((n) => n > 0.5);
  const combustionFlags = [
    typeof combEng1 === 'number' ? combEng1 > 0.5 : false,
    typeof combEng2 === 'number' ? combEng2 > 0.5 : false,
  ];
  const fuelFlowKgPerHour = sumFlightFuelFlowKgPerHour({
    numberOfEngines,
    combustion: combustionFlags,
    pph: [flowPph1, flowPph2],
    recip: [flowRecip1, flowRecip2],
    gph: [flowGph1, flowGph2],
    general: [flowGeneral1, undefined],
  });
  const enginesRunning = inferEnginesRunning({
    snapshotRunning: snap.enginesRunning,
    n1Pct,
    rpm,
    combustion,
    fuelFlowKgPerHour,
  });

  return {
    onGround: snap.onGround,
    enginesRunning,
    parkingBrake: snap.parkingBrake === true,
    paused: snap.paused === true,
    slewActive: snap.slewActive === true,
    position,
    groundSpeedKt,
    verticalSpeedFpm,
    bankDeg,
    pitchDeg,
    gForce,
    indicatedAirspeedKt,
    trueAirspeedKt,
    altitudeFt,
    overspeedWarning,
    stallWarning,
    gearDown,
    gearRetractable,
    flapsPct,
    aglFt,
    fuelFlowKgPerHour,
    fuelTotalLb,
  };
}

const WEATHER_SAMPLE_VARS = [
  { name: 'AMBIENT WIND VELOCITY', unit: 'knots' },
  { name: 'AMBIENT WIND DIRECTION', unit: 'degrees' },
  { name: 'PLANE HEADING DEGREES TRUE', unit: 'degrees' },
  { name: 'AMBIENT PRECIP RATE', unit: 'millimeters of water' },
  { name: 'AMBIENT VISIBILITY', unit: 'meters' },
] as const;

/** Ambient weather at user aircraft — one SimConnect batch; TIMEOUT throws. */
async function sampleLiveWeatherAmbient(bridge: NamedPipeSimBridge): Promise<{
  windKt?: number;
  windFromDeg?: number;
  headingTrueDeg?: number;
  precipMm?: number;
  visibilityM?: number;
}> {
  const v = await bridge.readSimVars([...WEATHER_SAMPLE_VARS]);
  return {
    windKt: finiteNum(v[0]),
    windFromDeg: finiteNum(v[1]),
    headingTrueDeg: finiteNum(v[2]),
    precipMm: finiteNum(v[3]),
    visibilityM: finiteNum(v[4]),
  };
}

/** Density, tanks, totals, empty/gross, stations 1–16 — one Host batch (≤32). */
const LOAD_SAMPLE_VARS = [
  { name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' },
  { name: 'FUEL TOTAL CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK CENTER2 QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK LEFT AUX QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT AUX QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK LEFT TIP QUANTITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT TIP QUANTITY', unit: 'gallons' },
  { name: 'FUEL TOTAL QUANTITY WEIGHT', unit: 'pounds' },
  { name: 'FUEL TOTAL QUANTITY', unit: 'gallons' },
  { name: 'EMPTY WEIGHT', unit: 'pounds' },
  { name: 'TOTAL WEIGHT', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:1', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:2', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:3', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:4', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:5', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:6', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:7', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:8', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:9', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:10', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:11', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:12', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:13', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:14', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:15', unit: 'pounds' },
  { name: 'PAYLOAD STATION WEIGHT:16', unit: 'pounds' },
] as const;

const LOAD_CAPACITY_VARS = [
  { name: 'FUEL TANK LEFT MAIN CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT MAIN CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK CENTER CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK CENTER2 CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK LEFT AUX CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT AUX CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK LEFT TIP CAPACITY', unit: 'gallons' },
  { name: 'FUEL TANK RIGHT TIP CAPACITY', unit: 'gallons' },
] as const;

function classicFuelCapacityFromGals(
  gals: number[],
  densityLbPerGal: number,
): FuelTankBreakdown | undefined {
  const left = (gals[0] ?? 0) * densityLbPerGal;
  const right = (gals[1] ?? 0) * densityLbPerGal;
  const center = ((gals[2] ?? 0) + (gals[3] ?? 0)) * densityLbPerGal;
  const leftAux = (gals[4] ?? 0) * densityLbPerGal;
  const rightAux = (gals[5] ?? 0) * densityLbPerGal;
  const leftTip = (gals[6] ?? 0) * densityLbPerGal;
  const rightTip = (gals[7] ?? 0) * densityLbPerGal;
  if (left + right + center + leftAux + rightAux + leftTip + rightTip < 1) {
    return undefined;
  }
  return {
    left,
    right,
    center,
    ...(leftAux > 0.5 ? { leftAux } : {}),
    ...(rightAux > 0.5 ? { rightAux } : {}),
    ...(leftTip > 0.5 ? { leftTip } : {}),
    ...(rightTip > 0.5 ? { rightTip } : {}),
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
  opts: {
    preferTfdiEfb?: boolean;
    preferA2aLvars?: boolean;
    keepStationIndexes?: number[];
    shouldAbort?: () => boolean;
  } = {},
): Promise<{
  fuelLb: number | null;
  payloadLb: number | null;
  payloadSource: 'stations' | 'mass-balance' | 'tfdi-efb' | 'a2a-lvars' | 'none';
  massBalanceLb?: number | null;
  emptyWeightLb?: number | null;
  grossWeightLb?: number | null;
  stationSumLb?: number | null;
  fuelTanks?: FuelTankBreakdown;
  fuelTankCapacity?: FuelTankBreakdown;
  stations?: Record<number, number>;
  /** TFDi EFB cargo-only payload (excludes crew stations). */
  tfdiEfbCargoLb?: number | null;
  /** Truncated station loop (TIMEOUT mid-16). Caller must keep previous map. */
  stationsIncomplete?: boolean;
  /** Station IPC died (TIMEOUT/NOT_CONNECTED). Caller must reset SimConnect. */
  sessionDied?: boolean;
}> {
  const aborted = () => opts.shouldAbort?.() === true;
  if (aborted()) {
    return {
      fuelLb: null,
      payloadLb: null,
      payloadSource: 'none',
    };
  }

  let v: number[];
  try {
    v = await bridge.readSimVars([...LOAD_SAMPLE_VARS]);
  } catch (err) {
    if (simIpcSessionDied(err)) {
      return {
        fuelLb: null,
        payloadLb: null,
        payloadSource: 'none',
        stationsIncomplete: true,
        sessionDied: true,
      };
    }
    throw err;
  }
  if (aborted()) {
    return {
      fuelLb: null,
      payloadLb: null,
      payloadSource: 'none',
    };
  }

  const densRaw = finiteNum(v[0]);
  const totalCapacityGalRaw = finiteNum(v[1]);
  const totalCapacityGal =
    totalCapacityGalRaw !== undefined && totalCapacityGalRaw > 0
      ? totalCapacityGalRaw
      : undefined;
  const density = sanitizeFuelDensityLbPerGal(
    densRaw !== undefined && densRaw > 0.1 ? densRaw : undefined,
    { totalCapacityGal },
  );

  const leftMain = galOrZero(v[2]);
  const rightMain = galOrZero(v[3]);
  const centerGal = galOrZero(v[4]) + galOrZero(v[5]);
  const leftAux = galOrZero(v[6]);
  const rightAux = galOrZero(v[7]);
  const leftTip = galOrZero(v[8]);
  const rightTip = galOrZero(v[9]);

  const leftLb = leftMain * density;
  const rightLb = rightMain * density;
  const centerLb = centerGal * density;
  const leftAuxLb = leftAux * density;
  const rightAuxLb = rightAux * density;
  const leftTipLb = leftTip * density;
  const rightTipLb = rightTip * density;
  const tankTotalLb =
    leftLb +
    rightLb +
    centerLb +
    leftAuxLb +
    rightAuxLb +
    leftTipLb +
    rightTipLb;
  const fuelTanks: FuelTankBreakdown = {
    left: leftLb,
    right: rightLb,
    center: centerLb,
    ...(leftAuxLb > 0.5 ? { leftAux: leftAuxLb } : {}),
    ...(rightAuxLb > 0.5 ? { rightAux: rightAuxLb } : {}),
    ...(leftTipLb > 0.5 ? { leftTip: leftTipLb } : {}),
    ...(rightTipLb > 0.5 ? { rightTip: rightTipLb } : {}),
  };

  let fuelLb: number | null = tankTotalLb > 0 ? tankTotalLb : null;
  const fuelWeight = finiteNum(v[10]);
  if (fuelWeight !== undefined && fuelWeight >= 0) {
    fuelLb =
      fuelWeight > tankTotalLb * 1.02 + 1
        ? fuelWeight
        : Math.max(tankTotalLb, fuelWeight);
  } else {
    const gal = finiteNum(v[11]);
    if (gal !== undefined) {
      const fuel = gal * density;
      if (Number.isFinite(fuel) && fuel >= 0) {
        fuelLb =
          fuel > tankTotalLb * 1.02 + 1 ? fuel : Math.max(tankTotalLb, fuel);
      }
    }
  }

  let massBalanceLb: number | undefined;
  let emptyWeightLb: number | undefined;
  let grossWeightLb: number | undefined;
  const empty = finiteNum(v[12]);
  const gross = finiteNum(v[13]);
  if (empty !== undefined && empty > 0) emptyWeightLb = empty;
  if (gross !== undefined && gross > 0) grossWeightLb = gross;
  if (
    fuelLb !== null &&
    emptyWeightLb !== undefined &&
    grossWeightLb !== undefined &&
    grossWeightLb > emptyWeightLb
  ) {
    massBalanceLb = Math.max(
      0,
      grossWeightLb - emptyWeightLb - Math.max(0, fuelLb),
    );
  }

  const stations: Record<number, number> = {};
  let stationSum = 0;
  let stationsRead = 0;
  for (let index = 1; index <= 16; index += 1) {
    const w = finiteNum(v[13 + index]);
    if (w !== undefined && w >= 0) {
      stations[index] = w;
      stationSum += w;
      stationsRead += 1;
    }
  }

  let fuelTankCapacity: FuelTankBreakdown | undefined;
  let capacitySessionDied = false;
  if (!aborted()) {
    try {
      const cap = await bridge.readSimVars([...LOAD_CAPACITY_VARS]);
      fuelTankCapacity = classicFuelCapacityFromGals(
        cap.map(galOrZero),
        density,
      );
    } catch (err) {
      if (simIpcSessionDied(err)) {
        capacitySessionDied = true;
      }
    }
  }
  const stationsIncomplete =
    aborted() ||
    (typeof previousStationSumLb === 'number' &&
      previousStationSumLb > 200 &&
      stationsRead > 0 &&
      stationsRead < 8);
  const mbCollapsed =
    typeof massBalanceLb === 'number' &&
    (stationsIncomplete
      ? typeof previousStationSumLb === 'number' &&
        previousStationSumLb > massBalanceLb * 2 + 200 &&
        previousStationSumLb - massBalanceLb > 400
      : stationsRead > 0 &&
        stationSum > massBalanceLb * 2 + 200 &&
        stationSum - massBalanceLb > 400);

  const resolved = resolveLivePayloadLb({
    stationSumLb:
      stationsIncomplete || stationsRead === 0 ? undefined : stationSum,
    massBalanceLb,
    plannedLb: plannedPayloadLb,
    previousStationSumLb,
  });

  // Local fallback: even if @msfs-compat/shared dist is stale, trust a clear
  // drop in classic stations so Preflight can leave READY after the user empties.
  let payloadLb =
    resolved.payloadLb !== undefined ? resolved.payloadLb : null;
  let payloadSource:
    | 'stations'
    | 'mass-balance'
    | 'tfdi-efb'
    | 'a2a-lvars'
    | 'none' = resolved.source;
  if (
    !stationsIncomplete &&
    stationsRead > 0 &&
    stationSum < 50 &&
    typeof previousStationSumLb === 'number' &&
    previousStationSumLb > 200 &&
    (payloadLb === null || payloadLb >= 50)
  ) {
    payloadLb = stationSum;
    payloadSource = 'stations';
  }
  // Once we have a prior classic station sample, keep tracking it. Otherwise
  // a lagging TOTAL WEIGHT reverts the first EFB edit on the next tick.
  // Do not override when Accu-Sim/tablet dumped gross (ghost stations).
  if (
    !stationsIncomplete &&
    !mbCollapsed &&
    stationsRead > 0 &&
    typeof previousStationSumLb === 'number' &&
    (payloadLb === null || Math.abs(payloadLb - stationSum) >= 15)
  ) {
    payloadLb = stationSum;
    payloadSource = 'stations';
  }
  // Stations stuck near planned — or inflated vs gross — while tablet emptied.
  if (
    typeof massBalanceLb === 'number' &&
    (mbCollapsed ||
      (!stationsIncomplete &&
        stationsRead > 0 &&
        typeof plannedPayloadLb === 'number' &&
        plannedPayloadLb > 200 &&
        Math.abs(stationSum - plannedPayloadLb) <= 150 &&
        massBalanceLb + 75 < plannedPayloadLb * 0.5)) &&
    (payloadLb === null || payloadLb > massBalanceLb + 100)
  ) {
    payloadLb = massBalanceLb;
    payloadSource = 'mass-balance';
  }

  let tfdiEfbCargoLb: number | null = null;
  if (opts.preferTfdiEfb) {
    try {
      const tfdi = await readTfdiMd11EfbLvars(bridge);
      if (typeof tfdi.fuelLb === 'number' && tfdi.fuelLb > 0) {
        fuelLb = tfdi.fuelLb;
      }
      if (typeof tfdi.payloadLb === 'number' && tfdi.payloadLb > 0) {
        tfdiEfbCargoLb = tfdi.payloadLb;
        // Caller adds live crew stations on top for Loaded vs Due.
        payloadLb = tfdi.payloadLb;
        payloadSource = 'tfdi-efb';
      }
    } catch {
      /* keep classic sample */
    }
  }

  let a2aStations: Record<number, number> | undefined;
  if (opts.preferA2aLvars) {
    try {
      const a2a = await readA2aAccusimLvars(bridge, density, {
        keepStationIndexes: opts.keepStationIndexes,
      });
      if (typeof a2a.fuelLb === 'number' && a2a.fuelLb > 0) {
        fuelLb = a2a.fuelLb;
        Object.assign(fuelTanks, {
          left: a2a.tanks.left,
          right: a2a.tanks.right,
          center: a2a.tanks.center,
          ...(a2a.tanks.leftTip !== undefined
            ? { leftTip: a2a.tanks.leftTip }
            : {}),
          ...(a2a.tanks.rightTip !== undefined
            ? { rightTip: a2a.tanks.rightTip }
            : {}),
        });
      }
      if (typeof a2a.payloadLb === 'number' && a2a.payloadLb > 0) {
        payloadLb = a2a.payloadLb;
        payloadSource = 'a2a-lvars';
        a2aStations = a2a.stations;
      }
      if (a2a.emptyLb !== undefined) emptyWeightLb = a2a.emptyLb;
      if (a2a.grossLb !== undefined) grossWeightLb = a2a.grossLb;
    } catch {
      /* keep classic sample */
    }
  }

  const vendorLivePayload =
    payloadSource === 'tfdi-efb' || payloadSource === 'a2a-lvars';
  const usableTanks = isUsableFuelTankBreakdown(fuelTanks, fuelLb)
    ? fuelTanks
    : undefined;
  const stationsOut = a2aStations
    ? a2aStations
    : !stationsIncomplete && stationsRead > 0
      ? stations
      : undefined;
  const payloadFromMbOnIncomplete =
    stationsIncomplete &&
    typeof massBalanceLb === 'number' &&
    (payloadSource === 'mass-balance' || mbCollapsed);
  return {
    fuelLb,
    payloadLb: stationsIncomplete && !vendorLivePayload
      ? payloadFromMbOnIncomplete
        ? massBalanceLb!
        : null
      : payloadLb,
    payloadSource: stationsIncomplete && !vendorLivePayload
      ? payloadFromMbOnIncomplete
        ? 'mass-balance'
        : 'none'
      : payloadSource,
    massBalanceLb: massBalanceLb ?? null,
    emptyWeightLb: emptyWeightLb ?? null,
    grossWeightLb: grossWeightLb ?? null,
    stationSumLb: stationsOut
      ? Object.values(stationsOut).reduce((s, lb) => s + lb, 0)
      : stationsIncomplete || stationsRead === 0
        ? null
        : stationSum,
    tfdiEfbCargoLb,
    ...(usableTanks ? { fuelTanks: usableTanks } : {}),
    ...(fuelTankCapacity ? { fuelTankCapacity } : {}),
    ...(stationsOut ? { stations: stationsOut } : {}),
    ...(stationsIncomplete && !vendorLivePayload
      ? { stationsIncomplete: true }
      : {}),
    ...(capacitySessionDied ? { sessionDied: true } : {}),
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

/** Best-effort latched touchdown position (degrees). Soft-fail when missing. */
export async function readLiveTouchdownPosition(
  bridge: NamedPipeSimBridge,
): Promise<{ lat: number; lon: number } | undefined> {
  try {
    const lat = await bridge.readSimVar({
      name: 'PLANE TOUCHDOWN LATITUDE',
      unit: 'degrees',
    });
    const lon = await bridge.readSimVar({
      name: 'PLANE TOUCHDOWN LONGITUDE',
      unit: 'degrees',
    });
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      !(lat === 0 && lon === 0) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      return { lat, lon };
    }
  } catch {
    /* soft-fail */
  }
  return undefined;
}

/** Aircraft true heading (degrees). Soft-fail when missing. */
export async function readLiveHeadingTrueDeg(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  try {
    const hdg = await bridge.readSimVar({
      name: 'PLANE HEADING DEGREES TRUE',
      unit: 'degrees',
    });
    if (Number.isFinite(hdg)) return ((hdg % 360) + 360) % 360;
  } catch {
    /* soft-fail */
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

export async function probeLiveTouchdownPosition(
  pipeName?: string,
): Promise<{ lat: number; lon: number } | undefined> {
  const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
  try {
    await bridge.open('Skyline Career UI Settle Touchdown Pos');
    return await readLiveTouchdownPosition(bridge);
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}

/** Live aircraft position (degrees). Soft-fail when missing or unset. */
async function readLivePlanePosition(
  bridge: NamedPipeSimBridge,
): Promise<{ lat: number; lon: number } | undefined> {
  try {
    const lat = await bridge.readSimVar({
      name: 'PLANE LATITUDE',
      unit: 'degrees',
    });
    const lon = await bridge.readSimVar({
      name: 'PLANE LONGITUDE',
      unit: 'degrees',
    });
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      !(lat === 0 && lon === 0)
    ) {
      return { lat, lon };
    }
  } catch {
    /* soft-fail */
  }
  return undefined;
}

/**
 * First-contact position for the manual settle path. MSFS keeps
 * `PLANE TOUCHDOWN LATITUDE/LONGITUDE` latched from the previous landing, so
 * the raw read alone can debrief the wrong flight's runway — sanity-check it
 * against the live position exactly like the Watch settle path does.
 */
export async function probeFirstContactPosition(pipeName?: string): Promise<
  | {
      lat: number;
      lon: number;
      headingTrueDeg?: number;
    }
  | undefined
> {
  const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
  try {
    await bridge.open('Skyline Career UI Settle First Contact');
    const [simTd, planeNow, headingTrueDeg] = [
      await readLiveTouchdownPosition(bridge),
      await readLivePlanePosition(bridge),
      await readLiveHeadingTrueDeg(bridge),
    ];
    const picked = pickFirstContactCoords({
      simTouchdown: simTd ?? null,
      planeNow: planeNow ?? null,
    });
    if (!picked) return undefined;
    return {
      lat: picked.lat,
      lon: picked.lon,
      ...(headingTrueDeg != null ? { headingTrueDeg } : {}),
    };
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
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchState: MissionFlightWatchState = createMissionFlightWatchState();
  private running = false;
  private missionId: string | null = null;
  private missionStatus: string | null = null;
  private lastSample: (FlightGroundSample & {
    aglFt?: number;
    gearRetractable?: boolean;
    gearDown?: boolean;
    flapsPct?: number;
    bankDeg?: number;
    pitchDeg?: number;
    gForce?: number;
    indicatedAirspeedKt?: number;
    altitudeFt?: number;
    overspeedWarning?: boolean;
    stallWarning?: boolean;
  }) | null = null;
  /** Sticky flight phase for UI + adaptive poll. */
  private lastPhase: string | null = null;
  /** Effective poll interval for the current phase (ms). */
  private intervalMs = 2_000;
  private lastLiveFuelLb: number | null = null;
  private lastLivePayloadLb: number | null = null;
  private lastLoadVerification: WatchLoadVerification | null = null;
  /** Live origin proximity for Origin card (see WatchStatusPayload.originProximity). */
  private lastOriginProximity: WatchStatusPayload['originProximity'] = null;
  /**
   * Envelope painted at Validate/inject (profile calibrated-live). Soft Watch
   * CG reads refresh liveMac only — never overwrite with SimVar FWD/AFT.
   */
  private pinnedCgEnvelope: { minMac?: number; maxMac?: number } | null = null;
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
  /** Last wait used after a pipe/sim-down error; 0 = next error uses startMs. */
  private pipeBackoffMs = 0;
  /** Next tick: IPC disconnect+connect (station TIMEOUT was swallowed). */
  private pendingSimConnectReset = false;
  private preflightDepartBlockedLogged = false;
  /**
   * Set while on ground within settle radius of mission origin (or Validate ok).
   * Kept across wheels-up so auto-depart can fire; cleared when on ground far away.
   */
  private originClearedForDepart = false;
  private cruiseState: CruiseSampleState = createCruiseSampleState();
  private cruiseStatus: CruiseSampleStatus | null = null;
  /** Present while cruise window is empty — footer / debug. */
  private cruiseIdleHint: string | null = null;
  /** Accu-Sim burn fallback: previous FUEL TOTAL QUANTITY WEIGHT sample. */
  private cruiseFuelTotalLb: number | null = null;
  private cruiseFuelTotalAtMs: number | null = null;
  /**
   * Original OFP / distance planned air time for this Watch session.
   * Cruise TAS rebase floors against this (never below 55%).
   */
  private ofpExpectedRouteMs: number | null = null;
  private scoreAcc: FlightScoreAccumulator = createFlightScoreAccumulator();
  private lastFlightScore: FlightScoreSnapshot | null = null;
  private weatherAcc: WeatherOpsAccumulator = createWeatherOpsAccumulator();
  private weatherStatus: ReturnType<typeof weatherOpsStatus> | null = null;
  /** Latched touchdown WGS84 from first wheels-down (cleared on go-around). */
  private touchdownLat: number | null = null;
  private touchdownLon: number | null = null;
  /** Aircraft true heading at first wheels-down (for runway approach-end label). */
  private touchdownHeadingTrueDeg: number | null = null;
  /** Last airborne true heading (fallback if touchdown read fails). */
  private lastAirborneHeadingTrueDeg: number | null = null;
  /** Last airborne WGS84 — closer to true contact than the first on-ground poll. */
  private lastAirborneLat: number | null = null;
  private lastAirborneLon: number | null = null;
  /** Last MX excess-burn drain write (airborne only). */
  private lastMxFuelDrainAtMs = 0;
  /** Last mx drain skip log (rate-limited). */
  private lastMxFuelDrainSkipLogAtMs = 0;
  /** Accumulated MX excess kg waiting to write (GA flows are tiny per tick). */
  private pendingMxDrainKg = 0;

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

  /**
   * Align score VS with the settle landing rate (TOUCHDOWN NORMAL VELOCITY or
   * Watch stamp) so debrief header and landing card match.
   */
  finalizeFlightScoreForSettle(
    landingFpm?: number | null,
  ): FlightScoreSnapshot {
    if (typeof landingFpm === 'number' && Number.isFinite(landingFpm)) {
      this.scoreAcc = patchFlightScoreLandingVs(this.scoreAcc, landingFpm);
      this.watchState = { ...this.watchState, landingFpm };
    }
    this.lastFlightScore = finalizeFlightScore(this.scoreAcc, {
      landingVsFpm:
        typeof landingFpm === 'number' && Number.isFinite(landingFpm)
          ? landingFpm
          : this.watchState.landingFpm,
    });
    return this.lastFlightScore;
  }

  /** Finalized weather-ops snapshot from this Watch session. */
  getCapturedWeatherOps(): WeatherOpsSnapshot | null {
    if (this.weatherAcc.sampleCount <= 0) return null;
    return finalizeWeatherOpsScore(this.weatherAcc, {
      expectedRouteMs: this.watchState.expectedRouteMs,
    });
  }

  /** Latched / sim touchdown position for manual settle. */
  getCapturedTouchdownPosition():
    | { lat: number; lon: number; headingTrueDeg?: number }
    | undefined {
    if (
      this.touchdownLat != null &&
      this.touchdownLon != null &&
      Number.isFinite(this.touchdownLat) &&
      Number.isFinite(this.touchdownLon)
    ) {
      return {
        lat: this.touchdownLat,
        lon: this.touchdownLon,
        ...(typeof this.touchdownHeadingTrueDeg === 'number' &&
        Number.isFinite(this.touchdownHeadingTrueDeg)
          ? { headingTrueDeg: this.touchdownHeadingTrueDeg }
          : {}),
      };
    }
    return undefined;
  }

  getStatus(): WatchStatusPayload {
    const nowMs = Date.now();
    const airborneAtMs = this.watchState.airborneAtMs;
    const expectedRouteMs = this.watchState.expectedRouteMs;
    let flightTime: WatchFlightTimePayload | null = null;
    // Hide the airborne settle gate until the mission has actually departed —
    // leftover stamps / SIM ON GROUND flickers must not show "settle unlocked"
    // while still preparing on the ramp.
    if (
      this.missionStatus === 'in_flight' &&
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
        distanceNm: this.watchState.routeDistanceNm,
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
      // Phase is advanced in tick(); keep sticky value for getStatus between ticks.
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
      originProximity: this.lastOriginProximity,
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
          /not connected|pipe closed|0xC00000B0|TIMEOUT|session stale|simulator closed|Reconnecting|retry in/i.test(
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
      intervalMs: this.intervalMs,
      allowDepartOverride: this.opts.allowDepartOverride,
      flightTime,
      cruiseSample: this.cruiseStatus
        ? {
            ...this.cruiseStatus,
            ...(this.cruiseIdleHint && this.cruiseStatus.phase === 'idle'
              ? { hint: this.cruiseIdleHint }
              : {}),
          }
        : null,
      weatherOps: this.weatherStatus,
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
    if (this.running || this.missionId != null) {
      // Always wipe prior identity before binding a (possibly new) mission.
      await this.stop({ reset: true });
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
    this.intervalMs = watchIntervalMsForPhase('ground', {
      cruiseCapMs: Math.max(1, Math.floor(opts.intervalSec ?? 5)) * 1000,
    });
    this.lastLiveFuelLb = null;
    this.lastLivePayloadLb = null;
    this.lastLoadVerification = null;
    this.lastOriginProximity = null;
    this.pinnedCgEnvelope = null;
    this.lastEvent = null;
    this.lastEventAtIso = null;
    this.lastError = null;
    this.pipeRetryAtMs = 0;
    this.pipeBackoffMs = 0;
    this.lastSuccessfulTickAtMs = 0;
    this.lastLoadSampleAtMs = 0;
    this.consecutivePipeErrors = 0;
    this.pendingSimConnectReset = false;
    this.settlement = null;
    this.preflightDepartBlockedLogged = false;
    this.originClearedForDepart = false;
    this.cruiseState = createCruiseSampleState();
    this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
    this.cruiseIdleHint = null;
    this.cruiseFuelTotalLb = null;
    this.cruiseFuelTotalAtMs = null;
    this.ofpExpectedRouteMs = null;
    this.scoreAcc = createFlightScoreAccumulator();
    this.lastFlightScore = finalizeFlightScore(this.scoreAcc);
    this.weatherAcc = createWeatherOpsAccumulator();
    this.weatherStatus = weatherOpsStatus(this.weatherAcc);
    this.touchdownLat = null;
    this.touchdownLon = null;
    this.touchdownHeadingTrueDeg = null;
    this.lastAirborneHeadingTrueDeg = null;
    this.lastAirborneLat = null;
    this.lastAirborneLon = null;
    this.lastMxFuelDrainAtMs = 0;
    this.lastMxFuelDrainSkipLogAtMs = 0;
    this.pendingMxDrainKg = 0;

    const loaded = await this.cb.withCareerRead((world, missions) => {
      const mission = missions.missions.find((m) => m.id === opts.missionId);
      return mission
        ? {
            mission,
            walletUsd: missions.walletUsd,
            distanceNm: routeDistanceNm(
              world,
              mission.originIcao,
              mission.destIcao,
            ),
          }
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
    // Seed from last Validate; Watch re-evaluates on the ground each tick.
    this.originClearedForDepart =
      mission.lastPreflightCheck?.location?.ok === true;
    const nowMs = Date.now();
    const resumeClock = mission.status === 'in_flight';
    const resumedAirborneAtMs = resumeClock
      ? resumeAirborneAtMs({
          nowMs,
          airborneAtMs: mission.airborneAtMs,
          airborneElapsedMs: mission.airborneElapsedMs,
        })
      : undefined;
    const hasPersistedAirborne =
      typeof resumedAirborneAtMs === 'number' &&
      Number.isFinite(resumedAirborneAtMs);
    this.watchState = createMissionFlightWatchState({
      // Resume mid-flight: treat a saved airborne stamp as already wheels-up.
      // Never inherit leftover stamps from accepted/dispatched (false SIM ON GROUND).
      sawAirborne: mission.status === 'in_flight' || hasPersistedAirborne,
      airborneAtMs: resumedAirborneAtMs,
      expectedRouteMs:
        mission.expectedRouteMs ??
        (mission.status === 'in_flight' || hasPersistedAirborne
          ? resolveExpectedRouteMs(mission, {
              distanceNm: loaded.distanceNm,
            })
          : undefined),
      routeDistanceNm: loaded.distanceNm,
      ...(hasPersistedAirborne && mission.status === 'in_flight'
        ? { lastOnGround: false as const }
        : {}),
    });
    // Floor for cruise TAS rebase — prefer OFP airTime even if mission already
    // carries a tightened expectedRouteMs from a prior Watch session.
    this.ofpExpectedRouteMs = resolveExpectedRouteMs(mission, {
      distanceNm: loaded.distanceNm,
    });
    // Scrub stale airborne fields left on accepted/dispatched from a prior session.
    if (
      !resumeClock &&
      (mission.airborneAtMs != null ||
        mission.airborneElapsedMs != null ||
        mission.expectedRouteMs != null)
    ) {
      await this.cb.updateOpenMission(
        mission.id,
        async (freshMissions, openMission, openIdx) => {
          if (
            openMission.status !== 'accepted' &&
            openMission.status !== 'dispatched'
          ) {
            return false;
          }
          if (
            openMission.airborneAtMs == null &&
            openMission.airborneElapsedMs == null &&
            openMission.expectedRouteMs == null
          ) {
            return false;
          }
          const cleaned = { ...openMission };
          delete cleaned.airborneAtMs;
          delete cleaned.airborneElapsedMs;
          delete cleaned.expectedRouteMs;
          freshMissions.missions[openIdx] = cleaned;
          return true;
        },
      );
    }
    // Re-base persisted airborneAtMs so settle gate matches resumed elapsed.
    if (
      hasPersistedAirborne &&
      resumedAirborneAtMs !== mission.airborneAtMs
    ) {
      await this.persistAirborneClock();
    }

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
      this.lastError = formatIpcError(error);
      watchDebugLog('watch', 'start failed', { error: this.lastError });
      throw error;
    }
    this.bridge = bridge;
    this.running = true;

    // Brief settle after open — immediate sample right after a probe/preflight
    // close was returning 0xC00000B0 and kicking the reconnect storm.
    await new Promise((resolve) => setTimeout(resolve, 400));

    // First sample immediately; each tick rearms setTimeout with phase interval.
    await this.tick();

    return this.getStatus();
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.running) return;
    const ms = Math.max(200, Math.round(delayMs));
    this.timer = setTimeout(() => {
      void this.tick();
    }, ms);
  }

  async stop(opts: { reset?: boolean } = {}): Promise<WatchStatusPayload> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Abort the in-flight tick, then close the pipe so a hung SimVar
    // (10s IPC) cannot freeze reinject. shouldAbort sees running=false.
    // Waiting 25s here left POST /api/load-ofp with no progress message.
    const tickWaitStarted = Date.now();
    while (this.tickInFlight && Date.now() - tickWaitStarted < 1_500) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (this.tickInFlight) {
      watchDebugLog('watch', 'stop — closing pipe under in-flight tick', {
        waitedMs: Date.now() - tickWaitStarted,
      });
    }
    // Flush airborne clock before tearing down — app quit must not lose %.
    // Skip persist when hard-resetting (cancel / mission switch) so flicker
    // stamps are not written onto a closed leg.
    if (!opts.reset) {
      await this.persistAirborneClock();
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
    // Default keeps settlement + missionId so auto-settle clients can read the
    // payout once. Cancel / accept / switch pass reset:true to wipe leftovers.
    if (opts.reset) {
      this.resetSession();
    }
    return this.getStatus();
  }

  /**
   * Drop mission-scoped Watch leftovers (status, settle gate, samples).
   * Call after stop when switching / cancelling / accepting a new leg.
   */
  resetSession(): void {
    this.missionId = null;
    this.missionStatus = null;
    this.watchState = createMissionFlightWatchState();
    this.lastSample = null;
    this.lastPhase = null;
    this.lastLiveFuelLb = null;
    this.lastLivePayloadLb = null;
    this.lastLoadVerification = null;
    this.lastOriginProximity = null;
    this.pinnedCgEnvelope = null;
    this.lastEvent = null;
    this.lastEventAtIso = null;
    this.lastError = null;
    this.settlement = null;
    this.walletUsd = null;
    this.lastSuccessfulTickAtMs = 0;
    this.lastLoadSampleAtMs = 0;
    this.consecutivePipeErrors = 0;
    this.pendingSimConnectReset = false;
    this.preflightDepartBlockedLogged = false;
    this.originClearedForDepart = false;
    this.cruiseState = createCruiseSampleState();
    this.cruiseStatus = null;
    this.cruiseIdleHint = null;
    this.cruiseFuelTotalLb = null;
    this.cruiseFuelTotalAtMs = null;
    this.ofpExpectedRouteMs = null;
    this.scoreAcc = createFlightScoreAccumulator();
    this.lastFlightScore = null;
    this.weatherAcc = createWeatherOpsAccumulator();
    this.weatherStatus = null;
    this.touchdownLat = null;
    this.touchdownLon = null;
    this.touchdownHeadingTrueDeg = null;
    this.lastAirborneHeadingTrueDeg = null;
    this.lastAirborneLat = null;
    this.lastAirborneLon = null;
    this.lastMxFuelDrainAtMs = 0;
    this.lastMxFuelDrainSkipLogAtMs = 0;
    this.pendingMxDrainKg = 0;
  }

  /** Write Watch airborne clock onto the open mission save (survives app quit). */
  private async persistAirborneClock(): Promise<void> {
    if (!this.missionId) return;
    const airborneAtMs = this.watchState.airborneAtMs;
    const expectedRouteMs = this.watchState.expectedRouteMs;
    if (
      (typeof airborneAtMs !== 'number' || !Number.isFinite(airborneAtMs)) &&
      (typeof expectedRouteMs !== 'number' || !Number.isFinite(expectedRouteMs))
    ) {
      return;
    }
    const nowMs = Date.now();
    const check =
      typeof airborneAtMs === 'number' && Number.isFinite(airborneAtMs)
        ? evaluateMinAirborneElapsed({
            airborneAtMs,
            expectedRouteMs:
              typeof expectedRouteMs === 'number' && expectedRouteMs > 0
                ? expectedRouteMs
                : 1,
            nowMs,
            airborneEndedAtMs: this.watchState.airborneEndedAtMs,
            distanceNm: this.watchState.routeDistanceNm,
          })
        : null;
    try {
      await this.cb.updateOpenMission(
        this.missionId,
        async (freshMissions, openMission, openIdx) => {
          const merged = mergeAirborneClockOntoMission(openMission, {
            airborneAtMs,
            airborneElapsedMs: check?.elapsedMs,
            expectedRouteMs,
          });
          if (!merged) return false;
          freshMissions.missions[openIdx] = merged;
          return true;
        },
      );
    } catch (err) {
      watchDebugLog('watch', 'persist airborne clock failed', {
        missionId: this.missionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
      this.scheduleNextTick(this.intervalMs);
      return;
    }
    if (Date.now() < this.pipeRetryAtMs) {
      this.scheduleNextTick(
        Math.max(500, this.pipeRetryAtMs - Date.now()),
      );
      return;
    }
    this.tickInFlight = true;
    const tickStarted = Date.now();
    try {
      // Reopen only after backoff — never in the error handler (that ignored waitMs).
      const forceSimConnectReset = this.pendingSimConnectReset;
      this.pendingSimConnectReset = false;
      if (!this.bridge.isPipeConnected) {
        watchDebugLog('watch', 'pipe reopen after backoff', {
          missionId: this.missionId,
          resetSession: forceSimConnectReset,
        });
        await withSimBridgeExclusive(async () => {
          await this.bridge!.open(
            'Skyline Career UI Watch',
            forceSimConnectReset ? { resetSession: true } : {},
          );
        });
      } else if (forceSimConnectReset) {
        watchDebugLog('watch', 'simconnect reset — disconnect+connect', {
          missionId: this.missionId,
          force: true,
        });
        await withSimBridgeExclusive(async () => {
          await this.bridge!.open('Skyline Career UI Watch', {
            resetSession: true,
          });
        });
      } else {
        try {
          const ping = await this.bridge.ping(1_500);
          if (pingNeedsSessionReset(ping)) {
            watchDebugLog('watch', 'simconnect reset — disconnect+connect', {
              missionId: this.missionId,
              force: false,
              lastRecvAgeMs: ping.lastRecvAgeMs ?? null,
              consecutiveTimeouts: ping.consecutiveTimeouts ?? null,
              sessionHealthy: ping.sessionHealthy ?? null,
            });
            await withSimBridgeExclusive(async () => {
              await this.bridge!.open('Skyline Career UI Watch', {
                resetSession: true,
              });
            });
          }
        } catch {
          // ping failed; sample() surfaces the error
        }
      }
      watchDebugLog('watch', 'tick begin', {
        missionId: this.missionId,
        pipeConnected: this.bridge.isPipeConnected,
      });
      const sample = await sampleLiveFlight(this.bridge, {
        previousPosition: this.lastSample?.position ?? null,
      });
      if (!this.running || isOfpLoadActive()) {
        return;
      }
      this.lastSample = sample;
      this.lastError = null;
      this.pipeBackoffMs = 0;
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
      const { world } = snap;
      let current = snap.current;
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
      // v0.3.9 on the ramp: every tick (EFB payload/fuel edits). Airborne READY: 10s
      // so cruise ticks do not thrash SimBridge with 16 station reads.
      if (!this.running || isOfpLoadActive()) {
        return;
      }
      const prevVerification =
        this.lastLoadVerification ??
        current.lastPreflightCheck?.loadVerification;
      const loadDue = sample.onGround
        ? true
        : !prevVerification?.ready ||
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
          const preferTfdiEfb =
            /tfdi-md11/i.test(current.rolesPackRelPath ?? '') ||
            /tfdi-md11/i.test(current.airframeTypeId ?? '');
          const preferA2aLvars =
            /a2a-/i.test(current.rolesPackRelPath ?? '') ||
            /a2a-/i.test(current.airframeTypeId ?? '');
          // PMDG 737 packs: S10/S11 are galley — exclude from Loaded vs Due.
          // BCF: Due = cabin/holds + crew (S1–S9). PAX pax_and_cargo: Due =
          // SimBrief payload only (S1–S6) — cockpit crew is not in the sheet.
          const preferPmdgFreighterRoles =
            /pmdg-738|pmdg-737|pmdg\/737/i.test(
              current.rolesPackRelPath ?? '',
            ) || /pmdg-738|pmdg-737/i.test(current.airframeTypeId ?? '');
          const pmdgPaxAndCargo = isPaxAndCargoLoadLayout(
            findCareerPlayerAirframe(current.airframeTypeId),
          );
          const keepFromMax = prevWatchPayload.stationMax
            ? Object.keys(prevWatchPayload.stationMax).map(Number)
            : undefined;
          const keepFromStations = prevWatchPayload.stations
            ? Object.keys(prevWatchPayload.stations).map(Number)
            : undefined;
          const load = await sampleLiveLoadLb(
            this.bridge,
            prevVerification.payload.plannedLb,
            previousStationSumLb,
            {
              preferTfdiEfb,
              preferA2aLvars,
              keepStationIndexes:
                keepFromMax && keepFromMax.length > 0
                  ? keepFromMax
                  : keepFromStations,
              shouldAbort: () => !this.running || isOfpLoadActive(),
            },
          );
          this.lastLoadSampleAtMs = Date.now();
          if (load.sessionDied) {
            this.pendingSimConnectReset = true;
            watchDebugLog('load', 'station sample TIMEOUT — reset SimConnect next tick', {
              stationKeys: load.stations
                ? Object.keys(load.stations).length
                : 0,
            });
          }
          // Only keep prior totals when this sample failed to read them (null).
          // Zero is a real reading (user emptied fuel/payload) and must update READY.
          // Density flicker (Jet-A↔avgas) is rejected via pickStableLiveFuelLb.
          const rawFuelLb =
            load.fuelLb !== null ? load.fuelLb : undefined;
          // On the ramp, EFB tank edits are the source of truth. pickStable /
          // pickFuelTankBreakdown were built for Learjet density flicker and
          // latched L/R at the inject snapshot after the first sample.
          const liveFuelLb = sample.onGround
            ? (typeof rawFuelLb === 'number'
                ? rawFuelLb
                : prevVerification.fuel.liveLb)
            : pickStableLiveFuelLb({
                next: rawFuelLb,
                prev: prevVerification.fuel.liveLb,
                plannedLb: prevVerification.fuel.plannedLb,
                nextTanks: load.fuelTanks,
                prevTanks: prevWatchFuel.tanks,
              });
          const fuelSampleRejected =
            !sample.onGround &&
            typeof rawFuelLb === 'number' &&
            typeof liveFuelLb === 'number' &&
            Math.abs(rawFuelLb - liveFuelLb) > 1;
          const stationsForCrew = load.stations ?? prevWatchPayload.stations;
          const cargoLb =
            typeof prevWatchPayload.cargoLb === 'number' &&
            Number.isFinite(prevWatchPayload.cargoLb)
              ? prevWatchPayload.cargoLb
              : undefined;
          const crewFloorLb =
            typeof prevWatchPayload.crewFloorLb === 'number' &&
            Number.isFinite(prevWatchPayload.crewFloorLb)
              ? prevWatchPayload.crewFloorLb
              : typeof prevWatchPayload.crewLb === 'number' &&
                  Number.isFinite(prevWatchPayload.crewLb) &&
                  prevWatchPayload.crewLb > 0
                ? prevWatchPayload.crewLb
                : undefined;
          const adjustedPayload =
            cargoLb !== undefined && crewFloorLb !== undefined
              ? adjustPlannedPayloadForLiveCrewStations({
                  cargoPlacedLb: cargoLb,
                  crewLb: pmdgPaxAndCargo ? 0 : crewFloorLb,
                  // PMDG 737: crew is S7–S9 (not S1–S3). Without this, cargo on
                  // S1–S3 looks like “full crew” and Due keeps 3×170 forever.
                  ...(preferPmdgFreighterRoles && !pmdgPaxAndCargo
                    ? { crewStations: [7, 8, 9] }
                    : {}),
                  liveStations: stationsForCrew,
                })
              : undefined;
          const plannedPayloadLb =
            adjustedPayload?.plannedTotalLb ??
            prevVerification.payload.plannedLb;
          const liveCrewLb =
            adjustedPayload?.crewOnStations && stationsForCrew
              ? Object.entries(stationsForCrew).reduce((sum, [key, lb]) => {
                  const idx = Number(key);
                  // MD-11 / freighter crew is S1–S3 when floor is 3×170; otherwise
                  // trust whatever adjust decided was "crew present" via stations 1..n.
                  if (
                    !Number.isFinite(idx) ||
                    idx < 1 ||
                    idx > Math.max(3, Math.round((crewFloorLb ?? 0) / 170))
                  ) {
                    return sum;
                  }
                  return sum + (Number.isFinite(lb) ? lb : 0);
                }, 0)
              : 0;
          // PMDG 737: exclude galley S10/S11. BCF includes crew S7–S9; PAX
          // pax_and_cargo Due is SimBrief cabin payload → S1–S6 only.
          const pmdgRolePayloadLb =
            preferPmdgFreighterRoles && load.stations
              ? Object.entries(load.stations).reduce((sum, [key, lb]) => {
                  const idx = Number(key);
                  const maxIdx = pmdgPaxAndCargo ? 6 : 9;
                  if (!Number.isFinite(idx) || idx < 1 || idx > maxIdx) {
                    return sum;
                  }
                  return sum + (Number.isFinite(lb) ? lb : 0);
                }, 0)
              : undefined;
          const livePayloadLb =
            load.payloadSource === 'tfdi-efb' &&
            typeof load.tfdiEfbCargoLb === 'number'
              ? load.tfdiEfbCargoLb + liveCrewLb
              : typeof pmdgRolePayloadLb === 'number'
                ? pmdgRolePayloadLb
                : load.payloadLb !== null
                  ? load.payloadLb
                  : (prevVerification.payload.liveLb ?? undefined);
          this.lastLiveFuelLb =
            typeof liveFuelLb === 'number' ? liveFuelLb : load.fuelLb;
          this.lastLivePayloadLb =
            typeof livePayloadLb === 'number' ? livePayloadLb : load.payloadLb;
          const nextWeights = evaluateLoadVerification({
            plannedFuelLb: prevVerification.fuel.plannedLb,
            liveFuelLb,
            plannedPayloadLb,
            livePayloadLb,
            ...(typeof prevWatchFuel.taxiBurnLb === 'number'
              ? { taxiBurnLb: prevWatchFuel.taxiBurnLb }
              : {}),
          });
          const tanks = sample.onGround
            ? (load.fuelTanks ?? prevWatchFuel.tanks)
            : pickFuelTankBreakdown(
                fuelSampleRejected ? undefined : load.fuelTanks,
                prevWatchFuel.tanks,
                liveFuelLb,
              );
          const tankCapacity = pickTankCapacity(
            load.fuelTankCapacity,
            prevWatchFuel.tankCapacity,
          );
          // Prefer fresh station map (including explicit zeros) over a stale
          // schematic — but never a truncated IPC pass (S1/S2 only).
          const stations = stationSampleIncomplete(
            prevWatchPayload.stations,
            load.stations,
          )
            ? prevWatchPayload.stations
            : (load.stations ?? prevWatchPayload.stations);
          const stationMax = pickStationMax(
            undefined,
            prevWatchPayload.stationMax,
          );
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
            plannedPayloadLb,
            prevLivePayloadLb: prevVerification.payload.liveLb,
            prevReady: prevVerification.ready,
            nextReady: nextWeights.ready,
            nextPayloadOk: nextWeights.payload.ok,
            nextFuelOk: nextWeights.fuel.ok,
            tanks: load.fuelTanks ?? null,
            tankCapacity: load.fuelTankCapacity ?? null,
            stationKeys: load.stations ? Object.keys(load.stations).length : 0,
            stationsIncomplete: load.stationsIncomplete === true,
            sessionDied: load.sessionDied === true,
          });
          const prevCg = (
            prevVerification as { cg?: WatchLoadVerification['cg'] }
          ).cg;
          if (
            !this.pinnedCgEnvelope &&
            prevCg &&
            (prevCg.minMac !== undefined || prevCg.maxMac !== undefined)
          ) {
            this.pinnedCgEnvelope = {
              ...(prevCg.minMac !== undefined ? { minMac: prevCg.minMac } : {}),
              ...(prevCg.maxMac !== undefined ? { maxMac: prevCg.maxMac } : {}),
            };
          }
          // Publish fuel/payload first — soft CG below is capped so it cannot
          // freeze Loaded vs Due, and keeps Validate painted envelope.
          this.lastLoadVerification = {
            ...nextWeights,
            fuel: {
              ...nextWeights.fuel,
              ...(typeof prevWatchFuel.taxiBurnLb === 'number'
                ? { taxiBurnLb: prevWatchFuel.taxiBurnLb }
                : {}),
              ...(tanks ? { tanks } : {}),
              ...(tankCapacity ? { tankCapacity } : {}),
            },
            payload: {
              ...nextWeights.payload,
              ...(cargoLb !== undefined ? { cargoLb } : {}),
              ...(adjustedPayload
                ? { crewLb: adjustedPayload.crewLb }
                : prevWatchPayload.crewLb !== undefined
                  ? { crewLb: prevWatchPayload.crewLb }
                  : {}),
              ...(crewFloorLb !== undefined ? { crewFloorLb } : {}),
              ...(stations ? { stations } : {}),
              ...(stationMax ? { stationMax } : {}),
            },
            ...(prevCg ? { cg: prevCg } : {}),
          };
          let nextCg = prevCg;
          if (!isOfpLoadActive()) {
            try {
              const softCg = await readLiveCgStateBestEffort(
                this.bridge!,
                { timeoutMs: 1_200 },
                {},
              );
              if (softCg.liveMac !== undefined) {
                if (!this.pinnedCgEnvelope) {
                  try {
                    const identity = await this.bridge!.getAircraftIdentity();
                    const catalogEnv = await resolveCatalogCgEnvelope({
                      repoRoot: getRepoRoot(),
                      title: identity.title,
                      icao: identity.icao,
                      liveMinMac: softCg.minMac,
                      liveMaxMac: softCg.maxMac,
                    });
                    if (
                      catalogEnv.minMac !== undefined ||
                      catalogEnv.maxMac !== undefined
                    ) {
                      this.pinnedCgEnvelope = catalogEnv;
                    }
                  } catch {
                    /* catalog/identity soft-fail — liveMac still useful */
                  }
                }
                const minMac =
                  this.pinnedCgEnvelope?.minMac ?? prevCg?.minMac;
                const maxMac =
                  this.pinnedCgEnvelope?.maxMac ?? prevCg?.maxMac;
                const ok =
                  minMac === undefined ||
                  maxMac === undefined ||
                  (softCg.liveMac >= minMac && softCg.liveMac <= maxMac);
                nextCg = {
                  liveMac: softCg.liveMac,
                  ...(minMac !== undefined ? { minMac } : {}),
                  ...(maxMac !== undefined ? { maxMac } : {}),
                  ok,
                  severity: ok ? 'info' : 'warn',
                };
                this.lastLoadVerification = {
                  ...this.lastLoadVerification,
                  cg: nextCg,
                };
                watchDebugLog('load', 'cg soft refresh', {
                  liveMac: softCg.liveMac,
                  minMac: minMac ?? null,
                  maxMac: maxMac ?? null,
                  ok,
                });
              }
            } catch (cgErr) {
              watchDebugLog('load', 'cg soft refresh skipped', {
                error: formatIpcError(cgErr),
              });
            }
          }
          const prevLiveMac = prevCg?.liveMac;
          const nextLiveMac = nextCg?.liveMac;
          const cgDrifted =
            nextLiveMac !== undefined &&
            (prevLiveMac === undefined ||
              Math.abs(nextLiveMac - prevLiveMac) >= 0.25 ||
              prevCg?.ok !== nextCg?.ok);
          const tanksDrifted =
            Boolean(tanks) &&
            Boolean(prevWatchFuel.tanks) &&
            (Math.abs(
              fuelTankBreakdownSum(tanks!) -
                fuelTankBreakdownSum(prevWatchFuel.tanks!),
            ) >= 15 ||
              Math.abs(tanks!.left - prevWatchFuel.tanks!.left) >= 5 ||
              Math.abs(tanks!.right - prevWatchFuel.tanks!.right) >= 5 ||
              Math.abs(tanks!.center - prevWatchFuel.tanks!.center) >= 5);
          const persistLoad =
            loadVerificationDrifted(
              {
                ready: prevVerification.ready,
                fuel: prevVerification.fuel,
                payload: prevVerification.payload,
              },
              nextWeights,
            ) ||
            stationWeightsDrifted(prevWatchPayload.stations, stations, 5) ||
            tanksDrifted ||
            cgDrifted;
          if (persistLoad) {
            watchDebugLog('load', 'persist drift', {
              ready: nextWeights.ready,
              liveFuelLb: nextWeights.fuel.liveLb,
              livePayloadLb: nextWeights.payload.liveLb,
              cgLiveMac: nextLiveMac ?? null,
              cgDrifted,
            });
            await this.cb.updateOpenMission(
              this.missionId,
              (_missions, openMission, openIdx) => {
                const prev = openMission.lastPreflightCheck;
                if (!prev?.loadVerification) return false;
                const prevLv = prev.loadVerification as WatchLoadVerification;
                const mergedTankCapacity = pickTankCapacity(
                  load.fuelTankCapacity,
                  prevLv.fuel.tankCapacity,
                );
                const mergedStationMax = pickStationMax(
                  undefined,
                  prevLv.payload.stationMax,
                );
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
                      ...(tanks ? { tanks } : {}),
                      ...(mergedTankCapacity
                        ? { tankCapacity: mergedTankCapacity }
                        : {}),
                    },
                    payload: {
                      ...prev.loadVerification.payload,
                      ...nextWeights.payload,
                      ...(cargoLb !== undefined ? { cargoLb } : {}),
                      ...(adjustedPayload
                        ? { crewLb: adjustedPayload.crewLb }
                        : {}),
                      ...(crewFloorLb !== undefined ? { crewFloorLb } : {}),
                      ...(stations ? { stations } : {}),
                      ...(mergedStationMax
                        ? { stationMax: mergedStationMax }
                        : {}),
                    },
                    aircraft: {
                      onGround: sample.onGround,
                      enginesRunning: sample.enginesRunning,
                    },
                    ...(nextCg ? { cg: nextCg } : {}),
                  },
                };
                // Keep local mission snapshot in sync for depart gate below.
                current.lastPreflightCheck = openMission.lastPreflightCheck;
                return true;
              },
            );
          }
        } catch (loadErr) {
          this.lastError = formatIpcError(loadErr);
          watchDebugLog('load', 'sample failed', { error: this.lastError });
          if (simIpcSessionDied(loadErr)) {
            this.pendingSimConnectReset = true;
          }
        }
      } else {
        watchDebugLog('load', 'sample skipped', {
          hasPrevVerification: Boolean(prevVerification),
          status: current.status,
          onGround: sample.onGround,
          loadDue,
        });
      }

      const destTerminal = world.airports.find((a) => a.icao === current.destIcao);
      const destCoords = resolveAirportCoords(current.destIcao, destTerminal);
      const originTerminal = world.airports.find(
        (a) => a.icao === current.originIcao,
      );
      const originCoords = resolveAirportCoords(
        current.originIcao,
        originTerminal,
      );
      const distanceNm = routeDistanceNm(
        world,
        current.originIcao,
        current.destIcao,
      );
      const liveDistToDestNm =
        sample.position && destCoords
          ? greatCircleDistanceNm(sample.position, destCoords)
          : undefined;
      const liveDistToOriginNm =
        sample.position && originCoords
          ? greatCircleDistanceNm(sample.position, originCoords)
          : undefined;
      const settleRadiusNm = this.opts.settleRadiusNm ?? 12;
      // Origin card is a ramp gate. After wheels-up with a cleared latch, freeze
      // the last on-ground OK — live distance going red as ORIGIN_NOT_ON_GROUND
      // is noise once the flight has departed.
      if (sample.onGround !== true && this.originClearedForDepart) {
        if (
          !this.lastOriginProximity ||
          !this.lastOriginProximity.ok ||
          this.lastOriginProximity.code === 'ORIGIN_NOT_ON_GROUND'
        ) {
          this.lastOriginProximity = {
            ok: true,
            originIcao: current.originIcao,
            radiusNm: settleRadiusNm,
            code: 'ORIGIN_OK',
          };
        }
      } else if (
        typeof liveDistToOriginNm === 'number' &&
        originCoords &&
        sample.position
      ) {
        const prox = evaluateOriginProximity({
          originIcao: current.originIcao,
          position: sample.position,
          onGround: sample.onGround === true,
          originCoords,
          radiusNm: settleRadiusNm,
        });
        this.lastOriginProximity = {
          ok: prox.ok,
          originIcao: prox.originIcao,
          ...(prox.distanceNm !== undefined
            ? { distanceNm: prox.distanceNm }
            : {}),
          radiusNm: prox.radiusNm,
          code: prox.code,
        };
      } else {
        this.lastOriginProximity = null;
      }
      // On the ramp: re-check origin so relocating hubs clears the gate without
      // a fresh Validate. Latch sticks through wheels-up for auto-depart.
      if (
        sample.onGround === true &&
        typeof liveDistToOriginNm === 'number' &&
        originCoords &&
        this.lastOriginProximity
      ) {
        const nearOrigin = liveDistToOriginNm <= settleRadiusNm;
        const wasCleared = this.originClearedForDepart;
        this.originClearedForDepart = nearOrigin;
        if (nearOrigin !== wasCleared || current.lastPreflightCheck?.location) {
          const nextLocation = {
            ok: this.lastOriginProximity.ok,
            originIcao: this.lastOriginProximity.originIcao,
            ...(this.lastOriginProximity.distanceNm !== undefined
              ? { distanceNm: this.lastOriginProximity.distanceNm }
              : {}),
            radiusNm: this.lastOriginProximity.radiusNm,
            code: this.lastOriginProximity.code,
          };
          const prevLoc = current.lastPreflightCheck?.location;
          const locDrifted =
            !prevLoc ||
            prevLoc.ok !== nextLocation.ok ||
            prevLoc.code !== nextLocation.code ||
            prevLoc.originIcao !== nextLocation.originIcao ||
            (typeof prevLoc.distanceNm === 'number' &&
            typeof nextLocation.distanceNm === 'number'
              ? Math.abs(prevLoc.distanceNm - nextLocation.distanceNm) >= 0.5
              : prevLoc.distanceNm !== nextLocation.distanceNm);
          if (locDrifted && current.lastPreflightCheck) {
            await this.cb.updateOpenMission(
              this.missionId,
              (_missions, openMission) => {
                const prev = openMission.lastPreflightCheck;
                if (!prev) return false;
                const nextVerdict =
                  nextLocation.ok === false
                    ? 'fail'
                    : prev.loadVerification?.ready
                      ? prev.verdict === 'fail'
                        ? 'pass'
                        : prev.verdict
                      : prev.verdict;
                openMission.lastPreflightCheck = {
                  ...prev,
                  location: nextLocation,
                  verdict: nextVerdict,
                };
                current.lastPreflightCheck = openMission.lastPreflightCheck;
                return true;
              },
            );
            if (nearOrigin !== wasCleared) {
              watchDebugLog('watch', 'origin latch', {
                cleared: nearOrigin,
                distanceNm: liveDistToOriginNm,
                originIcao: current.originIcao,
              });
              if (nearOrigin) {
                this.preflightDepartBlockedLogged = false;
                if (this.lastError?.startsWith('Not at origin')) {
                  this.lastError = null;
                }
              }
            }
          }
        }
      }
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
      const prevHadTouchdown =
        typeof this.watchState.airborneEndedAtMs === 'number' ||
        this.watchState.landingFpm != null;
      const transitionOpts = {
        requireEnginesOffToSettle: this.opts.requireEnginesOff,
        requireDestProximity: this.opts.requireDestProximity,
        destCoords,
        settleRadiusNm: this.opts.settleRadiusNm,
        nowMs,
        expectedRouteMs,
        distanceNm,
        fallbackHours,
      };
      let { event, nextState } = evaluateMissionFlightTransition(
        current,
        sample,
        this.watchState,
        transitionOpts,
      );
      // Drop premature airborne stamps while still preparing at origin
      // (accepted/dispatched on the ground, not near dest). A SIM ON GROUND
      // flicker must not leave "settle unlocked" on the ramp.
      const nearDestPrep =
        Boolean(destCoords) &&
        Boolean(sample.position) &&
        greatCircleDistanceNm(sample.position!, destCoords!) <=
          (this.opts.settleRadiusNm ?? 12);
      if (
        sample.onGround &&
        (current.status === 'accepted' || current.status === 'dispatched') &&
        !nearDestPrep &&
        (nextState.airborneAtMs != null || nextState.sawAirborne)
      ) {
        nextState = createMissionFlightWatchState({
          sawAirborne: false,
          lastOnGround: true,
          routeDistanceNm: nextState.routeDistanceNm ?? distanceNm,
        });
        watchDebugLog('watch', 'cleared premature airborne stamp', {
          missionId: current.id,
          status: current.status,
        });
      }
      this.watchState = nextState;
      this.lastEvent = event;
      this.lastEventAtIso = new Date().toISOString();

      const touchdownCleared =
        prevHadTouchdown &&
        nextState.airborneEndedAtMs == null &&
        nextState.landingFpm == null &&
        !sample.onGround;
      if (touchdownCleared) {
        // Real go-around: drop landing score + position so the next touch re-stamps.
        this.scoreAcc = clearFlightScoreLanding(this.scoreAcc);
        this.touchdownLat = null;
        this.touchdownLon = null;
        this.touchdownHeadingTrueDeg = null;
      }

      if (
        !sample.onGround &&
        sample.position &&
        Number.isFinite(sample.position.lat) &&
        Number.isFinite(sample.position.lon)
      ) {
        this.lastAirborneLat = sample.position.lat;
        this.lastAirborneLon = sample.position.lon;
      }

      // First contact only — prefer Sim TOUCHDOWN latch (true first contact).
      // Plane-now on the wheels-down poll is already down-runway by poll latency.
      if (
        this.touchdownLat == null &&
        nextState.landingFpm != null &&
        sample.onGround
      ) {
        let simTd: { lat: number; lon: number } | undefined;
        if (this.bridge) {
          try {
            simTd = await readLiveTouchdownPosition(this.bridge);
          } catch {
            simTd = undefined;
          }
        }
        const picked = pickFirstContactCoords({
          simTouchdown: simTd ?? null,
          planeNow: sample.position ?? null,
          lastAirborne:
            this.lastAirborneLat != null && this.lastAirborneLon != null
              ? { lat: this.lastAirborneLat, lon: this.lastAirborneLon }
              : null,
        });
        if (picked) {
          this.touchdownLat = picked.lat;
          this.touchdownLon = picked.lon;
          watchDebugLog('watch', 'first-contact position', {
            missionId: current.id,
            source: picked.source,
            lat: picked.lat,
            lon: picked.lon,
            planeLat: sample.position?.lat ?? null,
            planeLon: sample.position?.lon ?? null,
            simLat: simTd?.lat ?? null,
            simLon: simTd?.lon ?? null,
          });
        }
        let hdg: number | undefined;
        if (this.bridge) {
          try {
            hdg = await readLiveHeadingTrueDeg(this.bridge);
          } catch {
            hdg = undefined;
          }
        }
        if (hdg == null && this.lastAirborneHeadingTrueDeg != null) {
          hdg = this.lastAirborneHeadingTrueDeg;
        }
        if (typeof hdg === 'number' && Number.isFinite(hdg)) {
          this.touchdownHeadingTrueDeg = hdg;
        }
      }

      const postTouchdown =
        typeof nextState.airborneEndedAtMs === 'number' ||
        (nextState.sawAirborne && sample.onGround && nextState.landingFpm != null) ||
        Boolean(this.scoreAcc.landing);

      if (!isSimPlaybackFrozen(sample)) {
        this.lastPhase = advanceFlightPhase(
          this.lastPhase,
          {
            onGround: sample.onGround,
            enginesRunning: sample.enginesRunning,
            groundSpeedKt: sample.groundSpeedKt,
            verticalSpeedFpm: sample.verticalSpeedFpm,
            altitudeFt: sample.altitudeFt,
            aglFt: sample.aglFt,
            distanceToDestNm: liveDistToDestNm,
            sawAirborne: nextState.sawAirborne,
            postTouchdown,
          },
          {
            airborneAtMs: nextState.airborneAtMs,
            touchdownAtMs: nextState.airborneEndedAtMs,
            nowMs,
          },
        );
      }

      // Stable-cruise burn/TAS — use fuel flow from the flight batch (same IPC).
      // A separate 29-var flow read often TIMEOUTed and left the footer at 0/180s.
      if (
        current.status === 'in_flight' &&
        !sample.onGround &&
        this.bridge &&
        !this.pendingSimConnectReset
      ) {
        try {
          const tasKt =
            typeof sample.trueAirspeedKt === 'number' &&
            Number.isFinite(sample.trueAirspeedKt) &&
            sample.trueAirspeedKt >= 40
              ? Math.round(sample.trueAirspeedKt)
              : typeof sample.indicatedAirspeedKt === 'number' &&
                  Number.isFinite(sample.indicatedAirspeedKt) &&
                  sample.indicatedAirspeedKt >= 40
                ? Math.round(sample.indicatedAirspeedKt)
                : await readLiveCruiseTasKt(this.bridge);
          let fuelFlowKgPerHour =
            typeof sample.fuelFlowKgPerHour === 'number' &&
            Number.isFinite(sample.fuelFlowKgPerHour) &&
            sample.fuelFlowKgPerHour > 0
              ? sample.fuelFlowKgPerHour
              : undefined;
          // Accu-Sim (Aerostar): classic ENG FUEL FLOW* stay 0 — derive burn from
          // FUEL TOTAL QUANTITY WEIGHT drop between Watch ticks.
          if (
            fuelFlowKgPerHour == null &&
            typeof sample.fuelTotalLb === 'number' &&
            Number.isFinite(sample.fuelTotalLb) &&
            sample.fuelTotalLb > 0
          ) {
            if (
              this.cruiseFuelTotalLb != null &&
              this.cruiseFuelTotalAtMs != null
            ) {
              fuelFlowKgPerHour = fuelFlowKgPerHourFromTotalWeightDelta({
                prevLb: this.cruiseFuelTotalLb,
                nextLb: sample.fuelTotalLb,
                dtMs: nowMs - this.cruiseFuelTotalAtMs,
              });
            }
            this.cruiseFuelTotalLb = sample.fuelTotalLb;
            this.cruiseFuelTotalAtMs = nowMs;
          }
          if (fuelFlowKgPerHour == null) {
            try {
              fuelFlowKgPerHour = await sampleLiveCruiseFuelFlowKgPerHour(
                this.bridge,
              );
            } catch (flowErr) {
              // Soft: flight sample already succeeded — don't tear down SimConnect
              // just because the optional full flow probe timed out.
              watchDebugLog('watch', 'cruise flow probe skipped', {
                missionId: current.id,
                error: formatIpcError(flowErr),
                timeout: isIpcTimeout(flowErr),
              });
            }
          }
          if (fuelFlowKgPerHour != null) {
            const catalogFlow = current.airframeTypeId
              ? findCareerPlayerAirframe(current.airframeTypeId)
                  ?.cruiseFuelFlowKgPerHour
              : undefined;
            const overrideFlow = current.airframeTypeId
              ? snap.missions.airframePerfOverrides?.[current.airframeTypeId]
                  ?.cruiseFuelFlowKgPerHour
              : undefined;
            fuelFlowKgPerHour = clampCruiseFuelFlowToCatalog(
              fuelFlowKgPerHour,
              catalogFlow ?? overrideFlow,
            );
          }
          const pushed = pushCruiseTick(this.cruiseState, {
            atMs: nowMs,
            onGround: sample.onGround,
            altFt: sample.altitudeFt,
            vsFpm: sample.verticalSpeedFpm,
            tasKt,
            fuelFlowKgPerHour,
          });
          this.cruiseState = pushed.state;
          this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
          if (
            this.cruiseStatus.phase === 'idle' &&
            this.cruiseState.window.length === 0
          ) {
            const vs = sample.verticalSpeedFpm;
            const vsBlock =
              typeof vs === 'number' &&
              Number.isFinite(vs) &&
              Math.abs(vs) > 400;
            this.cruiseIdleHint = vsBlock
              ? 'vs'
              : tasKt == null || tasKt < 60
                ? 'tas'
                : fuelFlowKgPerHour == null
                  ? 'flow'
                  : 'unstable';
          } else {
            this.cruiseIdleHint = null;
          }
          const cruiseCommit =
            pushed.justCommitted ?? this.cruiseState.committed;
          if (cruiseCommit) {
            const plannedMs =
              this.ofpExpectedRouteMs ??
              nextState.expectedRouteMs ??
              expectedRouteMs;
            const routeNm =
              nextState.routeDistanceNm ??
              distanceNm ??
              current.lastOfpCheck?.briefing?.distanceNm;
            if (
              typeof plannedMs === 'number' &&
              plannedMs > 0 &&
              typeof routeNm === 'number' &&
              routeNm > 0
            ) {
              const rebased = rebaseExpectedRouteMsFromCruise({
                plannedExpectedRouteMs: plannedMs,
                currentExpectedRouteMs:
                  nextState.expectedRouteMs ?? expectedRouteMs,
                distanceNm: routeNm,
                cruiseSpeedKt: cruiseCommit.cruiseSpeedKt,
              });
              if (rebased.changed) {
                const prevExpected =
                  nextState.expectedRouteMs ?? expectedRouteMs;
                if (
                  prevExpected == null ||
                  !(prevExpected > 0) ||
                  rebased.expectedRouteMs < prevExpected
                ) {
                  watchDebugLog('watch', 'cruise air-time rebase', {
                    missionId: current.id,
                    cruiseSpeedKt: cruiseCommit.cruiseSpeedKt,
                    distanceNm: routeNm,
                    plannedMs,
                    estimatedMs: rebased.estimatedMs,
                    prevExpectedRouteMs: prevExpected ?? null,
                    nextExpectedRouteMs: rebased.expectedRouteMs,
                  });
                  this.watchState = {
                    ...nextState,
                    expectedRouteMs: rebased.expectedRouteMs,
                  };
                  nextState = this.watchState;
                }
              }
            }
          }
        } catch (cruiseErr) {
          // Soft-fail cruise: do not mark pendingSimConnectReset — that skipped
          // every subsequent cruise attempt after a single probe TIMEOUT.
          watchDebugLog('watch', 'cruise sample skipped', {
            missionId: current.id,
            error: formatIpcError(cruiseErr),
            timeout: isIpcTimeout(cruiseErr),
          });
          this.cruiseIdleHint = isIpcTimeout(cruiseErr) ? 'timeout' : 'error';
          this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
        }
      } else if (sample.onGround && this.cruiseState.window.length > 0) {
        // Break the stable window on touchdown; keep any locked commit.
        this.cruiseState = {
          window: [],
          committed: this.cruiseState.committed,
        };
        this.cruiseStatus = cruiseSampleStatus(this.cruiseState);
        this.cruiseIdleHint = null;
        this.cruiseFuelTotalLb = null;
        this.cruiseFuelTotalAtMs = null;
      }

      // Live weather-ops: headwind / rain / visibility while airborne.
      if (!sample.onGround && !isSimPlaybackFrozen(sample) && this.bridge) {
        try {
          const wx = await sampleLiveWeatherAmbient(this.bridge);
          this.weatherAcc = pushWeatherOpsTick(this.weatherAcc, {
            atMs: nowMs,
            onGround: sample.onGround,
            phase: this.lastPhase ?? undefined,
            windKt: wx.windKt,
            windFromDeg: wx.windFromDeg,
            headingTrueDeg: wx.headingTrueDeg,
            precipMm: wx.precipMm,
            visibilityM: wx.visibilityM,
          });
          if (
            typeof wx.headingTrueDeg === 'number' &&
            Number.isFinite(wx.headingTrueDeg)
          ) {
            this.lastAirborneHeadingTrueDeg =
              ((wx.headingTrueDeg % 360) + 360) % 360;
          }
          this.weatherStatus = weatherOpsStatus(this.weatherAcc, {
            expectedRouteMs: nextState.expectedRouteMs,
          });
        } catch (wxErr) {
          if (simIpcSessionDied(wxErr)) {
            this.pendingSimConnectReset = true;
          }
          this.weatherStatus = weatherOpsStatus(this.weatherAcc, {
            expectedRouteMs: nextState.expectedRouteMs,
          });
        }
      }

      // Flight score: envelope peaks + taxi GS + landing snapshot.
      this.scoreAcc = pushFlightScoreSample(this.scoreAcc, {
        onGround: sample.onGround,
        sawAirborne: nextState.sawAirborne,
        postTouchdown,
        phase: this.lastPhase ?? undefined,
        groundSpeedKt: sample.groundSpeedKt,
        bankDeg: sample.bankDeg,
        pitchDeg: sample.pitchDeg,
        gForce: sample.gForce,
        indicatedAirspeedKt: sample.indicatedAirspeedKt,
        altitudeFt: sample.altitudeFt,
        aglFt: sample.aglFt,
        overspeedWarning: sample.overspeedWarning,
        stallWarning: sample.stallWarning,
        gearDown: sample.gearDown,
        gearRetractable: sample.gearRetractable,
        flapsPct: sample.flapsPct,
        landingVsFpm:
          postTouchdown && nextState.landingFpm != null
            ? nextState.landingFpm
            : undefined,
      });
      this.lastFlightScore = finalizeFlightScore(this.scoreAcc, {
        landingVsFpm: nextState.landingFpm,
      });

      // Soft MX burn: drain only the excess above healthy (announced at preflight).
      if (
        current.status === 'in_flight' &&
        !sample.onGround &&
        this.bridge &&
        !this.pendingSimConnectReset
      ) {
        await this.maybeDrainMxFuelExcess(
          snap.missions,
          current,
          sample,
          nowMs,
        );
      }

      // Persist airborne clock as soon as Watch stamps it (accepted/dispatched/
      // in_flight) so closing the app mid-climb does not reset progress to 0%.
      if (
        nextState.airborneAtMs !== undefined &&
        (current.airborneAtMs !== nextState.airborneAtMs ||
          current.expectedRouteMs !== nextState.expectedRouteMs)
      ) {
        await this.persistAirborneClock();
      }

      // Preflight is a ground gate only. Once the aircraft has clearly flown,
      // always depart — blocking on loadVerification.ready after fuel burn (or
      // when Watch started mid-air / restarted after landing) left missions
      // stuck on `dispatched` forever so settle never ran.
      const plannedFuelLb =
        current.lastPreflightCheck?.loadVerification?.fuel?.plannedLb;
      const liveFuelLb =
        this.lastLiveFuelLb ??
        current.lastPreflightCheck?.loadVerification?.fuel?.liveLb;
      const fuelBurnedInFlight =
        typeof plannedFuelLb === 'number' &&
        typeof liveFuelLb === 'number' &&
        plannedFuelLb - liveFuelLb >= 100;
      const nearDestNow =
        Boolean(destCoords) &&
        Boolean(sample.position) &&
        greatCircleDistanceNm(sample.position!, destCoords!) <=
          (this.opts.settleRadiusNm ?? 12);
      // Mid-air: saw wheels-up but mission never left dispatched (missed edge /
      // failed depart). Post-landing: completed the route without an in_flight stamp.
      // Never catch-up-depart from fuel alone or a stale preflight "airborne"
      // phase — that falsely marks a brand-new Dispatch as IN_FLIGHT at origin
      // when tanks are below OFP planned (or leftover phase from a prior leg).
      const midFlightCatchUp =
        nextState.sawAirborne && sample.onGround === false;
      const postLandingCatchUp =
        sample.onGround === true &&
        nearDestNow &&
        nextState.sawAirborne &&
        // Must have actually left the origin area (or burned meaningful fuel
        // while this Watch session saw airborne).
        (fuelBurnedInFlight ||
          (typeof liveDistToOriginNm === 'number' &&
            liveDistToOriginNm > (this.opts.settleRadiusNm ?? 12)));
      const needsDepartCatchUp =
        this.opts.autoDepart &&
        (current.status === 'accepted' || current.status === 'dispatched') &&
        (midFlightCatchUp || postLandingCatchUp) &&
        event.type !== 'depart';
      if (
        this.opts.autoDepart &&
        (event.type === 'depart' || needsDepartCatchUp)
      ) {
        if (!this.originClearedForDepart) {
          if (!this.preflightDepartBlockedLogged) {
            this.preflightDepartBlockedLogged = true;
            const distNote =
              typeof liveDistToOriginNm === 'number'
                ? ` (${liveDistToOriginNm.toFixed(1)} nm from ${current.originIcao})`
                : ` (${current.originIcao})`;
            this.lastError = `Not at origin${distNote} — relocate before takeoff`;
            watchDebugLog('watch', 'depart blocked — not at origin', {
              missionId: current.id,
              liveDistToOriginNm: liveDistToOriginNm ?? null,
              originIcao: current.originIcao,
              settleRadiusNm,
              eventType: event.type,
              needsDepartCatchUp,
            });
          }
        } else {
          if (needsDepartCatchUp) {
          watchDebugLog('watch', 'depart catch-up', {
            missionId: current.id,
            status: current.status,
            sawAirborne: nextState.sawAirborne,
            midFlightCatchUp,
            postLandingCatchUp,
            fuelBurnedInFlight,
            nearDestNow,
          });
          const routeMs =
            nextState.expectedRouteMs ??
            current.expectedRouteMs ??
            expectedRouteMs;
          // Never invent "full route already flown" while still airborne — that
          // immediately unlocks settle mid-climb. Only back-date on post-landing
          // recovery when the real airborne stamp was never persisted.
          let recoveredAirborneAtMs =
            nextState.airborneAtMs ?? current.airborneAtMs;
          if (recoveredAirborneAtMs == null) {
            if (
              postLandingCatchUp &&
              typeof routeMs === 'number' &&
              routeMs > 0
            ) {
              recoveredAirborneAtMs = nowMs - routeMs;
            } else {
              recoveredAirborneAtMs = nowMs;
            }
          }
          this.watchState = {
            ...this.watchState,
            sawAirborne: true,
            lastOnGround: sample.onGround,
            airborneAtMs: recoveredAirborneAtMs,
            expectedRouteMs: routeMs,
            ...(postLandingCatchUp ? { airborneEndedAtMs: nowMs } : {}),
          };
          nextState = this.watchState;
          }
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
            sawAirborne: true,
            airborneAtMs: departed.mission.airborneAtMs,
            expectedRouteMs: departed.mission.expectedRouteMs,
          };
          current = departed.mission;
          return true;
        });
          if (!saved) {
            await this.stop();
            return;
          }
          this.lastError = null;
          this.preflightDepartBlockedLogged = false;
          // Catch-up depart often happens already on the ground — re-run settle
          // gates now that status is in_flight.
          if (needsDepartCatchUp) {
            const again = evaluateMissionFlightTransition(
              current,
              sample,
              this.watchState,
              transitionOpts,
            );
            event = again.event;
            nextState = again.nextState;
            this.watchState = nextState;
            this.lastEvent = event;
            this.lastEventAtIso = new Date().toISOString();
          }
        }
      }

      // Undo false auto-depart: still on the origin ramp with almost no airborne
      // time (SIM ON GROUND flicker / catch-up leftover). Keeps Dispatch from
      // showing EN ROUTE + "ready to settle" before the real flight starts.
      // Do NOT veto on fuel delta vs OFP — swapping variants dumps tanks
      // (looks like a 3k lb burn) while airborne time is still 0.
      const nearOriginNow =
        typeof liveDistToOriginNm === 'number' &&
        liveDistToOriginNm <= (this.opts.settleRadiusNm ?? 12);
      const distinctAirports =
        current.originIcao.trim().toUpperCase() !==
        current.destIcao.trim().toUpperCase();
      if (
        current.status === 'in_flight' &&
        sample.onGround === true &&
        nearOriginNow &&
        !nearDestNow &&
        distinctAirports
      ) {
        const expectedMs =
          nextState.expectedRouteMs ??
          current.expectedRouteMs ??
          expectedRouteMs;
        const airborneCheck =
          typeof nextState.airborneAtMs === 'number' &&
          Number.isFinite(nextState.airborneAtMs) &&
          typeof expectedMs === 'number' &&
          expectedMs > 0
            ? evaluateMinAirborneElapsed({
                airborneAtMs: nextState.airborneAtMs,
                expectedRouteMs: expectedMs,
                nowMs,
                airborneEndedAtMs: nextState.airborneEndedAtMs,
                distanceNm,
              })
            : null;
        const maxFalseMs = Math.min(
          8 * 60_000,
          typeof expectedMs === 'number' && expectedMs > 0
            ? expectedMs * 0.2
            : 8 * 60_000,
        );
        const elapsedMs = airborneCheck?.elapsedMs ?? 0;
        if (elapsedMs < maxFalseMs) {
          const reverted = await this.cb.withCareerWrite(
            (_worldFresh, freshMissions) => {
              const openIdx = freshMissions.missions.findIndex(
                (m) => m.id === this.missionId,
              );
              if (openIdx < 0) return false;
              const openMission = freshMissions.missions[openIdx]!;
              if (openMission.status !== 'in_flight') return false;
              const next = revertFalseDepartMission(_worldFresh, openMission);
              freshMissions.missions[openIdx] = next;
              this.missionStatus = next.status;
              current = next;
              return true;
            },
          );
          if (reverted) {
            this.watchState = createMissionFlightWatchState({
              sawAirborne: false,
              lastOnGround: true,
              airborneConfirmTicks: 0,
              routeDistanceNm: distanceNm,
            });
            nextState = this.watchState;
            this.lastEvent = { type: 'none' };
            this.touchdownLat = null;
            this.touchdownLon = null;
            this.touchdownHeadingTrueDeg = null;
            watchDebugLog('watch', 'reverted false depart at origin', {
              missionId: current.id,
              elapsedMs,
              maxFalseMs,
              liveDistToOriginNm,
            });
          }
        }
      }

      // Sanity: settle unlocked while still far from dest means the airborne
      // clock was back-dated (bad catch-up). Rebase from distance flown.
      if (
        current.status === 'in_flight' &&
        sample.onGround === false &&
        typeof nextState.airborneAtMs === 'number' &&
        Number.isFinite(nextState.airborneAtMs) &&
        typeof nextState.expectedRouteMs === 'number' &&
        nextState.expectedRouteMs > 0 &&
        typeof liveDistToDestNm === 'number' &&
        Number.isFinite(liveDistToDestNm) &&
        typeof distanceNm === 'number' &&
        distanceNm > 50 &&
        liveDistToDestNm > Math.max(40, distanceNm * 0.35)
      ) {
        const airborneCheck = evaluateMinAirborneElapsed({
          airborneAtMs: nextState.airborneAtMs,
          expectedRouteMs: nextState.expectedRouteMs,
          nowMs,
          distanceNm,
        });
        if (airborneCheck.ok) {
          const flownFrac = Math.max(
            0.05,
            Math.min(0.9, 1 - liveDistToDestNm / distanceNm),
          );
          const correctedAtMs =
            nowMs - Math.round(nextState.expectedRouteMs * flownFrac);
          if (correctedAtMs > nextState.airborneAtMs + 60_000) {
            watchDebugLog('watch', 'airborne clock sanity rebase', {
              missionId: current.id,
              prevAirborneAtMs: nextState.airborneAtMs,
              correctedAtMs,
              liveDistToDestNm,
              distanceNm,
              prevElapsedMs: airborneCheck.elapsedMs,
            });
            this.watchState = {
              ...nextState,
              airborneAtMs: correctedAtMs,
            };
            nextState = this.watchState;
            await this.persistAirborneClock();
          }
        }
      }

      if (event.type === 'settle' && this.opts.autoSettle) {
        let residualFuelKg: number | undefined;
        try {
          residualFuelKg = await readLiveResidualFuelKg(this.bridge);
        } catch {
          residualFuelKg = undefined;
        }
        // Prefer Watch first-contact VS; sim TOUCHDOWN latch often updates on
        // later bounce touches and would erase the real landing rate.
        let landingFpm = this.watchState.landingFpm;
        if (landingFpm == null) {
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
            /* keep undefined */
          }
        }
        if (typeof landingFpm === 'number' && Number.isFinite(landingFpm)) {
          this.watchState = { ...this.watchState, landingFpm };
        }
        const flightScore = this.finalizeFlightScoreForSettle(landingFpm);
        // Prefer first-contact lat/lon latched at wheels-down. Sim TOUCHDOWN
        // LAT/LON can move to a later bounce farther down the runway.
        let touchdownLat = this.touchdownLat ?? undefined;
        let touchdownLon = this.touchdownLon ?? undefined;
        let touchdownHeadingTrueDeg =
          this.touchdownHeadingTrueDeg ?? undefined;
        if (touchdownLat == null || touchdownLon == null) {
          try {
            const tdPos = await readLiveTouchdownPosition(this.bridge);
            const picked = pickFirstContactCoords({
              simTouchdown: tdPos ?? null,
              planeNow: this.lastSample?.position ?? null,
              lastAirborne:
                this.lastAirborneLat != null && this.lastAirborneLon != null
                  ? { lat: this.lastAirborneLat, lon: this.lastAirborneLon }
                  : null,
            });
            if (picked) {
              touchdownLat = picked.lat;
              touchdownLon = picked.lon;
              this.touchdownLat = picked.lat;
              this.touchdownLon = picked.lon;
              watchDebugLog('watch', 'settle touchdown position fallback', {
                missionId: current.id,
                source: picked.source,
              });
            }
          } catch {
            /* soft-fail */
          }
        }
        if (touchdownHeadingTrueDeg == null) {
          try {
            const hdg = await readLiveHeadingTrueDeg(this.bridge);
            if (hdg != null) {
              touchdownHeadingTrueDeg = hdg;
              this.touchdownHeadingTrueDeg = hdg;
            } else if (this.lastAirborneHeadingTrueDeg != null) {
              touchdownHeadingTrueDeg = this.lastAirborneHeadingTrueDeg;
              this.touchdownHeadingTrueDeg = this.lastAirborneHeadingTrueDeg;
            }
          } catch {
            if (this.lastAirborneHeadingTrueDeg != null) {
              touchdownHeadingTrueDeg = this.lastAirborneHeadingTrueDeg;
              this.touchdownHeadingTrueDeg = this.lastAirborneHeadingTrueDeg;
            }
          }
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
          const weatherOps = finalizeWeatherOpsScore(this.weatherAcc, {
            expectedRouteMs:
              openMission.expectedRouteMs ?? this.watchState.expectedRouteMs,
          });
          const touch =
            touchdownLat != null && touchdownLon != null
              ? evaluateRunwayTouchdown(
                  openMission.destIcao,
                  touchdownLat,
                  touchdownLon,
                  touchdownHeadingTrueDeg,
                )
              : undefined;
          const result = settleMission(worldFresh, openMission, {
            fleet: freshMissions,
            residualFuelKg,
            landingFpm,
            airborneEndedAtMs: this.watchState.airborneEndedAtMs,
            nowMs: Date.now(),
            flightScore,
            weatherOps,
            touchdownLat,
            touchdownLon,
            touchdownHeadingTrueDeg,
            runwayTouch: touch,
          });
          freshMissions.missions[openIdx] = result.mission;
          const cruiseCommit = this.cruiseState.committed;
          const airframeTypeId = openMission.airframeTypeId?.trim();
          if (cruiseCommit && airframeTypeId) {
            const prev =
              freshMissions.airframePerfOverrides?.[airframeTypeId];
            const catalogFlow =
              findCareerPlayerAirframe(airframeTypeId)?.cruiseFuelFlowKgPerHour;
            const merged = mergeAirframePerfOverride(
              prev,
              cruiseCommit,
              DEFAULT_CRUISE_EMA_ALPHA,
              { catalogCruiseFuelFlowKgPerHour: catalogFlow },
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
            weatherBonusUsd: result.settlement.weatherBonusUsd,
            weatherOps: result.mission.settledWeatherOps ?? null,
            runwayTouch: result.mission.settledRunwayTouch ?? null,
            cargoOpsDeltas: result.cargoOpsDeltas ?? [],
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
      this.lastError = formatIpcError(error);
      this.consecutivePipeErrors += 1;
      watchDebugLog('watch', 'tick error', {
        error: this.lastError,
        pipeConnected: this.bridge?.isPipeConnected ?? false,
        consecutivePipeErrors: this.consecutivePipeErrors,
        ms: Date.now() - tickStarted,
      });
      // First TIMEOUT/NOT_CONNECTED: reset SimConnect next tick (same as stations).
      if (simIpcSessionDied(error)) {
        this.pendingSimConnectReset = true;
      }
      // Close + schedule reopen on next tick. Immediate open here raced probes
      // and ignored waitMs (connect/close storm → host 0xC00000B0).
      if (
        this.bridge &&
        shouldReopenSimSession(error, this.consecutivePipeErrors)
      ) {
        const waitMs = nextPipeBackoffMs(this.pipeBackoffMs, error);
        this.pipeRetryAtMs = Date.now() + waitMs;
        this.pipeBackoffMs = waitMs;
        const timeoutHang = isIpcTimeout(error);
        this.lastError = timeoutHang
          ? `SimConnect session stale — retry in ${Math.round(waitMs / 1000)}s`
          : isSimDownError(error)
            ? `Simulator closed — retry in ${Math.round(waitMs / 1000)}s`
            : `Pipe closed — retry in ${Math.round(waitMs / 1000)}s`;
        watchDebugLog('watch', 'pipe backoff', { waitMs, timeoutHang });
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
        phase: this.lastPhase,
        intervalMs: this.intervalMs,
      });
      this.tickInFlight = false;
      if (this.running) {
        this.intervalMs = watchIntervalMsForPhase(this.lastPhase, {
          cruiseCapMs: this.opts.intervalSec * 1000,
        });
        // Short final / flare / post-touchdown: force landing-rate polls.
        // Approach alone is 1s — at 140 kt that is ~70 m of runway uncertainty.
        // Flare often holds VS near 0, so phase may stay "approach" unless AGL
        // already flipped us to landing; tighten by height, not VS.
        const agl = this.lastSample?.aglFt;
        const tdAt = this.watchState.airborneEndedAtMs;
        const postTdHoldMs =
          typeof tdAt === 'number' && Number.isFinite(tdAt)
            ? Date.now() - tdAt
            : undefined;
        const shortFinal =
          typeof agl === 'number' &&
          Number.isFinite(agl) &&
          agl < 800 &&
          (this.lastPhase === 'approach' ||
            this.lastPhase === 'descent' ||
            this.lastPhase === 'landing' ||
            this.lastPhase === 'cruise');
        if (shortFinal) {
          this.intervalMs = Math.min(
            this.intervalMs,
            watchIntervalMsForPhase('landing'),
          );
        } else if (
          typeof postTdHoldMs === 'number' &&
          postTdHoldMs >= 0 &&
          postTdHoldMs < 20_000
        ) {
          this.intervalMs = Math.min(
            this.intervalMs,
            watchIntervalMsForPhase('landing'),
          );
        }
        this.scheduleNextTick(this.intervalMs);
      }
    }
  }

  /**
   * Drain only MX excess burn (mult−1) while airborne.
   * Uses classic L/R main tanks; fails soft (logs + backs off) on SimConnect errors.
   * GA flows are small — accumulate until ≥0.05 gal, and fall back to catalog
   * cruise flow when the live cruise sampler has not locked yet.
   */
  private async maybeDrainMxFuelExcess(
    missions: CareerMissionsState,
    mission: MissionIntent,
    sample: FlightGroundSample,
    nowMs: number,
  ): Promise<void> {
    const MX_DRAIN_INTERVAL_MS = 30_000;
    const MX_SKIP_LOG_MS = 60_000;
    const MX_MIN_WRITE_KG = 0.08; // ~0.05 gal Jet-A
    if (isOfpLoadActive()) return;
    if (!this.bridge?.isPipeConnected) return;
    if (!mission.aircraftId) return;
    if (nowMs - this.lastMxFuelDrainAtMs < MX_DRAIN_INTERVAL_MS) return;

    const logSkip = (reason: string, extra?: Record<string, unknown>) => {
      if (nowMs - this.lastMxFuelDrainSkipLogAtMs < MX_SKIP_LOG_MS) return;
      this.lastMxFuelDrainSkipLogAtMs = nowMs;
      watchDebugLog('watch', 'mx fuel drain skip', {
        missionId: mission.id,
        reason,
        ...extra,
      });
    };

    const acf = missions.fleet.find((a) => a.id === mission.aircraftId);
    if (!acf) {
      logSkip('no_aircraft');
      return;
    }
    const burn = fuelBurnMultFromAircraft(acf);
    if (burn.excessFrac < 0.01) {
      logSkip('healthy_airframe', { conditionPct: burn.conditionPct });
      return;
    }

    const catalog = acf.airframeTypeId
      ? findCareerPlayerAirframe(acf.airframeTypeId)
      : undefined;
    const overrideFlow =
      acf.airframeTypeId &&
      missions.airframePerfOverrides?.[acf.airframeTypeId]
        ?.cruiseFuelFlowKgPerHour;
    const liveFlow =
      this.cruiseState.committed?.cruiseFuelFlowKgPerHour ??
      this.cruiseStatus?.fuelFlowKgPerHour;
    const flowKgPerHour =
      (typeof liveFlow === 'number' && liveFlow > 0 ? liveFlow : undefined) ??
      (typeof overrideFlow === 'number' && overrideFlow > 0
        ? overrideFlow
        : undefined) ??
      (typeof catalog?.cruiseFuelFlowKgPerHour === 'number' &&
      catalog.cruiseFuelFlowKgPerHour > 0
        ? catalog.cruiseFuelFlowKgPerHour
        : undefined);
    if (
      typeof flowKgPerHour !== 'number' ||
      !Number.isFinite(flowKgPerHour) ||
      flowKgPerHour <= 0
    ) {
      logSkip('no_fuel_flow', {
        cruisePhase: this.cruiseStatus?.phase ?? 'idle',
        excessPct: Math.round(burn.excessFrac * 100),
      });
      return;
    }

    const dtMs =
      this.lastMxFuelDrainAtMs > 0
        ? nowMs - this.lastMxFuelDrainAtMs
        : MX_DRAIN_INTERVAL_MS;
    const dtHours = Math.min(0.05, Math.max(0, dtMs / 3_600_000));
    const stepKg = flowKgPerHour * burn.excessFrac * dtHours;
    this.pendingMxDrainKg += stepKg;
    // Always advance the interval clock so we accumulate over wall time.
    this.lastMxFuelDrainAtMs = nowMs;

    if (this.pendingMxDrainKg < MX_MIN_WRITE_KG) {
      logSkip('accumulating', {
        pendingKg: Math.round(this.pendingMxDrainKg * 1000) / 1000,
        stepKg: Math.round(stepKg * 1000) / 1000,
        flowKgPerHour: Math.round(flowKgPerHour * 10) / 10,
        excessPct: Math.round(burn.excessFrac * 100),
        flowSource:
          typeof liveFlow === 'number' && liveFlow > 0
            ? 'live'
            : typeof overrideFlow === 'number' && overrideFlow > 0
              ? 'override'
              : 'catalog',
      });
      return;
    }

    const drainKg = this.pendingMxDrainKg;
    const drainLb = drainKg * KG_TO_LB;
    const drainGal = drainLb / DEFAULT_JET_A_LB_PER_GAL;
    if (!(drainGal > 0.02)) {
      logSkip('drain_too_small_gal', { drainKg, drainGal });
      return;
    }

    try {
      const left = await this.bridge.readSimVar({
        name: 'FUEL TANK LEFT MAIN QUANTITY',
        unit: 'gallons',
      });
      const right = await this.bridge.readSimVar({
        name: 'FUEL TANK RIGHT MAIN QUANTITY',
        unit: 'gallons',
      });
      const total = Math.max(0, left) + Math.max(0, right);
      if (total < 1) {
        logSkip('tanks_empty', { left, right });
        return;
      }
      const leftShare = Math.max(0, left) / total;
      const nextLeft = Math.max(0, left - drainGal * leftShare);
      const nextRight = Math.max(0, right - drainGal * (1 - leftShare));
      await this.bridge.writeSimVar({
        name: 'FUEL TANK LEFT MAIN QUANTITY',
        unit: 'gallons',
        value: nextLeft,
      });
      await this.bridge.writeSimVar({
        name: 'FUEL TANK RIGHT MAIN QUANTITY',
        unit: 'gallons',
        value: nextRight,
      });
      this.pendingMxDrainKg = 0;
      this.lastMxFuelDrainSkipLogAtMs = 0;
      watchDebugLog('watch', 'mx fuel drain', {
        missionId: mission.id,
        excessPct: Math.round(burn.excessFrac * 100),
        drainKg: Math.round(drainKg * 100) / 100,
        drainGal: Math.round(drainGal * 100) / 100,
        flowKgPerHour: Math.round(flowKgPerHour * 10) / 10,
        flowSource:
          typeof liveFlow === 'number' && liveFlow > 0
            ? 'live'
            : typeof overrideFlow === 'number' && overrideFlow > 0
              ? 'override'
              : 'catalog',
        gsKt: sample.groundSpeedKt,
      });
    } catch (err) {
      watchDebugLog('watch', 'mx fuel drain failed', {
        missionId: mission.id,
        error: err instanceof Error ? err.message : String(err),
        pendingKg: Math.round(this.pendingMxDrainKg * 100) / 100,
      });
    }
  }
}
