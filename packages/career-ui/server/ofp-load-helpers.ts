/**
 * Apply confirmed SimBrief OFP fuel/payload into the live aircraft.
 * Mirrors preflight-helpers: short-lived NamedPipeSimBridge + resolveLiveAircraft.
 */
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  assertRolesPackAllowsDirectInjection,
  careerFuelMatchOk,
  findCareerPlayerAirframe,
  flightPhaseFromSample,
  inferEnginesRunning,
  isPaxAndCargoLoadLayout,
  KG_TO_LB,
  normalizeAircraftTitle,
  ofpFreightTowardMissionKg,
  pickFuelTankBreakdown,
  pickStableLiveFuelLb,
  liveFuelLbCoherentWithTanks,
  resolveLivePayloadLb,
  type AircraftProfile,
  type FuelTankBreakdown,
  type LoadPlanRequest,
  type MissionIntent,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import {
  applyPmdgCduFuelOnce,
  applyPmdgCduPayloadOnce,
  isPmdgCduFuelProfile,
  isPmdgCduPayloadProfile,
} from './pmdg-cdu-inject.ts';
import { simIpcSessionDied } from '../../agent/src/sim-session-health.ts';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import {
  OfpLoadPlanError,
  allocateCargoRoundPerSeat,
  buildOfpLoadPlan,
  buildRollbackPlan,
  CG_BALANCE_STEP_LB,
  cargoPlaceStepLb,
  cgCounterweightPerSeatLb,
  equalizeMovableStations,
  equalizeLateralStationPairs,
  forwardMostOpenStationGroup,
  fuelTankTargetsForRound,
  FUEL_INJECT_ROUNDS,
  idleOuterFuelTankIds,
  redistributeAroundResidualFloors,
  liveFuelMatchesTarget,
  FREIGHTER_PILOT_LB,
  FREIGHTER_CREW_STATION_SOFT_MAX_LB,
  SEAT_OCCUPANT_SOFT_MAX_LB,
  GA_BAGGAGE_SOFT_MAX_LB,
  resolveCgCounterweightBias,
  resolveCgFillAction,
  resolveInjectCgEnvelope,
  resolvePostInjectPayloadLive,
  longitudinalHalfIndexes,
  seatSoftMaxLb,
  shiftCargoForCg,
  resolveFuelDensityLbPerGal,
  type BuiltOfpLoadPlan,
} from '../../agent/src/ofp-load-plan.ts';
import { readLiveCgStateBestEffort } from '../../agent/src/live-cg.ts';
import { readA2aAccusimLvars } from '../../agent/src/ofp-compliance/live-reader.ts';
import {
  finiteOrZero,
  readSimVarsSoft,
} from '../../agent/src/read-simvars-soft.ts';
import { ProfileCache } from '../../agent/src/profile-cache.ts';
import {
  defaultCacheDir,
  defaultProfileDirs,
  loadProfilesFromDirs,
} from '../../agent/src/profile-registry.ts';
import { resolveLiveAircraft } from '../../agent/src/resolve-live.ts';
import { type MissionPreflightResult } from './preflight-helpers.ts';
import {
  beginOfpLoadActive,
  endOfpLoadActive,
  isOfpLoadActive,
  withOfpLoadExclusive,
} from './ofp-load-state.ts';
import {
  stationMaxFromProfile,
  tankCapacityLbFromProfile,
} from './schematic-capacity.ts';
import { withSimBridgeExclusive, acquireSimBridgeExclusive } from './simbridge-gate.ts';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import { watchDebugLog } from './debug-log.ts';
import type { CareerWatchSession } from './watch-helpers.ts';
import { applyTargetBlockFuelKg } from './ofp-target-fuel.ts';
import { getRepoRoot } from './skyline-paths.ts';

export { isOfpLoadActive };

const repoRoot = getRepoRoot();

/** Stay this many %MAC inside the live envelope after inject rebalance. */
const CG_REBALANCE_MARGIN_MAC = 1;
/** CG nudge passes after the equal payload apply (50 lb each). */
const CG_REBALANCE_MAX_ITERATIONS = 24;
/**
 * Ceiling for CG ballast (lb) added when an empty/ferry cabin sits outside the
 * envelope and there is no cargo left to shift. Only a safety valve — the live
 * CG feedback loop stops as soon as the envelope is reached.
 */
const CG_BALLAST_MAX_LB = 1_500;
/** Settle after payload writes before trusting live CG (MSFS lag). */
const PAYLOAD_CG_SETTLE_MS = 900;
/** Settle between staged fuel inject rounds (shorter than payload CG settle). */
const FUEL_ROUND_SETTLE_MS = 450;
/** Gap between station/fuel SimVar writes during inject (Host pipe stability). */
const INJECT_WRITE_GAP_MS = 50;
/** Hard ceiling for one inject session — prevents infinite "Writing…" on dead SimConnect. */
const INJECT_TOTAL_BUDGET_MS = 180_000;
/** Per-IPC timeout during inject (planning reads + writes). Was 60s and felt frozen. */
const INJECT_IPC_TIMEOUT_MS = 15_000;

/** Compact station map for watch-debug.log (only non-zero, rounded). */
function stationsSnapshot(stations: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const idx of Object.keys(stations)
    .map(Number)
    .sort((a, b) => a - b)) {
    const v = stations[idx] ?? 0;
    if (v > 0.5) out[String(idx)] = Math.round(v);
  }
  return out;
}

/** Local sleep — do not use bridge.delay IPC during inject (keeps the pipe free). */
async function delayCancellable(missionId: string, ms: number): Promise<void> {
  let left = Math.max(0, ms);
  while (left > 0) {
    assertOfpLoadNotCancelled(missionId);
    const step = Math.min(200, left);
    await new Promise<void>((resolve) => setTimeout(resolve, step));
    left -= step;
  }
}

function isPipeDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /0xC00000B0/i.test(msg) ||
    /PIPE_DISCONNECTED/i.test(msg) ||
    /Pipe closed/i.test(msg) ||
    /NOT_CONNECTED/i.test(msg) ||
    /Named pipe client is not connected/i.test(msg)
  );
}

export type SimBridgeStatusPayload = {
  connected: boolean;
  mode: string | null;
  aircraftTitle: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  parkingBrake: boolean | null;
  phase: string | null;
  groundSpeedKt: number | null;
  source: 'watch' | 'probe';
  error: string | null;
  checkedAtIso: string;
};

export type OfpLoadApplyResult = {
  ok: boolean;
  plan: BuiltOfpLoadPlan;
  identity: {
    title: string;
    publisher?: string;
    icao?: string;
  };
  profileKey: string;
  profilePath: string | null;
  fingerprint: string;
  before: {
    tanks: Record<string, number>;
    stations: Record<number, number>;
    onGround: boolean;
    enginesRunning: boolean;
  };
  apply: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>>;
  after: {
    tanks: Record<string, number>;
    stations: Record<number, number>;
  };
  rolledBack: boolean;
  rollbackOk: boolean | null;
  compareSummary: string | null;
  compareVerdict: 'pass' | 'warn' | 'fail' | null;
  preflight: MissionPreflightResult | null;
  error: string | null;
  /** How many CG cargo shifts ran (0 if none needed). */
  cgRebalanceMoves: number;
  /** CG ballast (lb) added on top of OFP cargo to hold the envelope. */
  ballastLb: number;
  /** Envelope painted on the Dispatch CG card (same pin as the inject gate). */
  displayCg?: {
    liveMac?: number;
    minMac?: number;
    maxMac?: number;
  };
};

export type OfpLoadProgressPhase =
  | 'planning'
  | 'injecting'
  | 'balancing'
  | 'verifying'
  | 'done'
  | 'failed';

export type OfpLoadProgress = {
  missionId: string;
  phase: OfpLoadProgressPhase;
  message: string;
  cgAttempt?: number;
  cgMaxAttempts?: number;
  liveMac?: number;
  minMac?: number;
  maxMac?: number;
  /** Live totals while inject runs (UI Loaded vs Due overlay). */
  liveFuelLb?: number;
  livePayloadLb?: number;
  /** Classic L/R/C breakdown for Preflight schematic while inject runs. */
  liveTanks?: FuelTankBreakdown;
  /** Classic L/R/C capacity (lb) for schematic fill while inject runs. */
  tankCapacity?: FuelTankBreakdown;
  /** Per-station live weights for Preflight schematic while inject runs. */
  liveStations?: Record<number, number>;
  /** Profile maxLoad (lb) keyed by station index. */
  stationMax?: Record<number, number>;
  plannedFuelLb?: number;
  plannedPayloadLb?: number;
  updatedAtIso: string;
};

function sumRecord(values: Record<string | number, number> | undefined): number {
  if (!values) return 0;
  let sum = 0;
  for (const v of Object.values(values)) {
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

function formatPipeError(message: string): string {
  if (/0xC00000B0/i.test(message) || /PIPE_DISCONNECTED/i.test(message)) {
    return (
      'SimBridge pipe disconnected (0xC00000B0) mid-inject. ' +
      'Usually concurrent Watch/probe traffic or a Host hiccup during many station writes. ' +
      'Keep SimBridge Host running and retry — Watch/probes pause while inject is active.'
    );
  }
  return message;
}

const ofpLoadProgressByMission = new Map<string, OfpLoadProgress>();
const ofpLoadCancelByMission = new Set<string>();
let lastProbeSnapshot: SimBridgeStatusPayload | null = null;
/** Serialize probe opens so concurrent UI polls don't thrash the named pipe. */
let probeInFlight: Promise<SimBridgeStatusPayload> | null = null;
const PROBE_STALE_OK_MS = 20_000;

/** Last known live MSFS title from SimBridge probe (for dispatch / family packs). */
export function getLastProbeAircraftTitle(): string | null {
  const title = lastProbeSnapshot?.aircraftTitle?.trim();
  return title || null;
}

export function getOfpLoadProgress(missionId: string): OfpLoadProgress | null {
  return ofpLoadProgressByMission.get(missionId) ?? null;
}

/** UI poll can show a message while Watch.stop() drains the in-flight tick. */
export function announceOfpLoadStarting(
  missionId: string,
  message: string,
): void {
  beginOfpLoad(missionId);
  setOfpLoadProgress(missionId, {
    phase: 'planning',
    message,
  });
}

/** True while a mission inject is actively planning/writing/verifying. */
export function isOfpLoadBusy(missionId: string): boolean {
  const phase = ofpLoadProgressByMission.get(missionId.trim())?.phase;
  return (
    phase === 'planning' ||
    phase === 'injecting' ||
    phase === 'balancing' ||
    phase === 'verifying'
  );
}

/** Request cancel of an in-flight OFP inject/rebalance for this mission. */
export function requestOfpLoadCancel(missionId: string): boolean {
  const id = missionId.trim();
  if (!id) return false;
  ofpLoadCancelByMission.add(id);
  const prev = ofpLoadProgressByMission.get(id);
  ofpLoadProgressByMission.set(id, {
    missionId: id,
    phase: 'failed',
    message: 'Cancel requested — stopping inject…',
    cgAttempt: prev?.cgAttempt,
    cgMaxAttempts: prev?.cgMaxAttempts,
    liveMac: prev?.liveMac,
    updatedAtIso: new Date().toISOString(),
  });
  return true;
}

function isOfpLoadCancelled(missionId: string): boolean {
  return ofpLoadCancelByMission.has(missionId);
}

function beginOfpLoad(missionId: string): void {
  ofpLoadCancelByMission.delete(missionId);
}

function setOfpLoadProgress(
  missionId: string,
  patch: Omit<OfpLoadProgress, 'missionId' | 'updatedAtIso'>,
): void {
  if (isOfpLoadCancelled(missionId) && patch.phase !== 'failed') {
    return;
  }
  ofpLoadProgressByMission.set(missionId, {
    missionId,
    ...patch,
    updatedAtIso: new Date().toISOString(),
  });
}

function clearOfpLoadProgress(missionId: string): void {
  ofpLoadProgressByMission.delete(missionId);
  ofpLoadCancelByMission.delete(missionId);
}

class OfpLoadCancelledError extends Error {
  constructor() {
    super('OFP load cancelled');
    this.name = 'OfpLoadCancelledError';
  }
}

function assertOfpLoadNotCancelled(missionId: string): void {
  if (isOfpLoadCancelled(missionId)) {
    throw new OfpLoadCancelledError();
  }
}

class OfpLoadTimedOutError extends Error {
  constructor(detail: string) {
    super(`Inject timed out — ${detail}`);
    this.name = 'OfpLoadTimedOutError';
  }
}

function assertOfpLoadWithinBudget(
  missionId: string,
  startedAtMs: number,
  phase: string,
): void {
  assertOfpLoadNotCancelled(missionId);
  const elapsed = Date.now() - startedAtMs;
  if (elapsed > INJECT_TOTAL_BUDGET_MS) {
    throw new OfpLoadTimedOutError(
      `${phase} exceeded ${Math.round(INJECT_TOTAL_BUDGET_MS / 1000)}s. ` +
        'SimBridge may be stuck — turn inject off, restart SimBridge Host if needed, then retry.',
    );
  }
}

function phaseFromFlags(
  onGround: boolean | null,
  enginesRunning: boolean | null,
  groundSpeedKt: number | null = null,
  prevPhase: string | null = null,
): string | null {
  if (onGround === null) return null;
  return flightPhaseFromSample(
    {
      onGround,
      enginesRunning: enginesRunning === true,
      groundSpeedKt: groundSpeedKt ?? undefined,
    },
    prevPhase,
  );
}

function finiteProbeNum(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Host ENG COMBUSTION:1 sticks true on JF Fokker / ATR after cutoff. */
async function inferProbeEnginesRunning(
  bridge: NamedPipeSimBridge,
  snapshotRunning: boolean,
): Promise<boolean> {
  try {
    const v = await bridge.readSimVars([
      { name: 'TURB ENG N1:1', unit: 'percent' },
      { name: 'TURB ENG N1:2', unit: 'percent' },
      { name: 'GENERAL ENG RPM:1', unit: 'rpm' },
      { name: 'GENERAL ENG RPM:2', unit: 'rpm' },
      { name: 'GENERAL ENG COMBUSTION:1', unit: 'bool' },
      { name: 'GENERAL ENG COMBUSTION:2', unit: 'bool' },
      { name: 'ENG FUEL FLOW PPH:1', unit: 'pounds per hour' },
      { name: 'ENG FUEL FLOW PPH:2', unit: 'pounds per hour' },
    ]);
    const n1Eng1 = finiteProbeNum(v[0]);
    const n1Eng2 = finiteProbeNum(v[1]);
    const rpmEng1 = finiteProbeNum(v[2]);
    const rpmEng2 = finiteProbeNum(v[3]);
    const combEng1 = finiteProbeNum(v[4]);
    const combEng2 = finiteProbeNum(v[5]);
    const pph1 = finiteProbeNum(v[6]);
    const pph2 = finiteProbeNum(v[7]);
    const n1Pct = [n1Eng1, n1Eng2].filter(
      (n): n is number => typeof n === 'number',
    );
    const rpm = [rpmEng1, rpmEng2].filter(
      (n): n is number => typeof n === 'number',
    );
    const combustion = [combEng1, combEng2]
      .filter((n): n is number => typeof n === 'number')
      .map((n) => n > 0.5);
    const pph = [pph1, pph2].filter(
      (n): n is number => typeof n === 'number' && n > 0.3,
    );
    const fuelFlowKgPerHour =
      pph.length > 0
        ? Math.round(pph.reduce((s, n) => s + n, 0) * 0.45359237 * 10) / 10
        : undefined;
    return inferEnginesRunning({
      snapshotRunning,
      n1Pct,
      rpm,
      combustion,
      fuelFlowKgPerHour,
    });
  } catch {
    return snapshotRunning;
  }
}

async function readLiveTanks(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  opts?: { skipTankIds?: string[]; readTimeoutMs?: number },
): Promise<Record<string, number>> {
  const tanks: Record<string, number> = {};
  const skip = new Set(
    (opts?.skipTankIds ?? []).map((id) => id.toUpperCase()),
  );
  const requests: Array<{ name: string; unit: string }> = [];
  const ids: string[] = [];
  for (const tank of profile.fuel.tanks) {
    if (skip.has(tank.id.toUpperCase())) {
      tanks[tank.id] = 0;
      continue;
    }
    requests.push({
      name: tank.readVar,
      unit: tank.readUnit || profile.fuel.unit || 'gallons',
    });
    ids.push(tank.id);
  }
  const values = await readSimVarsSoft(bridge, requests, opts?.readTimeoutMs);
  for (let i = 0; i < ids.length; i += 1) {
    tanks[ids[i]!] = finiteOrZero(values[i]);
  }
  return tanks;
}

/**
 * After a fuel write, AUX/TIP SimVars often read 0 for a beat while mains already
 * show the new quantity (Learjet → Sim 2508 = L+R only, tips flash empty).
 * Prefer the written target when live collapsed relative to what we just applied.
 */
async function readLiveTanksTrustingWrite(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  written: Record<string, number>,
  opts?: { skipTankIds?: string[]; readTimeoutMs?: number },
): Promise<Record<string, number>> {
  try {
    return preferWrittenFuelTanks(
      await readLiveTanks(bridge, profile, opts),
      written,
    );
  } catch (err) {
    if (simIpcSessionDied(err)) return written;
    throw err;
  }
}

async function readLiveStationsTrustingWrite(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  written: Record<number, number>,
): Promise<Record<number, number>> {
  try {
    const live = await readLiveStations(bridge, profile);
    const liveSum = sumRecord(live);
    const workSum = sumRecord(written);
    if (
      liveSum < 1 &&
      workSum > 100 &&
      Object.values(live).every((v) => (v ?? 0) < 1)
    ) {
      return { ...written };
    }
    return live;
  } catch (err) {
    if (simIpcSessionDied(err)) return { ...written };
    throw err;
  }
}

function preferWrittenFuelTanks(
  live: Record<string, number>,
  written: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...live };
  for (const [id, raw] of Object.entries(written)) {
    const w = Number.isFinite(raw) ? raw : 0;
    const l = Number.isFinite(out[id]) ? out[id]! : 0;
    if (w > 0.5 && l < w * 0.15) {
      out[id] = w;
    } else if (!(id in out)) {
      out[id] = w;
    }
  }
  return out;
}

async function readLiveStations(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  readTimeoutMs?: number,
): Promise<Record<number, number>> {
  const stations: Record<number, number> = {};
  const requests = profile.payload.stations.map((station) => ({
    name: station.readVar ?? `PAYLOAD STATION WEIGHT:${station.index}`,
    unit: 'pounds',
  }));
  const values = await readSimVarsSoft(bridge, requests, readTimeoutMs);
  for (let i = 0; i < profile.payload.stations.length; i += 1) {
    stations[profile.payload.stations[i]!.index] = finiteOrZero(values[i]);
  }
  return stations;
}

/** Station sum, or gross−empty−fuel when station SimVars under-read (Accu-Sim). */
async function readLivePayloadTotalLb(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  stations?: Record<number, number>,
): Promise<{ payloadLb: number; massBalanceLb?: number }> {
  const liveStations = stations ?? (await readLiveStations(bridge, profile));
  const stationSum = sumRecord(liveStations);
  let massBalanceLb: number | undefined;
  try {
    const [empty, gross, fuelWeight, gal, dens] = await readSimVarsSoft(bridge, [
      { name: 'EMPTY WEIGHT', unit: 'pounds' },
      { name: 'TOTAL WEIGHT', unit: 'pounds' },
      { name: 'FUEL TOTAL QUANTITY WEIGHT', unit: 'pounds' },
      { name: 'FUEL TOTAL QUANTITY', unit: 'gallons' },
      { name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' },
    ]);
    let fuelLb = fuelWeight;
    if (!(typeof fuelLb === 'number' && Number.isFinite(fuelLb) && fuelLb > 0)) {
      fuelLb =
        (Number.isFinite(gal) ? gal : 0) * (Number.isFinite(dens) ? dens : 0);
    }
    if (
      Number.isFinite(empty) &&
      Number.isFinite(gross) &&
      Number.isFinite(fuelLb) &&
      (empty ?? 0) > 0 &&
      (gross ?? 0) > (empty ?? 0)
    ) {
      massBalanceLb = Math.max(0, (gross ?? 0) - (empty ?? 0) - Math.max(0, fuelLb));
    }
  } catch (err) {
    if (simIpcSessionDied(err)) throw err;
    /* keep station sum */
  }
  const resolved = resolveLivePayloadLb({
    stationSumLb: stationSum,
    massBalanceLb,
  });
  return { payloadLb: resolved.payloadLb ?? stationSum, massBalanceLb };
}

/** One batch: profile tanks + stations + density + empty + MTOW. TIMEOUT throws. */
async function readLivePlanningSample(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  timeoutMs = 2_500,
): Promise<{
  tanks: Record<string, number>;
  stations: Record<number, number>;
  fuelLbPerGal?: number;
  emptyWeightLb?: number;
  maxGrossWeightLb?: number;
}> {
  const tankReqs = profile.fuel.tanks.map((tank) => ({
    name: tank.readVar,
    unit: tank.readUnit || profile.fuel.unit || 'gallons',
  }));
  const stationReqs = profile.payload.stations.map((station) => ({
    name: station.readVar ?? `PAYLOAD STATION WEIGHT:${station.index}`,
    unit: 'pounds',
  }));
  const extraReqs = [
    { name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' },
    { name: 'EMPTY WEIGHT', unit: 'pounds' },
    { name: 'MAX GROSS WEIGHT', unit: 'pounds' },
  ];
  const values = await readSimVarsSoft(
    bridge,
    [...tankReqs, ...stationReqs, ...extraReqs],
    timeoutMs,
  );
  const tanks: Record<string, number> = {};
  for (let i = 0; i < profile.fuel.tanks.length; i += 1) {
    tanks[profile.fuel.tanks[i]!.id] = finiteOrZero(values[i]);
  }
  const stations: Record<number, number> = {};
  const stationBase = tankReqs.length;
  for (let i = 0; i < profile.payload.stations.length; i += 1) {
    stations[profile.payload.stations[i]!.index] = finiteOrZero(
      values[stationBase + i],
    );
  }
  const extraBase = stationBase + stationReqs.length;
  const dens = values[extraBase];
  const empty = values[extraBase + 1];
  const mtow = values[extraBase + 2];
  return {
    tanks,
    stations,
    fuelLbPerGal:
      Number.isFinite(dens) && dens! > 4 && dens! < 9 ? dens : undefined,
    emptyWeightLb:
      Number.isFinite(empty) && empty! > 0 ? empty : undefined,
    maxGrossWeightLb:
      Number.isFinite(mtow) && mtow! > 0 ? mtow : undefined,
  };
}

function applySucceeded(
  apply: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>>,
): boolean {
  if (apply.fuel && !apply.fuel.success) return false;
  if (apply.payload && !apply.payload.success) return false;
  if (apply.cg && apply.cg.ok === false) return false;
  return true;
}

/** Rollback payload always; only rewrite fuel when a failed fuel write needs undo. */
function rollbackRequest(
  full: LoadPlanRequest,
  restoreFuel: boolean,
): LoadPlanRequest {
  if (restoreFuel) {
    return { ...full, cgPolicy: 'soft', writeGapMs: INJECT_WRITE_GAP_MS };
  }
  return {
    payload: full.payload,
    cgPolicy: 'soft',
    writeGapMs: INJECT_WRITE_GAP_MS,
  };
}

export async function probeSimBridgeStatus(opts: {
  watchSession?: CareerWatchSession;
  pipeName?: string;
} = {}): Promise<SimBridgeStatusPayload> {
  if (probeInFlight) {
    return probeInFlight;
  }
  probeInFlight = probeSimBridgeStatusUnlocked(opts).finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

async function probeSimBridgeStatusUnlocked(opts: {
  watchSession?: CareerWatchSession;
  pipeName?: string;
}): Promise<SimBridgeStatusPayload> {
  const checkedAtIso = new Date().toISOString();
  const watch = opts.watchSession?.getStatus();
  if (watch?.running) {
    const pipeDown =
      watch.pipeConnected === false ||
      (typeof watch.lastError === 'string' &&
        /not connected|pipe closed|0xC00000B0|Reconnecting/i.test(watch.lastError));
    return {
      connected: !pipeDown,
      mode: 'watch',
      aircraftTitle: null,
      onGround: watch.onGround,
      enginesRunning: watch.enginesRunning,
      parkingBrake: null,
      phase: watch.phase,
      groundSpeedKt: watch.groundSpeedKt,
      source: 'watch',
      error: watch.lastError,
      checkedAtIso,
    };
  }

  // Never open a competing pipe while OFP inject owns the bridge — that was
  // disconnecting the inject client (0xC00000B0).
  if (isOfpLoadActive()) {
    return {
      connected: true,
      mode: lastProbeSnapshot?.mode ?? 'simconnect',
      aircraftTitle: lastProbeSnapshot?.aircraftTitle ?? null,
      onGround: lastProbeSnapshot?.onGround ?? true,
      enginesRunning: lastProbeSnapshot?.enginesRunning ?? false,
      parkingBrake: lastProbeSnapshot?.parkingBrake ?? null,
      phase: lastProbeSnapshot?.phase ?? 'ground',
      groundSpeedKt: lastProbeSnapshot?.groundSpeedKt ?? null,
      source: 'probe',
      error: null,
      checkedAtIso,
    };
  }

  const bridge = new NamedPipeSimBridge(
    opts.pipeName ? { pipeName: opts.pipeName } : {},
  );
  return withSimBridgeExclusive(async () => {
  try {
    await bridge.open('Skyline Career UI SimBridge Probe');
    const ping = await bridge.ping();
    let aircraftTitle: string | null = null;
    try {
      const identity = await bridge.getAircraftIdentity();
      aircraftTitle = identity.title ?? null;
    } catch {
      aircraftTitle = null;
    }
    const snap = await bridge.snapshot();
    let groundSpeedKt: number | null = null;
    try {
      const gs = await bridge.readSimVar({
        name: 'GROUND VELOCITY',
        unit: 'knots',
      });
      if (Number.isFinite(gs) && gs >= 0) groundSpeedKt = gs;
    } catch {
      groundSpeedKt = null;
    }
    const enginesRunning = await inferProbeEnginesRunning(
      bridge,
      snap.enginesRunning,
    );
    const status: SimBridgeStatusPayload = {
      connected: Boolean(ping.connected ?? true),
      mode: ping.mode ?? null,
      aircraftTitle,
      onGround: snap.onGround,
      enginesRunning,
      parkingBrake: snap.parkingBrake ?? null,
      phase: phaseFromFlags(
        snap.onGround,
        enginesRunning,
        groundSpeedKt,
        lastProbeSnapshot?.phase,
      ),
      groundSpeedKt,
      source: 'probe',
      error: null,
      checkedAtIso,
    };
    lastProbeSnapshot = status;
    return status;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Keep last-good live sample briefly so the status bar doesn't flicker
    // when Watch start / inject / concurrent polls contend for the pipe.
    if (lastProbeSnapshot?.connected) {
      const parsed = Date.parse(lastProbeSnapshot.checkedAtIso || '');
      const ageMs = Number.isFinite(parsed)
        ? Date.now() - parsed
        : Number.POSITIVE_INFINITY;
      if (ageMs < PROBE_STALE_OK_MS) {
        return {
          ...lastProbeSnapshot,
          error: errMsg,
          checkedAtIso,
        };
      }
    }
    return {
      connected: false,
      mode: null,
      aircraftTitle: null,
      onGround: null,
      enginesRunning: null,
      parkingBrake: null,
      phase: null,
      groundSpeedKt: null,
      source: 'probe',
      error: errMsg,
      checkedAtIso,
    };
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
  });
}

export async function applyMissionOfpLoad(
  mission: MissionIntent,
  opts: {
    username?: string;
    userid?: string;
    pipeName?: string;
    catalogUrl?: string;
    runPreflightAfter?: boolean;
    /** Appended to fuel-inject progress when airframe burns more than healthy. */
    mxFuelBurnNote?: string;
    /** Optional block-fuel override (kg); normally omit so Due matches SimBrief. */
    targetBlockFuelKg?: number;
  } = {},
): Promise<OfpLoadApplyResult> {
  // UI polling must not start a second inject while the first still owns the pipe.
  return withOfpLoadExclusive(() => applyMissionOfpLoadExclusive(mission, opts));
}

async function applyMissionOfpLoadExclusive(
  mission: MissionIntent,
  opts: {
    username?: string;
    userid?: string;
    pipeName?: string;
    catalogUrl?: string;
    runPreflightAfter?: boolean;
    mxFuelBurnNote?: string;
    targetBlockFuelKg?: number;
  } = {},
): Promise<OfpLoadApplyResult> {
  if (!mission.staticId) {
    throw new Error('Mission has no static_id — Dispatch first');
  }
  if (mission.status !== 'dispatched' && mission.status !== 'accepted') {
    throw new Error(
      `Mission ${mission.id} cannot load OFP (status=${mission.status})`,
    );
  }
  const ofpCheck = mission.lastOfpCheck;
  if (!ofpCheck || (ofpCheck.verdict !== 'pass' && ofpCheck.verdict !== 'warn')) {
    throw new Error('Confirm OFP first (pass or warn) before loading into aircraft');
  }
  if (ofpCheck.staticId && ofpCheck.staticId !== mission.staticId) {
    throw new Error(
      'OFP confirmation is for a previous dispatch revision — re-confirm OFP first',
    );
  }

  beginOfpLoad(mission.id);
  if (!isOfpLoadActive()) {
    beginOfpLoadActive();
  }
  const injectStartedAtMs = Date.now();
  watchDebugLog('inject', 'begin', {
    missionId: mission.id,
    staticId: mission.staticId,
    writeGapMs: INJECT_WRITE_GAP_MS,
    budgetMs: INJECT_TOTAL_BUDGET_MS,
    ipcTimeoutMs: INJECT_IPC_TIMEOUT_MS,
  });
  try {
  setOfpLoadProgress(mission.id, {
    phase: 'planning',
    message: 'Fetching OFP from SimBrief…',
  });

  const username = opts.username?.trim() || process.env.SIMBRIEF_USERNAME?.trim();
  const userid = opts.userid?.trim() || process.env.SIMBRIEF_USERID?.trim();
  if (!username && !userid) {
    clearOfpLoadProgress(mission.id);
    throw new Error(
      'SimBrief username required — set it in Settings or SIMBRIEF_USERNAME env',
    );
  }

  assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'SimBrief fetch');
  const { expectation } = await fetchSimBriefLatestOfp({
    username,
    userid,
    staticId: mission.staticId,
  });

  let ofp = applyTargetBlockFuelKg(expectation, opts.targetBlockFuelKg);
  let stationRoles = ofp.payload?.stationRoles;

  setOfpLoadProgress(mission.id, {
    phase: 'planning',
    message: 'Connecting SimBridge for inject…',
  });

  const bridge = new NamedPipeSimBridge({
    ...(opts.pipeName ? { pipeName: opts.pipeName } : {}),
    // Multi-step inject can exceed a short IPC budget, but 60s made dead
    // SimConnect look like an infinite "Writing…" freeze.
    requestTimeoutMs: INJECT_IPC_TIMEOUT_MS,
    connectTimeoutMs: 10_000,
  });

  // Hold the exclusive gate for the whole write session so probe/preflight/Watch
  // reopen cannot open a second pipe client mid-inject (0xC00000B0).
  assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'waiting for SimBridge gate');
  const releaseSimBridgeGate = await acquireSimBridgeExclusive();
  let simBridgeGateHeld = true;
  const releaseSimBridgeGateOnce = () => {
    if (!simBridgeGateHeld) return;
    simBridgeGateHeld = false;
    releaseSimBridgeGate();
  };
  // Brief settle after draining the previous client (Watch stop / probe).
  await new Promise((r) => setTimeout(r, 300));

  let built: BuiltOfpLoadPlan | null = null;
  let rolledBack = false;
  let rollbackOk: boolean | null = null;
  let applyResult: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>> | null =
    null;
  let beforeLive = {
    tanks: {} as Record<string, number>,
    stations: {} as Record<number, number>,
    onGround: false,
    enginesRunning: false,
  };
  let afterLive = {
    tanks: {} as Record<string, number>,
    stations: {} as Record<number, number>,
  };
  let identity = { title: '', publisher: undefined as string | undefined, icao: undefined as string | undefined };
  let profileKey = '';
  let profilePath: string | null = null;
  let fingerprint = '';
  let compareSummary: string | null = null;
  let compareVerdict: 'pass' | 'warn' | 'fail' | null = null;
  let preflight: MissionPreflightResult | null = null;
  let error: string | null = null;
  let cgRebalanceMoves = 0;
  let ballastPlacedLb = 0;
  let engine: DefaultProfileEngine | null = null;
  let rollbackPlan: LoadPlanRequest | null = null;
  /** True only when we attempted a fuel write that did not succeed (needs undo). */
  let restoreFuelOnRollback = false;

  try {
    assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'opening SimBridge');
    setOfpLoadProgress(mission.id, {
      phase: 'planning',
      message: 'Opening a fresh SimConnect session…',
    });
    await bridge.open('Skyline Career UI OFP Load', { resetSession: true });
    watchDebugLog('inject', 'simconnect session reset', {
      missionId: mission.id,
    });

    assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'resolving aircraft');
    setOfpLoadProgress(mission.id, {
      phase: 'planning',
      message: 'Matching aircraft profile…',
    });
    const localCatalog = await loadProfilesFromDirs(defaultProfileDirs(repoRoot));
    const cache = new ProfileCache(defaultCacheDir(repoRoot));
    const resolveInjectAircraft = () =>
      resolveLiveAircraft({
        bridge,
        localCatalog,
        cache,
        catalogUrl: opts.catalogUrl,
        skipStructureSample: true,
      });
    let resolved: Awaited<ReturnType<typeof resolveLiveAircraft>>;
    try {
      resolved = await resolveInjectAircraft();
    } catch (resolveErr) {
      if (!simIpcSessionDied(resolveErr)) {
        throw resolveErr;
      }
      watchDebugLog('inject', 'first read failed — reset SimConnect session', {
        error: resolveErr instanceof Error ? resolveErr.message : String(resolveErr),
      });
      await bridge.open('Skyline Career UI OFP Load', { resetSession: true });
      resolved = await resolveInjectAircraft();
    }

    if (!resolved.matched || !resolved.profile) {
      throw new Error(
        `No writable aircraft profile for "${resolved.identity.title}" — homologate this aircraft first`,
      );
    }

    identity = {
      title: resolved.identity.title,
      publisher: resolved.identity.publisher,
      icao: resolved.identity.icao,
    };
    profileKey = resolved.profile.profileKey;
    profilePath = resolved.path ?? null;
    fingerprint = resolved.fingerprint;

    try {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: mission.rolesPackRelPath,
        airframeTypeId: mission.airframeTypeId,
        strictAirframeMatch: Boolean(mission.airframeTypeId),
        liveTitle:
          normalizeAircraftTitle(resolved.identity.title) ||
          resolved.identity.title,
      });
      assertRolesPackAllowsDirectInjection(roles.pack);
      stationRoles = roles.pack.payload?.stationRoles ?? stationRoles;
      ofp = applyOfpOverrides(expectation, {
        stationRoles: roles.pack.payload?.stationRoles,
        liveSources: roles.pack.liveSources,
      });
    } catch (rolesError) {
      if (
        rolesError instanceof Error &&
        (rolesError.message.includes('loadMethod=') ||
          rolesError.message.includes('injectCapable') ||
          rolesError.message.includes('purchased airframe'))
      ) {
        throw rolesError;
      }
      // Freighter may still load if OFP already carries stationRoles.
    }

    setOfpLoadProgress(mission.id, {
      phase: 'planning',
      message: 'Reading current fuel and payload…',
    });
    const snap = await bridge.snapshot();
    const readPlanningLive = () =>
      readLivePlanningSample(bridge, resolved.profile, 2_500);
    let planningLive: Awaited<ReturnType<typeof readPlanningLive>>;
    try {
      planningLive = await readPlanningLive();
    } catch (planErr) {
      if (!simIpcSessionDied(planErr)) throw planErr;
      watchDebugLog('inject', 'planning read failed — reset SimConnect session', {
        error: planErr instanceof Error ? planErr.message : String(planErr),
      });
      await bridge.open('Skyline Career UI OFP Load', { resetSession: true });
      planningLive = await readPlanningLive();
    }
    beforeLive = {
      tanks: planningLive.tanks,
      stations: planningLive.stations,
      onGround: snap.onGround,
      enginesRunning: snap.enginesRunning,
    };

    // Same density as buildOfpLoadPlan — raw MSFS FUEL WEIGHT PER GALLON often
    // flickers to avgas ~6.0 on Accu-Sim while the plan used Jet-A 6.7 (Sim 672
    // vs Due 751 on Aerostar = identical gallons × wrong density).
    const fuelLbPerGal = resolveFuelDensityLbPerGal(
      resolved.profile,
      planningLive.fuelLbPerGal,
    );
    const weightLimits = {
      emptyWeightLb: planningLive.emptyWeightLb,
      maxGrossWeightLb: planningLive.maxGrossWeightLb,
    };
    let clampedFuelTargetKg: number | undefined;

    const careerAirframe = findCareerPlayerAirframe(mission.airframeTypeId);
    // pax_and_cargo: Due/ZFW cargo = SimBrief payload (may be route-trimmed).
    // Not ofpCargoKg baggage-only when passengerCount > 0.
    const paxAndCargoFreightKg = isPaxAndCargoLoadLayout(careerAirframe)
      ? ofpFreightTowardMissionKg(ofp, careerAirframe)
      : undefined;

    try {
      built = buildOfpLoadPlan({
        ofp,
        profile: resolved.profile,
        stationRoles,
        liveStationsLb: beforeLive.stations,
        fuelLbPerGal,
        ...(paxAndCargoFreightKg !== undefined
          ? { cargoKg: paxAndCargoFreightKg }
          : {}),
        cargoKgFallback: mission.cargoKg,
        emptyWeightLb: weightLimits.emptyWeightLb,
        maxGrossWeightLb: weightLimits.maxGrossWeightLb,
        // Career: fill to tank max instead of aborting when SimBrief plans past capacity
        // (e.g. Twin Otter fuselage-only profile on a 500+ NM leg).
        clampFuelToCapacity: true,
      });
    } catch (planError) {
      if (planError instanceof OfpLoadPlanError) {
        throw new Error(`${planError.code}: ${planError.message}`);
      }
      throw planError;
    }

    if (built.fuelClamped && built.blockFuelLb > 0) {
      clampedFuelTargetKg = built.blockFuelLb / KG_TO_LB;
      ofp = applyTargetBlockFuelKg(ofp, clampedFuelTargetKg);
      const shortLb = Math.max(
        0,
        Math.round((built.requestedBlockFuelLb ?? built.blockFuelLb) - built.blockFuelLb),
      );
      watchDebugLog('inject', 'fuel clamped to tank capacity', {
        requestedLb: built.requestedBlockFuelLb ?? null,
        clampedLb: built.blockFuelLb,
        shortLb,
        capacity: built.tankCapacityTotal,
        unit: built.fuelUnit,
      });
    }

    rollbackPlan = buildRollbackPlan(resolved.profile, beforeLive);
    engine = new DefaultProfileEngine({
      profile: resolved.profile,
      bridge,
    });

    // Strict CG only when envelope provenance is authoritative.
    const envelopeSource = resolved.profile.cg?.envelopeSource;
    const cgPolicy =
      envelopeSource === 'cfg' ||
      envelopeSource === 'manual' ||
      envelopeSource === 'simvar' ||
      envelopeSource === 'live-sweep'
        ? 'strict'
        : 'soft';

    const plannedTanks = built.plan.fuel?.tanks ?? {};
    // Skip fuel only when weight already matches Due tightly. Do NOT apply the
    // unusable-overshoot slack here — that would skip draining AUX/tip residuals
    // (King Air ~58 lb/side) and leave reinject doing payload-only.
    const beforeFuelLb = (() => {
      const qty = sumRecord(beforeLive.tanks);
      const unit = resolved.profile.fuel.unit ?? 'gallons';
      if (unit === 'pounds') return qty;
      if (unit === 'kilograms') return qty * 2.20462262185;
      if (unit === 'liters') return qty * (fuelLbPerGal / 3.785411784);
      return qty * fuelLbPerGal;
    })();
    const fuelAlreadyOk =
      careerFuelMatchOk(beforeFuelLb, built.blockFuelLb, 50, 150, 0) &&
      liveFuelMatchesTarget(beforeLive.tanks, plannedTanks);
    let plannedFuelLb = built.blockFuelLb;
    const plannedCrewLb = isPaxAndCargoLoadLayout(careerAirframe)
      ? 0
      : built.crewStations.length > 0
        ? built.crewStations.reduce((sum, idx) => {
            const st = resolved.profile.payload.stations.find((s) => s.index === idx);
            return (
              sum +
              (st
                ? Math.min(FREIGHTER_PILOT_LB, st.maxLoad)
                : FREIGHTER_PILOT_LB)
            );
          }, 0)
        : 0;
    /**
     * Due payload = OFP weight sent to SimBrief (requested cargo / payload).
     * Crew seed is taken out of that total at inject time — not added on top.
     */
    const plannedPayloadLb = built.requestedCargoLb ?? built.cargoLb;

    watchDebugLog('inject', 'plan ready', {
      missionId: mission.id,
      title: identity.title,
      profileKey,
      cargoLb: built.cargoLb,
      crewStations: built.crewStations,
      passengerStations: built.passengerStations,
      baggageStations: built.baggageStations,
      seatStations: built.seatStations,
      plannedFuelLb,
      plannedPayloadLb,
      fuelClamped: built.fuelClamped === true,
      requestedBlockFuelLb: built.requestedBlockFuelLb ?? null,
      cgPolicy,
      beforeStations: stationsSnapshot(beforeLive.stations),
      beforeFuelLb: sumRecord(beforeLive.tanks),
    });

    const tanksToFuelLb = (tanks: Record<string, number>): number => {
      const qty = sumRecord(tanks);
      const unit = resolved.profile.fuel.unit ?? 'gallons';
      if (unit === 'pounds') return qty;
      if (unit === 'kilograms') return qty * 2.20462262185;
      if (unit === 'liters') return qty * (fuelLbPerGal / 3.785411784);
      return qty * fuelLbPerGal;
    };

    const tankQtyToLb = (qty: number): number => {
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      const unit = resolved.profile.fuel.unit ?? 'gallons';
      if (unit === 'pounds') return qty;
      if (unit === 'kilograms') return qty * 2.20462262185;
      if (unit === 'liters') return qty * (fuelLbPerGal / 3.785411784);
      return qty * fuelLbPerGal;
    };

    /** Fold profile tank ids into the Preflight L/R/C (+ aux/tip) schematic. */
    const schematicTanksFromProfile = (
      tanks: Record<string, number>,
    ): FuelTankBreakdown => {
      let left = 0;
      let right = 0;
      let center = 0;
      let leftAux = 0;
      let rightAux = 0;
      let leftTip = 0;
      let rightTip = 0;
      for (const [id, qty] of Object.entries(tanks)) {
        const lb = tankQtyToLb(qty);
        const key = id.toLowerCase();
        if (/(center|centre)/.test(key)) center += lb;
        else if (/tip/.test(key) && /right|_r\b|^r_/.test(key)) rightTip += lb;
        else if (/tip/.test(key) && /left|_l\b|^l_/.test(key)) leftTip += lb;
        else if (/aux/.test(key) && /right|_r\b|^r_/.test(key)) rightAux += lb;
        else if (/aux/.test(key) && /left|_l\b|^l_/.test(key)) leftAux += lb;
        else if (/right|_r\b|^r_/.test(key)) right += lb;
        else if (/left|_l\b|^l_/.test(key)) left += lb;
        else {
          left += lb / 2;
          right += lb / 2;
        }
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
    };

    afterLive = {
      tanks: { ...beforeLive.tanks },
      stations: { ...beforeLive.stations },
    };

    const seatStations = built.seatStations ?? [
      ...built.crewStations,
      ...(built.passengerStations ?? []),
    ];
    let baggageStations = [...built.baggageStations];
    const minRetainByIndex: Record<number, number> = {};
    for (const idx of built.crewStations) {
      minRetainByIndex[idx] = FREIGHTER_PILOT_LB;
    }
    const preferSeatFill = (built.passengerStations?.length ?? 0) > 0;
    const seatSoftMaxByIndex: Record<number, number> = {};
    const seatOccupantSoft = preferSeatFill
      ? SEAT_OCCUPANT_SOFT_MAX_LB
      : FREIGHTER_CREW_STATION_SOFT_MAX_LB;
    for (const idx of seatStations) {
      seatSoftMaxByIndex[idx] = seatSoftMaxLb(
        resolved.profile,
        idx,
        seatOccupantSoft,
      );
    }
    let baggageSoftMaxByIndex: Record<number, number> = {};
    const rebuildBaggageSoftMax = () => {
      baggageSoftMaxByIndex = {};
      for (const idx of baggageStations) {
        const hard =
          resolved.profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
        baggageSoftMaxByIndex[idx] = preferSeatFill
          ? Math.min(hard, GA_BAGGAGE_SOFT_MAX_LB)
          : hard;
      }
    };
    rebuildBaggageSoftMax();
    /** Stations that ignore SimConnect writes (ghost indexes). */
    let ghostPrunePasses = 0;
    const MAX_GHOST_PRUNE_PASSES = 2;

    // Start from crew floors; pax/baggage empty. Cargo prefers seats, baggage last.
    let workingStations: Record<number, number> = {};
    for (const station of resolved.profile.payload.stations) {
      if (seatStations.includes(station.index) || baggageStations.includes(station.index)) {
        workingStations[station.index] = minRetainByIndex[station.index] ?? 0;
      } else {
        workingStations[station.index] =
          built.plan.payload?.stations?.[station.index] ?? 0;
      }
    }

    const schematicStationMax = stationMaxFromProfile(resolved.profile);
    const schematicTankCapacity = tankCapacityLbFromProfile(resolved.profile);
    let lastGoodSchematicTanks: FuelTankBreakdown | undefined =
      schematicTanksFromProfile(beforeLive.tanks);
    let lastGoodFuelLb: number | undefined = tanksToFuelLb(beforeLive.tanks);
    let lastLiveMac: number | undefined;
    let lastMinMac: number | undefined;
    let lastMaxMac: number | undefined;
    // Inject is fuel-then-payload sequentially, but a post-write live tank read
    // often under-shoots Due for a beat (Accu-Sim / classic settle). Hold Sim on
    // the write target until inject finishes so the card does not dip mid-payload.
    let fuelUiTanks: Record<string, number> | undefined;

    const paintFuelUiFromWriteTarget = (tanks: Record<string, number>) => {
      fuelUiTanks = { ...tanks };
      afterLive = { tanks: { ...tanks }, stations: afterLive.stations };
      lastGoodSchematicTanks =
        pickFuelTankBreakdown(
          schematicTanksFromProfile(tanks),
          lastGoodSchematicTanks,
          tanksToFuelLb(tanks),
        ) ?? schematicTanksFromProfile(tanks);
      lastGoodFuelLb = tanksToFuelLb(tanks);
    };

    /**
     * Re-sample live tanks and paint the fuel card. Prefer written values when
     * SimConnect under-reads AUX/TIP (classic flash), but adopt live outers when
     * the aircraft redistributes fuel tip↔main after our write — otherwise the
     * schematic stays "mains full / tips empty" until payload verify.
     */
    const refreshFuelUiFromLive = async (
      writtenFallback: Record<string, number>,
    ) => {
      try {
        const live = await readLiveTanks(bridge, resolved.profile);
        const base = fuelUiTanks ?? writtenFallback;
        paintFuelUiFromWriteTarget(preferWrittenFuelTanks(live, base));
      } catch {
        /* keep last painted target */
      }
    };

    const publishLiveProgress = (
      phase: OfpLoadProgressPhase,
      message: string,
      extra?: {
        cgAttempt?: number;
        liveMac?: number;
        minMac?: number;
        maxMac?: number;
      },
    ) => {
      const liveStationSum = sumRecord(afterLive.stations);
      const workingSum = sumRecord(workingStations);
      const stationsForUi =
        liveStationSum >= workingSum * 0.5
          ? { ...afterLive.stations }
          : { ...workingStations };
      const tanksForFuel = fuelUiTanks ?? afterLive.tanks;
      const rawFuelLb = tanksToFuelLb(tanksForFuel);
      const rawTanks = schematicTanksFromProfile(tanksForFuel);
      const heldTanks =
        pickFuelTankBreakdown(rawTanks, lastGoodSchematicTanks, rawFuelLb) ??
        rawTanks;
      // Stabilize with held tanks so Sim total matches tip schematic (not L+R only).
      const liveFuelLb =
        liveFuelLbCoherentWithTanks(
          pickStableLiveFuelLb({
            next: rawFuelLb,
            prev: lastGoodFuelLb,
            plannedLb: plannedFuelLb,
            nextTanks: heldTanks,
            prevTanks: lastGoodSchematicTanks,
          }) ?? rawFuelLb,
          heldTanks,
        ) ?? rawFuelLb;
      const liveTanks = heldTanks;
      if (liveTanks) lastGoodSchematicTanks = liveTanks;
      if (typeof liveFuelLb === 'number' && Number.isFinite(liveFuelLb)) {
        lastGoodFuelLb = liveFuelLb;
      }
      const rawOuterLb =
        (rawTanks.leftAux ?? 0) +
        (rawTanks.rightAux ?? 0) +
        (rawTanks.leftTip ?? 0) +
        (rawTanks.rightTip ?? 0);
      const heldOuterLb =
        (liveTanks.leftAux ?? 0) +
        (liveTanks.rightAux ?? 0) +
        (liveTanks.leftTip ?? 0) +
        (liveTanks.rightTip ?? 0);
      // Log tip holds / fuel phases only — balance rounds would flood the file.
      if (
        message.startsWith('Fuel') ||
        message.startsWith('Injecting OFP fuel') ||
        heldOuterLb > rawOuterLb + 25 ||
        Math.abs(rawFuelLb - liveFuelLb) > 25
      ) {
        watchDebugLog('inject', 'progress', {
          phase,
          liveFuelLb: Math.round(liveFuelLb),
          rawFuelLb: Math.round(rawFuelLb),
          tanks: {
            left: Math.round(liveTanks.left),
            right: Math.round(liveTanks.right),
            center: Math.round(liveTanks.center),
            leftAux: Math.round(liveTanks.leftAux ?? 0),
            rightAux: Math.round(liveTanks.rightAux ?? 0),
          },
          rawOuter: {
            leftAux: Math.round(rawTanks.leftAux ?? 0),
            rightAux: Math.round(rawTanks.rightAux ?? 0),
          },
          heldOuter: heldOuterLb > rawOuterLb + 25,
          heldFuel: Math.abs(rawFuelLb - liveFuelLb) > 25,
        });
      }
      setOfpLoadProgress(mission.id, {
        phase,
        message,
        cgAttempt: extra?.cgAttempt,
        cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
        liveMac: extra?.liveMac ?? lastLiveMac,
        minMac: extra?.minMac ?? lastMinMac,
        maxMac: extra?.maxMac ?? lastMaxMac,
        liveFuelLb,
        // Prefer working plan when station SimVars under-read mid-inject.
        livePayloadLb: Math.max(liveStationSum, workingSum),
        liveTanks,
        ...(schematicTankCapacity
          ? { tankCapacity: schematicTankCapacity }
          : {}),
        liveStations: stationsForUi,
        ...(schematicStationMax ? { stationMax: schematicStationMax } : {}),
        plannedFuelLb,
        plannedPayloadLb,
      });
    };

    let cargoPlacedLb = 0;
    let cargoTargetLb = Math.max(0, plannedPayloadLb - plannedCrewLb);
    const seatCount = preferSeatFill
      ? Math.max(1, seatStations.length)
      : Math.max(1, baggageStations.length || built.movableStations.length);
    let bias: 'equal' | 'forward' | 'aft' = 'equal';
    let softCgWarn = false;
    let prevLiveMac: number | undefined;
    let aftLimited = false;
    let fwdLimited = false;
    let perSeatLb = CG_BALANCE_STEP_LB;

    const roomUnderSoftCap = (indexes: number[]): boolean =>
      indexes.some((idx) => {
        const soft = seatSoftMaxByIndex[idx];
        const hard =
          resolved.profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
        const cap = soft !== undefined ? Math.min(hard, soft) : hard;
        return (workingStations[idx] ?? 0) + 0.5 < cap;
      });

    const roomOnBaggage = (): boolean =>
      baggageStations.some((idx) => {
        const cap = baggageSoftMaxByIndex[idx] ?? 0;
        return (workingStations[idx] ?? 0) + 0.5 < cap;
      });

    const reconnectBridge = async (): Promise<void> => {
      await bridge.open('Skyline Career UI OFP Load', { resetSession: true });
      engine = new DefaultProfileEngine({
        profile: resolved.profile,
        bridge,
      });
    };

    const applyPayloadRound = async (
      stations: Record<number, number>,
      total: number,
    ) => {
      const t0 = Date.now();
      try {
        const result = await engine!.applyLoadPlan({
          payload: { stations, total },
          cgPolicy: 'none',
          skipVerify: true,
          writeGapMs: INJECT_WRITE_GAP_MS,
        });
        watchDebugLog('inject', 'payload round ok', {
          ms: Date.now() - t0,
          total: Math.round(total),
          success: result.payload?.success ?? null,
          errorCode: result.payload?.errorCode ?? null,
          stations: stationsSnapshot(stations),
        });
        return result;
      } catch (err) {
        watchDebugLog('inject', 'payload round throw', {
          ms: Date.now() - t0,
          total: Math.round(total),
          pipeDisconnect: isPipeDisconnectError(err),
          error: err instanceof Error ? err.message : String(err),
          stations: stationsSnapshot(stations),
        });
        if (!isPipeDisconnectError(err)) throw err;
        await reconnectBridge();
        watchDebugLog('inject', 'payload round retry after reconnect', {
          total: Math.round(total),
        });
        const result = await engine!.applyLoadPlan({
          payload: { stations, total },
          cgPolicy: 'none',
          skipVerify: true,
          writeGapMs: INJECT_WRITE_GAP_MS,
        });
        watchDebugLog('inject', 'payload round retry result', {
          success: result.payload?.success ?? null,
          errorCode: result.payload?.errorCode ?? null,
        });
        return result;
      }
    };

    const applyFuelRound = async (
      tanks: Record<string, number>,
      opts?: { omitFuelTankWrites?: string[] },
    ) => {
      const t0 = Date.now();
      const fuel = { ...built.plan.fuel!, tanks };
      const omitFuelTankWrites =
        opts?.omitFuelTankWrites && opts.omitFuelTankWrites.length > 0
          ? opts.omitFuelTankWrites
          : undefined;
      const run = () =>
        engine!.applyLoadPlan({
          fuel,
          cgPolicy: 'none',
          skipVerify: true,
          writeGapMs: INJECT_WRITE_GAP_MS,
          ...(omitFuelTankWrites ? { omitFuelTankWrites } : {}),
        });
      const isSoftPipeFail = (result: Awaited<ReturnType<typeof run>>) => {
        const detail =
          result.fuel?.details &&
          typeof result.fuel.details === 'object' &&
          result.fuel.details !== null &&
          'message' in result.fuel.details
            ? String((result.fuel.details as { message?: unknown }).message ?? '')
            : '';
        return Boolean(
          result.fuel &&
            !result.fuel.success &&
            (isPipeDisconnectError(detail) ||
              result.fuel.errorCode === 'FUEL_WRITE_FAILED'),
        );
      };
      try {
        let result = await run();
        watchDebugLog('inject', 'fuel round ok', {
          ms: Date.now() - t0,
          success: result.fuel?.success ?? null,
          errorCode: result.fuel?.errorCode ?? null,
          omittedOuter: omitFuelTankWrites ?? [],
          tanks: Object.fromEntries(
            Object.entries(tanks).map(([k, v]) => [k, Math.round(v * 10) / 10]),
          ),
        });
        if (isSoftPipeFail(result)) {
          watchDebugLog('inject', 'fuel round soft pipe fail — reconnect', {
            errorCode: result.fuel?.errorCode ?? null,
          });
          await reconnectBridge();
          await new Promise((r) => setTimeout(r, 400));
          result = await run();
          watchDebugLog('inject', 'fuel round retry result', {
            success: result.fuel?.success ?? null,
            errorCode: result.fuel?.errorCode ?? null,
          });
        }
        return result;
      } catch (err) {
        watchDebugLog('inject', 'fuel round throw', {
          ms: Date.now() - t0,
          pipeDisconnect: isPipeDisconnectError(err),
          error: err instanceof Error ? err.message : String(err),
        });
        if (!isPipeDisconnectError(err)) throw err;
        await reconnectBridge();
        await new Promise((r) => setTimeout(r, 400));
        watchDebugLog('inject', 'fuel round retry after reconnect', {});
        const result = await run();
        watchDebugLog('inject', 'fuel round retry result', {
          success: result.fuel?.success ?? null,
          errorCode: result.fuel?.errorCode ?? null,
        });
        return result;
      }
    };

    assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'fuel inject');
    const mxNote = opts.mxFuelBurnNote?.trim();
    const withMxNote = (message: string) =>
      mxNote && message.startsWith('Injecting OFP fuel')
        ? `${message} · ${mxNote}`
        : message;

    const pmdgCduFuel = isPmdgCduFuelProfile(resolved.profile);
    const pmdgCduPayload = isPmdgCduPayloadProfile(resolved.profile);
    /** Absolute ZFW typed on CDU — used for post-inject verify (not station sum). */
    let pmdgCduZfwTargetLb: number | undefined;

    let fuelCduScratchpadCleared = false;
    if (pmdgCduFuel || pmdgCduPayload) {
      publishLiveProgress(
        'injecting',
        pmdgCduFuel && !fuelAlreadyOk
          ? withMxNote('PMDG CDU fuel TOTAL (FO)…')
          : 'PMDG CDU payload ZFW (FO)…',
      );

      if (pmdgCduFuel && !fuelAlreadyOk && built.plan.fuel) {
        if (beforeLive.enginesRunning) {
          throw new Error(
            'Shut down engines before fuel inject — PMDG CDU fuel load requires engines off',
          );
        }
        restoreFuelOnRollback = false;
        assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'pmdg-cdu fuel');
        const fuelApply = await applyPmdgCduFuelOnce({
          engine,
          fuel: built.plan.fuel,
        });
        applyResult = {
          ...(applyResult ?? {}),
          fuel: fuelApply ?? applyResult?.fuel,
        };
        if (fuelApply && !fuelApply.success) {
          restoreFuelOnRollback = true;
        } else if (fuelApply?.success) {
          fuelCduScratchpadCleared = true;
          paintFuelUiFromWriteTarget(built.plan.fuel.tanks ?? {});
          publishLiveProgress(
            'injecting',
            `CDU fuel done · ${Math.round(plannedFuelLb)} lb target`,
          );
          await delayCancellable(mission.id, 800);
        }
      } else if (fuelAlreadyOk || !built.plan.fuel) {
        const skipTanks =
          Object.keys(plannedTanks).length > 0 ? plannedTanks : beforeLive.tanks;
        paintFuelUiFromWriteTarget(skipTanks);
      }

      const fuelOkCdu =
        fuelAlreadyOk || !applyResult?.fuel || applyResult.fuel.success;
      if (fuelOkCdu && pmdgCduPayload) {
        assertOfpLoadWithinBudget(mission.id, injectStartedAtMs, 'pmdg-cdu zfw');
        publishLiveProgress(
          'injecting',
          fuelCduScratchpadCleared
            ? 'PMDG CDU ZFW (FO)… (scratchpad already cleared)'
            : 'PMDG CDU ZFW (FO)…',
        );
        const serviceStations = ofp.payload?.stationRoles?.serviceStations ?? [];
        const cabinCargoStations = [
          ...new Set([
            ...built.passengerStations,
            ...built.baggageStations,
          ]),
        ];
        watchDebugLog('inject', 'pmdg-cdu zfw opts', {
          skipScratchpadClear: fuelCduScratchpadCleared,
          fuelAlreadyOk,
          fuelSuccess: applyResult?.fuel?.success ?? null,
        });
        const zfwApply = await applyPmdgCduPayloadOnce({
          engine,
          bridge,
          ofp,
          requestedCargoLb: built.requestedCargoLb ?? built.cargoLb,
          liveStations: beforeLive.stations,
          baggageStationIndexes: cabinCargoStations,
          fixedNonCargoStationIndexes: [
            ...built.crewStations,
            ...serviceStations,
          ],
          skipScratchpadClear: fuelCduScratchpadCleared,
        });
        applyResult = {
          ...(applyResult ?? {}),
          payload: zfwApply.payload ?? applyResult?.payload,
          cg: { ok: true, failures: [] },
        };
        pmdgCduZfwTargetLb = zfwApply.zfwLb;
        publishLiveProgress(
          'injecting',
          `CDU ZFW ${zfwApply.zfwLb.toFixed(0)} lb (${zfwApply.method})`,
        );
        // Let PMDG redistribute MAIN/FWD/AFT before classic station reads.
        await delayCancellable(mission.id, 2000);
        try {
          const liveSt = await readLiveStations(bridge, resolved.profile);
          workingStations = { ...liveSt };
          afterLive = {
            tanks: afterLive.tanks,
            stations: liveSt,
          };
        } catch (err) {
          if (!simIpcSessionDied(err)) throw err;
          afterLive = {
            tanks: afterLive.tanks,
            stations: { ...workingStations },
          };
        }
      }

      // Fall through to shared live refresh / verify / closeout below.
      // Skip classic multi-round fuel + CG station loops.
      if (!applyResult) applyResult = {};
    }

    if (!pmdgCduFuel && !pmdgCduPayload) {
    publishLiveProgress(
      'injecting',
      fuelAlreadyOk
        ? `Fuel OK — loading payload +${CG_BALANCE_STEP_LB} lb/seat across ${seatCount} seats…`
        : built.fuelClamped
          ? withMxNote(
              `OFP over tanks — loading max ${Math.round(built.blockFuelLb)} lb (1/${FUEL_INJECT_ROUNDS})…`,
            )
          : withMxNote(`Injecting OFP fuel (1/${FUEL_INJECT_ROUNDS})…`),
    );

    if (!fuelAlreadyOk && built.plan.fuel) {
      if (beforeLive.enginesRunning) {
        throw new Error(
          'Shut down engines before fuel inject — MSFS will not drain AUX/tip tanks with engines running',
        );
      }
      const startTanks = { ...beforeLive.tanks };
      // If tips/AUX already sit on an unusable floor, bake that into the target
      // and pull the same qty from mains so the first pass aims at Due total.
      let endTanks = redistributeAroundResidualFloors(
        built.plan.fuel.tanks ?? {},
        startTanks,
      ).tanks;
      built.plan.fuel = { ...built.plan.fuel, tanks: endTanks };
      // Idle AUX/TIP (empty live + empty plan) — skip writes/reads so Baron etc.
      // do not poke unused outers that stall SimConnect (~15s IPC timeouts).
      const idleOuterIds = idleOuterFuelTankIds(startTanks, endTanks);
      restoreFuelOnRollback = false;
      for (let round = 1; round <= FUEL_INJECT_ROUNDS; round++) {
        assertOfpLoadWithinBudget(
          mission.id,
          injectStartedAtMs,
          `fuel round ${round}/${FUEL_INJECT_ROUNDS}`,
        );
        const tanks = fuelTankTargetsForRound(
          startTanks,
          endTanks,
          round,
          FUEL_INJECT_ROUNDS,
        );
        const omitOuter = idleOuterFuelTankIds(startTanks, tanks);
        publishLiveProgress(
          'injecting',
          withMxNote(`Injecting OFP fuel (${round}/${FUEL_INJECT_ROUNDS})…`),
        );
        const fuelApply = await applyFuelRound(tanks, {
          omitFuelTankWrites: omitOuter,
        });
        applyResult = {
          ...(applyResult ?? {}),
          fuel: fuelApply.fuel ?? applyResult?.fuel,
        };
        if (fuelApply.fuel && !fuelApply.fuel.success) {
          restoreFuelOnRollback = true;
          break;
        }
        // Paint Sim from write target each round (density-correct lb). Do not
        // publish a post-write live under-read — that is what looked like a
        // "flick" before payload even though fuel writes already finished.
        paintFuelUiFromWriteTarget(tanks);
        publishLiveProgress(
          'injecting',
          `Fuel ${round}/${FUEL_INJECT_ROUNDS} · ${Math.round(lastGoodFuelLb ?? 0)} lb`,
        );

        const isFinalRound = round >= FUEL_INJECT_ROUNDS;
        const settleMs = isFinalRound
          ? PAYLOAD_CG_SETTLE_MS
          : FUEL_ROUND_SETTLE_MS;
        await delayCancellable(mission.id, settleMs);

        // Live sample only for residual math — UI stays on write target.
        if (isFinalRound) {
          await readLiveTanksTrustingWrite(
            bridge,
            resolved.profile,
            tanks,
            { skipTankIds: idleOuterIds },
          );
        }
      }
      // After drain attempts: accept remaining AUX/TIP floors and lower mains
      // so total stays on OFP Due (King Air tips stick ~10–12 gal / ~80 lb each).
      if (!restoreFuelOnRollback) {
        const liveAfter = await readLiveTanksTrustingWrite(
          bridge,
          resolved.profile,
          endTanks,
          { skipTankIds: idleOuterIds },
        );
        const adjusted = redistributeAroundResidualFloors(
          built.plan.fuel.tanks ?? plannedTanks,
          liveAfter,
        );
        if (adjusted.added > 0.05 || adjusted.reduced > 0.05) {
          endTanks = adjusted.tanks;
          built.plan.fuel = { ...built.plan.fuel!, tanks: endTanks };
          watchDebugLog('inject', 'redistributed around fuel residual floors', {
            addedQty: Math.round(adjusted.added * 100) / 100,
            reducedQty: Math.round(adjusted.reduced * 100) / 100,
            tanks: Object.fromEntries(
              Object.entries(endTanks).map(([k, v]) => [
                k,
                Math.round(v * 10) / 10,
              ]),
            ),
          });
          publishLiveProgress(
            'injecting',
            `Balancing tip residual into mains · ${Math.round(tanksToFuelLb(endTanks))} lb`,
          );
          const fuelApply = await applyFuelRound(endTanks, {
            omitFuelTankWrites: idleOuterFuelTankIds(liveAfter, endTanks),
          });
          applyResult = {
            ...(applyResult ?? {}),
            fuel: fuelApply.fuel ?? applyResult?.fuel,
          };
          paintFuelUiFromWriteTarget(endTanks);
          publishLiveProgress(
            'injecting',
            `Fuel balanced · ${Math.round(lastGoodFuelLb ?? 0)} lb`,
          );
          await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
          await readLiveTanksTrustingWrite(
            bridge,
            resolved.profile,
            endTanks,
            { skipTankIds: idleOuterFuelTankIds(liveAfter, endTanks) },
          );
          paintFuelUiFromWriteTarget(endTanks);
        } else {
          paintFuelUiFromWriteTarget(endTanks);
        }
      }
      // Fuel phase done — settle, then re-read so tip/nacelle redistribution
      // shows on the card before payload (not only after verify).
      if (!restoreFuelOnRollback) {
        paintFuelUiFromWriteTarget(endTanks);
        await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
        await refreshFuelUiFromLive(endTanks);
        publishLiveProgress(
          'injecting',
          `Fuel complete · ${Math.round(lastGoodFuelLb ?? 0)} lb — loading payload…`,
        );
      }
      if (!applyResult) applyResult = {};
    } else {
      applyResult = {};
      restoreFuelOnRollback = false;
      const skipTanks =
        Object.keys(plannedTanks).length > 0 ? plannedTanks : beforeLive.tanks;
      paintFuelUiFromWriteTarget(skipTanks);
      await refreshFuelUiFromLive(skipTanks);
    }

    // Seed crew floors on aircraft before cargo rounds.
    {
      const seedTotal = Object.values(workingStations).reduce((a, b) => a + b, 0);
      const seedApply = await engine.applyLoadPlan({
        payload: { stations: workingStations, total: seedTotal },
        cgPolicy: 'none',
        skipVerify: true,
        writeGapMs: INJECT_WRITE_GAP_MS,
      });
      applyResult = {
        ...applyResult,
        payload: seedApply.payload ?? applyResult.payload,
      };
      assertOfpLoadNotCancelled(mission.id);
      afterLive = {
        tanks: afterLive.tanks,
        stations: { ...workingStations },
      };
      publishLiveProgress(
        'balancing',
        `Crew seeded — placing cargo +${CG_BALANCE_STEP_LB} lb per seat…`,
      );
      // Trust the crew write for stations. CG is sampled each fill round
      // (one readSimVars batch) so the aft-limit stop can fire.
    }

    const fuelOk =
      fuelAlreadyOk || !applyResult.fuel || applyResult.fuel.success;
    if (fuelOk) {
      for (let i = 0; i < CG_REBALANCE_MAX_ITERATIONS; i++) {
        assertOfpLoadNotCancelled(mission.id);
        // Do not refresh fuel from live while placing cargo. ATR (and similar)
        // dump mains on station writes; painting that mid-loop looks like
        // random fuel updates after payload starts. Restore tanks after cargo.
        const stillPlacing = cargoPlacedLb < cargoTargetLb - 0.5;
        // Hybrid fill: equal across all cargo stations first (Kodiak /
        // Caravan). At a limit → shift and keep Due; leftover then stays
        // on the helping side. Never toward-center (v0.3.10 C408).
        let liveMac = lastLiveMac;
        const liveCg = await readLiveCgStateBestEffort(
          bridge,
          {
            readVar: resolved.profile.cg?.readVar,
            readUnit: resolved.profile.cg?.readUnit,
          },
          { liveMac: lastLiveMac, minMac: lastMinMac, maxMac: lastMaxMac },
        );
        liveMac = liveCg.liveMac;
        const envelope = resolveInjectCgEnvelope({
          envelopeSource: resolved.profile.cg?.envelopeSource,
          profileMinMac: resolved.profile.cg?.constraints?.minMac,
          profileMaxMac: resolved.profile.cg?.constraints?.maxMac,
          liveMinMac: liveCg.minMac ?? lastMinMac,
          liveMaxMac: liveCg.maxMac ?? lastMaxMac,
        });
        const minMac = envelope.minMac;
        const maxMac = envelope.maxMac;
        lastMinMac = minMac;
        lastMaxMac = maxMac;

        const haveEnvelope =
          liveMac !== undefined &&
          minMac !== undefined &&
          maxMac !== undefined;
        const lo = haveEnvelope ? minMac! + CG_REBALANCE_MARGIN_MAC : undefined;
        const hi = haveEnvelope ? maxMac! - CG_REBALANCE_MARGIN_MAC : undefined;
        const inEnvelope =
          haveEnvelope && liveMac! >= lo! && liveMac! <= hi!;

        const fillAction = haveEnvelope
          ? resolveCgFillAction({
              liveMac: liveMac!,
              lo: lo!,
              hi: hi!,
              aftLimited,
              fwdLimited,
            })
          : 'equal';
        if (fillAction === 'shift-forward') aftLimited = true;
        if (fillAction === 'shift-aft') fwdLimited = true;
        if (stillPlacing) {
          bias =
            fillAction === 'shift-aft'
              ? 'aft'
              : fillAction === 'shift-forward' || fillAction === 'forward'
                ? 'forward'
                : 'equal';
          perSeatLb = CG_BALANCE_STEP_LB;
        } else if (haveEnvelope) {
          bias = resolveCgCounterweightBias({
            liveMac: liveMac!,
            lo: lo!,
            hi: hi!,
            prevMac: prevLiveMac,
          });
          perSeatLb = cgCounterweightPerSeatLb({
            liveMac: liveMac!,
            lo: lo!,
            hi: hi!,
            prevMac: prevLiveMac,
            baseLb: CG_BALANCE_STEP_LB,
          });
        } else {
          bias = 'equal';
          perSeatLb = CG_BALANCE_STEP_LB;
        }

        const macTrend =
          prevLiveMac !== undefined && liveMac !== undefined
            ? liveMac - prevLiveMac
            : 0;
        lastLiveMac = liveMac;
        prevLiveMac = liveMac;

        if (!stillPlacing && (!haveEnvelope || inEnvelope)) {
          applyResult = {
            ...applyResult,
            cg: { ok: true, failures: [] },
          };
          publishLiveProgress(
            'balancing',
            liveMac !== undefined
              ? `CG in envelope (${liveMac.toFixed(1)}% MAC)`
              : 'Payload complete',
            { cgAttempt: i, liveMac },
          );
          watchDebugLog('inject', 'balance done', {
            round: i,
            reason: 'cargo+cg ok',
            cargoPlacedLb: Math.round(cargoPlacedLb),
            cargoTargetLb: Math.round(cargoTargetLb),
            liveMac,
            working: stationsSnapshot(workingStations),
          });
          break;
        }

        const blockedByLimit =
          stillPlacing &&
          (fillAction === 'shift-forward' || fillAction === 'shift-aft');

        let nextStations = workingStations;
        let movedLb = 0;
        let placeIndexes: number[] = [];
        let placeBias: 'equal' | 'forward' | 'aft' = bias;
        if (
          stillPlacing &&
          blockedByLimit &&
          !preferSeatFill &&
          roomOnBaggage()
        ) {
          // Crew-only CG can sit past FWD before any cargo exists (Aerostar
          // −10.8% after S1/S2 seed). Shift has nothing to move — place Due
          // on the helping half instead of cutting cargo to 0.
          const side = fillAction === 'shift-aft' ? 'aft' : 'forward';
          const helping = longitudinalHalfIndexes(
            resolved.profile,
            baggageStations,
            side,
          );
          placeIndexes = helping.length > 0 ? helping : baggageStations;
          placeBias = 'equal';
          const holdMaxLoadLb = placeIndexes.reduce((max, idx) => {
            const hard =
              resolved.profile.payload.stations.find((s) => s.index === idx)
                ?.maxLoad ?? 0;
            return Math.max(max, hard);
          }, 0);
          const stepLb = cargoPlaceStepLb({
            placingOnBaggage: true,
            gaCabin: false,
            perSeatLb,
            remainingLb: cargoTargetLb - cargoPlacedLb,
            holdMaxLoadLb,
          });
          const placed = allocateCargoRoundPerSeat(
            workingStations,
            resolved.profile,
            placeIndexes,
            stepLb,
            'equal',
            cargoTargetLb - cargoPlacedLb,
            { softMaxByIndex: baggageSoftMaxByIndex },
          );
          nextStations = placed.stations;
          movedLb = placed.movedLb;
          cargoPlacedLb += movedLb;
          watchDebugLog('inject', 'limit_place', {
            round: i,
            fillAction,
            side,
            placeIndexes,
            movedLb: Math.round(movedLb),
            cargoPlacedLb: Math.round(cargoPlacedLb),
            liveMac,
          });
        } else if (stillPlacing && !blockedByLimit) {
          // Seats first (soft-capped). Baggage only when seats are full or freighter.
          let softMax: Record<number, number> | undefined;
          if (preferSeatFill && roomUnderSoftCap(seatStations)) {
            placeIndexes = seatStations;
            softMax = seatSoftMaxByIndex;
          } else if (roomOnBaggage()) {
            if (!preferSeatFill && fillAction === 'forward') {
              // Aft limit already fired: leftover Due on the nose, not S7.
              const helping = longitudinalHalfIndexes(
                resolved.profile,
                baggageStations,
                'forward',
              );
              placeIndexes = forwardMostOpenStationGroup(
                workingStations,
                resolved.profile,
                helping.length > 0 ? helping : baggageStations,
                { softMaxByIndex: baggageSoftMaxByIndex },
              );
            } else {
              placeIndexes = baggageStations;
            }
            softMax = baggageSoftMaxByIndex;
            if (placeIndexes.length === 0) {
              cargoTargetLb = cargoPlacedLb;
              watchDebugLog('inject', 'balance stop', {
                round: i,
                reason: 'soft_caps_full',
                cargoPlacedLb: Math.round(cargoPlacedLb),
                cargoTargetLb: Math.round(cargoTargetLb),
                fillAction,
                working: stationsSnapshot(workingStations),
              });
              break;
            }
          } else if (roomUnderSoftCap(seatStations)) {
            placeIndexes = seatStations;
            softMax = seatSoftMaxByIndex;
          } else {
            // Soft-caps full — accept partial cargo instead of forcing structural max.
            cargoTargetLb = cargoPlacedLb;
            watchDebugLog('inject', 'balance stop', {
              round: i,
              reason: 'soft_caps_full',
              cargoPlacedLb: Math.round(cargoPlacedLb),
              cargoTargetLb: Math.round(cargoTargetLb),
              working: stationsSnapshot(workingStations),
            });
            break;
          }
          // Equal within chosen indexes. GA seats stay equal; GA baggage may
          // use fill bias. Cabin-as-baggage helping-side is already the nose group.
          placeBias = !preferSeatFill
            ? 'equal'
            : placeIndexes === baggageStations
              ? bias
              : 'equal';
          const holdMaxLoadLb = placeIndexes.reduce((max, idx) => {
            const hard =
              resolved.profile.payload.stations.find((s) => s.index === idx)
                ?.maxLoad ?? 0;
            return Math.max(max, hard);
          }, 0);
          const stepLb = cargoPlaceStepLb({
            placingOnBaggage: placeIndexes === baggageStations,
            gaCabin: preferSeatFill,
            perSeatLb,
            remainingLb: cargoTargetLb - cargoPlacedLb,
            holdMaxLoadLb,
          });
          let placed = allocateCargoRoundPerSeat(
            workingStations,
            resolved.profile,
            placeIndexes,
            stepLb,
            placeBias,
            cargoTargetLb - cargoPlacedLb,
            softMax ? { softMaxByIndex: softMax } : undefined,
          );
          // Forward/aft half can be full while other stations still have room —
          // fall back to equal so freighter cargo does not stall mid-cabin.
          // Do not spill onto the tail when MAC is already aft of midpoint
          // (Bonanza +50×S7 overshoot).
          const aftOfMid =
            haveEnvelope &&
            liveMac !== undefined &&
            lo !== undefined &&
            hi !== undefined &&
            liveMac > (lo + hi) / 2;
          if (
            placed.movedLb <= 0 &&
            placeBias !== 'equal' &&
            !aftOfMid &&
            (roomOnBaggage() || roomUnderSoftCap(seatStations))
          ) {
            watchDebugLog('inject', 'bias half full — fallback equal', {
              round: i,
              placeBias,
              placeIndexes,
              liveMac,
            });
            placeBias = 'equal';
            placed = allocateCargoRoundPerSeat(
              workingStations,
              resolved.profile,
              placeIndexes,
              stepLb,
              'equal',
              cargoTargetLb - cargoPlacedLb,
              softMax ? { softMaxByIndex: softMax } : undefined,
            );
          }
          nextStations = placed.stations;
          movedLb = placed.movedLb;
          cargoPlacedLb += movedLb;
        } else if (haveEnvelope && !inEnvelope) {
          // Counterweight among seats first. Never dump more onto baggage when already aft.
          // If cargo Due remains, shift first then keep placing on the helping
          // side — do not cut Due.
          if (blockedByLimit) {
            const side = fillAction === 'shift-aft' ? 'aft' : 'forward';
            publishLiveProgress(
              'balancing',
              `CG at ${side} limit (${liveMac!.toFixed(1)}% MAC) — shifting ${side === 'aft' ? 'aft' : 'forward'} to keep loading Due`,
              { cgAttempt: i + 1, liveMac },
            );
            watchDebugLog('inject', 'limit_shift', {
              round: i,
              fillAction,
              cargoPlacedLb: Math.round(cargoPlacedLb),
              cargoTargetLb: Math.round(cargoTargetLb),
              liveMac,
            });
          }
          const direction = bias === 'aft' ? 'aft' : 'forward';
          const half = Math.max(1, Math.ceil(seatCount / 2));
          const shiftBudget = perSeatLb * half;
          // Freighter (no pax): always shift crew+baggage together. Seat-only
          // shift on arm-less profiles fake-moves L/R crew pairs (S1↔S2) then
          // equalize undoes it — burned all CG iterations with movedLb>0 and
          // unchanged stations (C90 at ~29.4% MAC).
          const freighterShiftIndexes = built.movableStations;
          const gaSeatShift =
            preferSeatFill && seatStations.length >= 2
              ? seatStations
              : freighterShiftIndexes;
          const freighterShiftOpts = {
            minRetainByIndex,
            softMaxByIndex: {
              ...seatSoftMaxByIndex,
              ...baggageSoftMaxByIndex,
            },
            // Fill forward baggage (S3/S4) before dumping onto crew (S1/S2).
            deferTargetIndexes: built.crewStations,
          };
          let shifted = shiftCargoForCg(
            workingStations,
            resolved.profile,
            preferSeatFill ? gaSeatShift : freighterShiftIndexes,
            direction,
            shiftBudget,
            preferSeatFill
              ? {
                  minRetainByIndex,
                  softMaxByIndex: seatSoftMaxByIndex,
                }
              : freighterShiftOpts,
          );
          if (
            shifted.movedLb <= 0 &&
            direction === 'forward' &&
            preferSeatFill &&
            baggageStations.length > 0 &&
            seatStations.length > 0
          ) {
            // Only pull mass out of baggage toward the nose — never add aft dumps.
            shifted = shiftCargoForCg(
              workingStations,
              resolved.profile,
              built.movableStations,
              'forward',
              shiftBudget,
              {
                minRetainByIndex,
                softMaxByIndex: {
                  ...seatSoftMaxByIndex,
                  ...baggageSoftMaxByIndex,
                },
                deferTargetIndexes: built.crewStations,
              },
            );
          }
          nextStations = shifted.stations;
          movedLb = shifted.movedLb;
          // Freighter fallback if the combined soft-max path still couldn't move.
          if (
            shifted.movedLb <= 0 &&
            !preferSeatFill &&
            baggageStations.length > 0
          ) {
            shifted = shiftCargoForCg(
              workingStations,
              resolved.profile,
              built.movableStations,
              direction,
              shiftBudget,
              freighterShiftOpts,
            );
            nextStations = shifted.stations;
            movedLb = shifted.movedLb;
          }
          // Ferry / empty cabin: cargo target is met (often 0) and crew seats sit
          // at their floor, so there is nothing left to shift. Add the minimum
          // ballast that walks CG back into the envelope instead of rolling back.
          if (
            shifted.movedLb <= 0 &&
            !stillPlacing &&
            !preferSeatFill &&
            ballastPlacedLb < CG_BALLAST_MAX_LB &&
            built.movableStations.length > 0
          ) {
            const ballasted = allocateCargoRoundPerSeat(
              workingStations,
              resolved.profile,
              built.movableStations,
              perSeatLb,
              bias,
              CG_BALLAST_MAX_LB - ballastPlacedLb,
              {
                softMaxByIndex: {
                  ...seatSoftMaxByIndex,
                  ...baggageSoftMaxByIndex,
                },
              },
            );
            if (ballasted.movedLb > 0) {
              nextStations = ballasted.stations;
              movedLb = ballasted.movedLb;
              ballastPlacedLb += ballasted.movedLb;
              publishLiveProgress(
                'balancing',
                `CG ${liveMac!.toFixed(1)}% MAC — adding ${Math.round(ballasted.movedLb)} lb ballast`,
                { cgAttempt: i + 1, liveMac },
              );
              watchDebugLog('inject', 'ballast', {
                round: i,
                bias,
                addedLb: Math.round(ballasted.movedLb),
                ballastPlacedLb: Math.round(ballastPlacedLb),
                liveMac,
              });
            }
          }
          // GA: CG at limit after soft-capped load is advisory — keep the seats.
          if (
            preferSeatFill &&
            shifted.movedLb <= 0 &&
            haveEnvelope &&
            !inEnvelope
          ) {
            softCgWarn = true;
            applyResult = {
              ...applyResult,
              cg: {
                ok: true,
                failures: [
                  {
                    var: 'CG PERCENT',
                    expected: (minMac! + maxMac!) / 2,
                    actual: liveMac!,
                    tolerancePct: CG_REBALANCE_MARGIN_MAC,
                  },
                ],
              },
            };
            watchDebugLog('inject', 'balance stop', {
              round: i,
              reason: 'ga_cg_advisory',
              liveMac,
              cargoPlacedLb: Math.round(cargoPlacedLb),
            });
            break;
          }
        } else {
          watchDebugLog('inject', 'balance stop', {
            round: i,
            reason: 'nothing_to_do',
            stillPlacing,
            inEnvelope,
            cargoPlacedLb: Math.round(cargoPlacedLb),
            cargoTargetLb: Math.round(cargoTargetLb),
          });
          break;
        }

        if (movedLb <= 0) {
          if (stillPlacing) {
            cargoTargetLb = cargoPlacedLb;
          }
          if (!stillPlacing && haveEnvelope && !inEnvelope) {
            // Inside tablet envelope but outside 1% margin → keep load (advisory).
            // Only hard-fail when truly past min/max MAC.
            const inAbsolute =
              liveMac! >= minMac! && liveMac! <= maxMac!;
            if (inAbsolute || preferSeatFill || cgPolicy !== 'strict') {
              softCgWarn = true;
              applyResult = {
                ...applyResult,
                cg: {
                  ok: true,
                  failures: [
                    {
                      var: 'CG PERCENT',
                      expected: (minMac! + maxMac!) / 2,
                      actual: liveMac!,
                      tolerancePct: CG_REBALANCE_MARGIN_MAC,
                    },
                  ],
                },
              };
            } else {
              applyResult = {
                ...applyResult,
                cg: {
                  ok: false,
                  failures: [
                    {
                      var: 'CG PERCENT',
                      expected: (minMac! + maxMac!) / 2,
                      actual: liveMac!,
                      tolerancePct: CG_REBALANCE_MARGIN_MAC,
                    },
                  ],
                },
              };
            }
          }
          watchDebugLog('inject', 'balance stop', {
            round: i,
            reason: 'moved_lb_zero',
            stillPlacing,
            placeBias,
            placeIndexes,
            liveMac,
            lo,
            hi,
            cargoPlacedLb: Math.round(cargoPlacedLb),
            cargoTargetLb: Math.round(cargoTargetLb),
            working: stationsSnapshot(workingStations),
          });
          break;
        }

        // Belt-and-suspenders: L/R pairs can drift when CG shift uses index order
        // as a fake longitudinal axis (Bonanza rear L/R share arm).
        workingStations = equalizeLateralStationPairs(
          nextStations,
          resolved.profile,
          built.movableStations,
          {
            softMaxByIndex: {
              ...seatSoftMaxByIndex,
              ...baggageSoftMaxByIndex,
            },
          },
        );
        const total = Object.values(workingStations).reduce((a, b) => a + b, 0);
        built = {
          ...built,
          plan: {
            ...built.plan,
            payload: { stations: workingStations, total },
          },
        };
        cgRebalanceMoves += 1;
        assertOfpLoadNotCancelled(mission.id);
        const payloadApply = await applyPayloadRound(workingStations, total);
        assertOfpLoadNotCancelled(mission.id);
        // Optimistic UI from the write so Sim payload moves every round even when
        // station SimVars hang (same failure mode as idle Baron AUX fuel reads).
        afterLive = {
          tanks: afterLive.tanks,
          stations: { ...workingStations },
        };
        publishLiveProgress(
          'balancing',
          stillPlacing
            ? `Round ${i + 1}: writing ${Math.round(cargoPlacedLb)}/${Math.round(cargoTargetLb)} lb…`
            : `Round ${i + 1}: writing counterweight…`,
          { cgAttempt: i + 1, liveMac },
        );
        applyResult = {
          ...applyResult,
          payload: payloadApply.payload ?? applyResult.payload,
          cg: payloadApply.cg ?? applyResult.cg,
        };
        if (stillPlacing) {
          // More cargo rounds to go — don't block on 16 station reads.
          // Next loop samples CG in one batch before the next +50 write.
          continue;
        }
        await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
        const liveStations = await readLiveStationsTrustingWrite(
          bridge,
          resolved.profile,
          workingStations,
        );
        const liveSumRaw = sumRecord(liveStations);
        const workSum = sumRecord(workingStations);
        const liveReadCollapsed =
          liveSumRaw < 1 &&
          workSum > 100 &&
          Object.values(liveStations).every((v) => (v ?? 0) < 1);
        if (liveReadCollapsed) {
          watchDebugLog('inject', 'live station read collapsed — trusting write', {
            round: i + 1,
            workingSum: Math.round(workSum),
            writeOk: payloadApply.payload?.success ?? null,
          });
        }
        afterLive = {
          tanks: afterLive.tanks,
          stations: liveReadCollapsed ? { ...workingStations } : liveStations,
        };
        // Re-read CG after settle so the UI sees verified state for this round.
        const verifiedCg = await readLiveCgStateBestEffort(
          bridge,
          {
            readVar: resolved.profile.cg?.readVar,
            readUnit: resolved.profile.cg?.readUnit,
          },
          { liveMac: lastLiveMac, minMac: lastMinMac, maxMac: lastMaxMac },
        );
        const verifiedMac = verifiedCg.liveMac ?? liveMac;
        lastLiveMac = verifiedMac;
        prevLiveMac = verifiedMac;
        const liveSum = sumRecord(afterLive.stations);
        const underApplied =
          !liveReadCollapsed && liveSum + 75 < workSum * 0.7;
        watchDebugLog('inject', 'balance round', {
          round: i + 1,
          stillPlacing,
          placeBias,
          placeIndexes,
          movedLb: Math.round(movedLb),
          perSeatLb,
          cargoPlacedLb: Math.round(cargoPlacedLb),
          cargoTargetLb: Math.round(cargoTargetLb),
          liveMac: verifiedMac,
          lo,
          hi,
          writeOk: payloadApply.payload?.success ?? null,
          writeError: payloadApply.payload?.errorCode ?? null,
          workingSum: Math.round(workSum),
          liveSum: Math.round(liveSum),
          underApplied,
          liveReadCollapsed,
          working: stationsSnapshot(workingStations),
          live: stationsSnapshot(afterLive.stations),
        });

        // Ghost stations: write "succeeds" but live stays 0 — or sticks briefly then
        // drops (Learjet S17/S18). Also catch partial ghosts when only ~200 lb is
        // missing (old gate required live < 70% of working, so mild losses were ignored).
        const ghostCandidates = liveReadCollapsed
          ? []
          : baggageStations.filter((idx) => {
              const want = workingStations[idx] ?? 0;
              const got = afterLive.stations[idx] ?? 0;
              return want > 20 && got < 5;
            });
        const missingVsLive = workSum - liveSum;
        const shouldPruneGhosts =
          ghostCandidates.length > 0 &&
          missingVsLive > 75 &&
          ghostPrunePasses < MAX_GHOST_PRUNE_PASSES &&
          baggageStations.some((idx) => !ghostCandidates.includes(idx));
        if (shouldPruneGhosts) {
          ghostPrunePasses += 1;
          const dead = ghostCandidates;
          const originalCargoLb = built.cargoLb;
          baggageStations = baggageStations.filter((idx) => !dead.includes(idx));
          rebuildBaggageSoftMax();
          for (const idx of dead) {
            workingStations[idx] = 0;
          }
          const bagCap = baggageStations.reduce((sum, idx) => {
            const hard =
              resolved.profile.payload.stations.find((s) => s.index === idx)
                ?.maxLoad ?? 0;
            return sum + hard;
          }, 0);
          const clampedTarget = Math.min(originalCargoLb, bagCap);
          for (const idx of baggageStations) {
            workingStations[idx] = 0;
          }
          workingStations = equalizeMovableStations(
            workingStations,
            resolved.profile,
            baggageStations,
            clampedTarget,
            {
              minRetainByIndex: Object.fromEntries(
                baggageStations.map((idx) => [idx, 0]),
              ),
              softMaxByIndex: preferSeatFill
                ? baggageSoftMaxByIndex
                : undefined,
            },
          );
          workingStations = equalizeLateralStationPairs(
            workingStations,
            resolved.profile,
            baggageStations,
            {
              softMaxByIndex: preferSeatFill
                ? baggageSoftMaxByIndex
                : undefined,
            },
          );
          cargoTargetLb = clampedTarget;
          cargoPlacedLb = baggageStations.reduce(
            (sum, idx) => sum + (workingStations[idx] ?? 0),
            0,
          );
          const rewriteTotal = Object.values(workingStations).reduce(
            (a, b) => a + b,
            0,
          );
          built = {
            ...built,
            cargoLb: clampedTarget,
            baggageStations,
            plan: {
              ...built.plan,
              payload: { stations: workingStations, total: rewriteTotal },
            },
          };
          watchDebugLog('inject', 'dead stations pruned', {
            dead,
            pass: ghostPrunePasses,
            missingVsLive: Math.round(missingVsLive),
            underApplied,
            stickyBaggage: baggageStations,
            clampedCargoLb: Math.round(clampedTarget),
            originalCargoLb: Math.round(originalCargoLb),
            rewriteTotal: Math.round(rewriteTotal),
            working: stationsSnapshot(workingStations),
          });
          assertOfpLoadNotCancelled(mission.id);
          const rewriteApply = await applyPayloadRound(
            workingStations,
            rewriteTotal,
          );
          assertOfpLoadNotCancelled(mission.id);
          afterLive = {
            tanks: afterLive.tanks,
            stations: { ...workingStations },
          };
          publishLiveProgress(
            'balancing',
            `Rewrote cargo onto sticky stations · ${Math.round(rewriteTotal)} lb`,
          );
          await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
          applyResult = {
            ...applyResult,
            payload: rewriteApply.payload ?? applyResult.payload,
          };
          const rewriteLive = await readLiveStationsTrustingWrite(
            bridge,
            resolved.profile,
            workingStations,
          );
          const rewriteLiveSum = sumRecord(rewriteLive);
          const rewriteCollapsed =
            rewriteLiveSum < 1 &&
            rewriteTotal > 100 &&
            Object.values(rewriteLive).every((v) => (v ?? 0) < 1);
          afterLive = {
            tanks: afterLive.tanks,
            stations: rewriteCollapsed
              ? { ...workingStations }
              : rewriteLive,
          };
          watchDebugLog('inject', 'dead stations rewrite', {
            pass: ghostPrunePasses,
            writeOk: rewriteApply.payload?.success ?? null,
            live: stationsSnapshot(afterLive.stations),
            liveSum: Math.round(sumRecord(afterLive.stations)),
            workingSum: Math.round(rewriteTotal),
            liveReadCollapsed: rewriteCollapsed,
          });
          if (rewriteApply.payload && !rewriteApply.payload.success) {
            watchDebugLog('inject', 'balance stop', {
              round: i + 1,
              reason: 'dead_station_rewrite_failed',
              errorCode: rewriteApply.payload.errorCode,
            });
            break;
          }
          cargoPlacedLb = baggageStations.reduce(
            (sum, idx) => sum + (afterLive.stations[idx] ?? 0),
            0,
          );
          continue;
        }
        if (
          ghostCandidates.length > 0 &&
          missingVsLive > 75 &&
          !baggageStations.some((idx) => !ghostCandidates.includes(idx))
        ) {
          watchDebugLog('inject', 'ghost stations but no sticky baggage', {
            dead: ghostCandidates,
            missingVsLive: Math.round(missingVsLive),
          });
        }

        const trendNote =
          macTrend > 0.05 ? 'drifting aft' : macTrend < -0.05 ? 'drifting fwd' : 'stable';
        // One progress publish per round — after write + settle + read-verify.
        publishLiveProgress(
          'balancing',
          stillPlacing
            ? `Round ${i + 1}: placed ${cargoPlacedLb}/${cargoTargetLb} lb (+${perSeatLb} lb/seat → ${bias}, ${trendNote})` +
              (verifiedMac !== undefined ? ` · ${verifiedMac.toFixed(1)}% MAC` : '')
            : `Round ${i + 1}: counterweight (+${perSeatLb} lb/seat → ${bias}, ${trendNote})` +
              (verifiedMac !== undefined ? ` · ${verifiedMac.toFixed(1)}% MAC` : ''),
          { cgAttempt: i + 1, liveMac: verifiedMac },
        );
        if (payloadApply.payload && !payloadApply.payload.success) {
          watchDebugLog('inject', 'balance stop', {
            round: i + 1,
            reason: 'payload_write_failed',
            errorCode: payloadApply.payload.errorCode,
            details: payloadApply.payload.details ?? null,
            working: stationsSnapshot(workingStations),
            live: stationsSnapshot(afterLive.stations),
          });
          break;
        }
      }

      watchDebugLog('inject', 'balance loop exit', {
        cargoPlacedLb: Math.round(cargoPlacedLb),
        cargoTargetLb: Math.round(cargoTargetLb),
        cgRebalanceMoves,
        working: stationsSnapshot(workingStations),
        live: stationsSnapshot(afterLive.stations),
      });

      // One cargo hold (C408 passenger S5): 50 lb/round hit the iteration cap
      // at 1200 lb. Finish remaining onto baggage while CG is still inside.
      const catchUpRemaining = cargoTargetLb - cargoPlacedLb;
      const catchUpHi =
        lastMaxMac !== undefined
          ? lastMaxMac - CG_REBALANCE_MARGIN_MAC
          : undefined;
      const catchUpAftOk =
        lastLiveMac === undefined ||
        catchUpHi === undefined ||
        lastLiveMac < catchUpHi;
      if (
        catchUpRemaining > 0.5 &&
        !preferSeatFill &&
        roomOnBaggage() &&
        catchUpAftOk
      ) {
        const caught = equalizeMovableStations(
          workingStations,
          resolved.profile,
          baggageStations,
          catchUpRemaining,
          {
            minRetainByIndex: Object.fromEntries(
              baggageStations.map((idx) => [idx, workingStations[idx] ?? 0]),
            ),
            softMaxByIndex: baggageSoftMaxByIndex,
          },
        );
        const added = baggageStations.reduce(
          (sum, idx) => sum + Math.max(0, (caught[idx] ?? 0) - (workingStations[idx] ?? 0)),
          0,
        );
        if (added > 0.5) {
          workingStations = caught;
          cargoPlacedLb += added;
          const total = Object.values(workingStations).reduce((a, b) => a + b, 0);
          watchDebugLog('inject', 'baggage catch-up', {
            addedLb: Math.round(added),
            cargoPlacedLb: Math.round(cargoPlacedLb),
            cargoTargetLb: Math.round(cargoTargetLb),
            liveMac: lastLiveMac,
          });
          publishLiveProgress(
            'balancing',
            `Filling cargo hold · ${Math.round(cargoPlacedLb)}/${Math.round(cargoTargetLb)} lb`,
            { liveMac: lastLiveMac },
          );
          assertOfpLoadNotCancelled(mission.id);
          const catchApply = await applyPayloadRound(workingStations, total);
          assertOfpLoadNotCancelled(mission.id);
          await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
          applyResult = {
            ...applyResult,
            payload: catchApply.payload ?? applyResult.payload,
          };
          afterLive = {
            tanks: afterLive.tanks,
            stations: await readLiveStationsTrustingWrite(
              bridge,
              resolved.profile,
              workingStations,
            ),
          };
          cgRebalanceMoves += 1;
        }
      }

      const finalCg = await readLiveCgStateBestEffort(
        bridge,
        {
          readVar: resolved.profile.cg?.readVar,
          readUnit: resolved.profile.cg?.readUnit,
        },
        { liveMac: lastLiveMac, minMac: lastMinMac, maxMac: lastMaxMac },
      );
      const finalEnvelope = resolveInjectCgEnvelope({
        envelopeSource: resolved.profile.cg?.envelopeSource,
        profileMinMac: resolved.profile.cg?.constraints?.minMac,
        profileMaxMac: resolved.profile.cg?.constraints?.maxMac,
        liveMinMac: finalCg.minMac ?? lastMinMac,
        liveMaxMac: finalCg.maxMac ?? lastMaxMac,
      });
      const minMac = finalEnvelope.minMac;
      const maxMac = finalEnvelope.maxMac;
      const liveMac = finalCg.liveMac ?? lastLiveMac;
      if (
        liveMac !== undefined &&
        minMac !== undefined &&
        maxMac !== undefined
      ) {
        const lo = minMac + CG_REBALANCE_MARGIN_MAC;
        const hi = maxMac - CG_REBALANCE_MARGIN_MAC;
        const inMargin = liveMac >= lo && liveMac <= hi;
        const inAbsolute = liveMac >= minMac && liveMac <= maxMac;
        const failure = {
          var: 'CG PERCENT',
          expected: (minMac + maxMac) / 2,
          actual: liveMac,
          tolerancePct: CG_REBALANCE_MARGIN_MAC,
        };
        if (inMargin) {
          applyResult = { ...applyResult, cg: { ok: true, failures: [] } };
        } else if (inAbsolute || preferSeatFill || cgPolicy !== 'strict') {
          // Inside tablet envelope (or soft/GA): keep injected load — margin is advisory.
          softCgWarn = true;
          applyResult = {
            ...applyResult,
            cg: { ok: true, failures: [failure] },
          };
        } else {
          applyResult = {
            ...applyResult,
            cg: { ok: false, failures: [failure] },
          };
        }
      }
    }

    } // end classic multi-round fuel + payload (!pmdgCdu)

    const writtenFuelTanks = {
      ...(fuelUiTanks ?? built.plan.fuel?.tanks ?? afterLive.tanks),
    };
    let liveTanksAfterPayload = writtenFuelTanks;
    try {
      liveTanksAfterPayload = await readLiveTanks(bridge, resolved.profile);
    } catch {
      /* payload-style: ghost/failed tank read keeps the write */
    }
    afterLive = {
      tanks: writtenFuelTanks,
      stations: pmdgCduPayload
        ? await readLiveStations(bridge, resolved.profile)
        : await readLiveStationsTrustingWrite(
            bridge,
            resolved.profile,
            workingStations,
          ),
    };
    // Hold the fuel write on the card (same as stations). Do not paint a dump
    // from SimConnect while cargo was just applied.
    paintFuelUiFromWriteTarget(writtenFuelTanks);

    // ATR (and similar) can dump mains while payload stations are written.
    // Re-apply OFP tanks once so the sim matches what the card already shows.
    {
      const restoreTanks = built.plan.fuel?.tanks ?? writtenFuelTanks;
      const liveFuelAfterPayloadLb = tanksToFuelLb(liveTanksAfterPayload);
      const fuelDroppedAfterPayload =
        plannedFuelLb > 0 &&
        liveFuelAfterPayloadLb <
          plannedFuelLb - Math.max(80, plannedFuelLb * 0.05);
      if (!restoreFuelOnRollback && restoreTanks && fuelDroppedAfterPayload) {
        publishLiveProgress(
          'injecting',
          'Payload moved fuel — restoring OFP tanks…',
        );
        const fuelApply = await applyFuelRound(restoreTanks, {
          omitFuelTankWrites: idleOuterFuelTankIds(
            liveTanksAfterPayload,
            restoreTanks,
          ),
        });
        applyResult = {
          ...(applyResult ?? {}),
          fuel: fuelApply.fuel ?? applyResult?.fuel,
        };
        paintFuelUiFromWriteTarget(restoreTanks);
        await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
        afterLive = {
          tanks: restoreTanks,
          stations: afterLive.stations,
        };
        publishLiveProgress(
          'injecting',
          `Fuel restored · ${Math.round(lastGoodFuelLb ?? 0)} lb`,
        );
      }
    }

    // Station SimVars can under-read on Accu-Sim while the tablet LVars hold the load.
    // Prefer a2a-lvars (same reader as Watch/Preflight); only then fall back to
    // classic stations + mass-balance trust for non-Accu-Sim airframes.
    // PMDG CDU path: Due = OFP cargo+crew — not the station-capacity-clamped plan.total.
    const plannedPayloadSumLb = pmdgCduPayload
      ? plannedPayloadLb
      : built.plan.payload?.total ??
        sumRecord(built.plan.payload?.stations) ??
        plannedPayloadLb;
    const workingSumLb = sumRecord(workingStations);
    const preferA2aVerify =
      ofp.liveSources?.payload?.includes('a2a-lvars') === true ||
      resolved.profile.payload.strategy === 'lvar-bridge';
    let classicPayloadLb = workingSumLb;
    let massBalanceLb: number | undefined;
    try {
      const livePayload = await readLivePayloadTotalLb(
        bridge,
        resolved.profile,
        afterLive.stations,
      );
      classicPayloadLb = livePayload.payloadLb;
      massBalanceLb = livePayload.massBalanceLb;
    } catch (err) {
      if (!simIpcSessionDied(err)) throw err;
    }

    // PMDG CDU: prefer ZFW LVar / baggage sum over classic "station write stuck".
    if (
      pmdgCduPayload &&
      applyResult?.payload?.success &&
      pmdgCduZfwTargetLb !== undefined
    ) {
      let liveZfw: number | undefined;
      try {
        const z = await bridge.readLVar('ZFW_Lvar');
        if (Number.isFinite(z) && z >= 20_000 && z <= 200_000) liveZfw = z;
        else if (Number.isFinite(z) && z >= 50 && z < 500) liveZfw = z * 1000;
      } catch {
        /* optional */
      }
      const liveCargoLb = built.baggageStations.reduce((sum, idx) => {
        const v = afterLive.stations[idx];
        return sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
      const requestedCargo = built.requestedCargoLb ?? built.cargoLb;
      const zfwTol = Math.max(500, pmdgCduZfwTargetLb * 0.01);
      const cargoTol = Math.max(400, requestedCargo * 0.08);
      const zfwOk =
        liveZfw !== undefined &&
        Math.abs(liveZfw - pmdgCduZfwTargetLb) <= zfwTol;
      const cargoOk = Math.abs(liveCargoLb - requestedCargo) <= cargoTol;
      watchDebugLog('inject', 'pmdg-cdu verify', {
        zfwTarget: Math.round(pmdgCduZfwTargetLb),
        liveZfw: liveZfw !== undefined ? Math.round(liveZfw) : null,
        zfwOk,
        liveCargoLb: Math.round(liveCargoLb),
        requestedCargo: Math.round(requestedCargo),
        cargoOk,
        classicPayloadLb: Math.round(classicPayloadLb),
      });
      if (!zfwOk && !cargoOk) {
        applyResult = {
          ...applyResult,
          payload: {
            success: false,
            strategyUsed: 'pmdg-cdu',
            fallbackUsed: false,
            durationMs: applyResult.payload?.durationMs ?? 0,
            errorCode: 'PAYLOAD_VERIFY_FAILED',
            details: {
              message: `CDU ZFW/cargo not confirmed (ZFW live=${liveZfw?.toFixed(0) ?? '?'} target=${pmdgCduZfwTargetLb.toFixed(0)}; cargo live=${liveCargoLb.toFixed(0)} OFP=${requestedCargo.toFixed(0)})`,
            },
          },
        };
      } else {
        // Prefer OFP Due for UI when ZFW/cargo confirm — classic stations can lag.
        classicPayloadLb = plannedPayloadLb;
      }
    }

    const stationSumLb = sumRecord(afterLive.stations);
    let a2aPayloadLb: number | undefined;
    let a2aStations: Record<number, number> | undefined;
    if (preferA2aVerify) {
      try {
        await bridge.delay(400);
        const density = resolveFuelDensityLbPerGal(
          resolved.profile,
          fuelLbPerGal,
        );
        const a2a = await readA2aAccusimLvars(bridge, density, {
          keepStationIndexes: resolved.profile.payload.stations.map(
            (s) => s.index,
          ),
        });
        if (typeof a2a.payloadLb === 'number' && Number.isFinite(a2a.payloadLb)) {
          a2aPayloadLb = a2a.payloadLb;
          a2aStations = a2a.stations;
        }
      } catch (err) {
        if (!simIpcSessionDied(err)) throw err;
      }
    }
    const resolvedLive = resolvePostInjectPayloadLive({
      plannedLb: plannedPayloadSumLb,
      workingLb: workingSumLb,
      classicLb: classicPayloadLb,
      massBalanceLb,
      a2aLb: a2aPayloadLb,
    });
    let livePayloadSumLb = resolvedLive.liveLb;
    if (resolvedLive.source === 'a2a' && a2aStations) {
      afterLive = { ...afterLive, stations: { ...a2aStations } };
      watchDebugLog('inject', 'verify via a2a-lvars', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        plannedPayloadSumLb: Math.round(plannedPayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        classicLb: Math.round(classicPayloadLb),
        massBalanceLb:
          massBalanceLb !== undefined ? Math.round(massBalanceLb) : null,
        live: stationsSnapshot(afterLive.stations),
      });
    } else if (resolvedLive.paintWorking) {
      watchDebugLog('inject', 'trust working (mass-balance confirms)', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        massBalanceLb:
          massBalanceLb !== undefined ? Math.round(massBalanceLb) : null,
        stationSumLb: Math.round(stationSumLb),
      });
      afterLive = { ...afterLive, stations: { ...workingStations } };
    } else if (resolvedLive.source === 'working-plan') {
      watchDebugLog('inject', 'refuse trust working (mass under-read)', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        massBalanceLb:
          massBalanceLb !== undefined ? Math.round(massBalanceLb) : null,
        stationSumLb: Math.round(stationSumLb),
        live: stationsSnapshot(afterLive.stations),
      });
    }

    // Classic path only: PMDG CDU never wrote stations — don't treat under-read as ignore.
    const payloadInjectStuck =
      !pmdgCduPayload &&
      applySucceeded(applyResult) &&
      resolvedLive.stuck;
    if (payloadInjectStuck && applyResult) {
      watchDebugLog('inject', 'payload stuck vs plan', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        plannedPayloadSumLb: Math.round(plannedPayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        source: resolvedLive.source,
        live: stationsSnapshot(afterLive.stations),
        working: stationsSnapshot(workingStations),
      });
      applyResult = {
        ...applyResult,
        payload: {
          success: false,
          strategyUsed: applyResult.payload?.strategyUsed ?? 'station-writeback',
          fallbackUsed: false,
          durationMs: applyResult.payload?.durationMs ?? 0,
          errorCode: 'PAYLOAD_NOT_APPLIED',
          details: {
            message: `Live payload ${livePayloadSumLb.toFixed(0)} lb still far below planned ${plannedPayloadSumLb.toFixed(0)} lb — aircraft ignored station writes`,
          },
        },
      };
    }

    publishLiveProgress(
      applySucceeded(applyResult) ? 'verifying' : 'failed',
      applySucceeded(applyResult)
        ? 'Verifying injected load against OFP…'
        : 'Inject apply failed — checking rollback…',
      { liveMac: lastLiveMac },
    );

    if (!applySucceeded(applyResult)) {
      // Never wipe a load that Accu-Sim / mass-balance still shows as present.
      // Accu-Sim: only the tablet LVar sum may clear PAYLOAD_NOT_APPLIED — the
      // in-memory working plan alone must not fake success when Character* stayed empty.
      let stillLoaded = false;
      if (preferA2aVerify) {
        stillLoaded =
          a2aPayloadLb !== undefined &&
          a2aPayloadLb >= Math.max(100, plannedPayloadSumLb * 0.45);
        if (!stillLoaded) {
          try {
            await bridge.delay(250);
            const density = resolveFuelDensityLbPerGal(
              resolved.profile,
              fuelLbPerGal,
            );
            const a2a = await readA2aAccusimLvars(bridge, density, {
              keepStationIndexes: resolved.profile.payload.stations.map(
                (s) => s.index,
              ),
            });
            if (
              typeof a2a.payloadLb === 'number' &&
              a2a.payloadLb >= Math.max(100, plannedPayloadSumLb * 0.45)
            ) {
              stillLoaded = true;
              livePayloadSumLb = a2a.payloadLb;
              afterLive = { ...afterLive, stations: { ...a2a.stations } };
            }
          } catch (err) {
            if (!simIpcSessionDied(err)) throw err;
          }
        }
      } else {
        try {
          const livePayload = await readLivePayloadTotalLb(
            bridge,
            resolved.profile,
          );
          stillLoaded =
            livePayload.payloadLb >= Math.max(100, plannedPayloadSumLb * 0.45) ||
            workingSumLb >= plannedPayloadSumLb * 0.45;
        } catch (err) {
          if (!simIpcSessionDied(err)) throw err;
          stillLoaded = workingSumLb >= plannedPayloadSumLb * 0.45;
        }
      }
      if (
        applyResult.payload?.errorCode === 'PAYLOAD_NOT_APPLIED' &&
        stillLoaded
      ) {
        applyResult = {
          ...applyResult,
          payload: {
            ...applyResult.payload,
            success: true,
            errorCode: undefined,
            details: {
              message: preferA2aVerify
                ? 'Accu-Sim tablet confirmed injected load'
                : 'Station SimVars under-read; kept injected load (mass-balance / plan trust)',
            },
          },
        };
      }
    }

    if (!applySucceeded(applyResult)) {
      // PMDG CDU never wrote classic stations — rolling them back is useless and
      // often reports ROLLBACK INCOMPLETE while the CDU load is already set.
      const skipPayloadRollback =
        pmdgCduPayload &&
        (!applyResult?.fuel || applyResult.fuel.success === true);
      if (skipPayloadRollback && !restoreFuelOnRollback) {
        rolledBack = false;
        rollbackOk = null;
      } else {
        rolledBack = true;
        const restore = await engine.applyLoadPlan(
          rollbackRequest(
            rollbackPlan,
            restoreFuelOnRollback,
          ),
        );
        rollbackOk = applySucceeded({
          fuel: restore.fuel,
          payload: skipPayloadRollback ? { success: true } : restore.payload,
        });
      }
      try {
        afterLive = {
          tanks: await readLiveTanks(bridge, resolved.profile),
          stations: await readLiveStations(bridge, resolved.profile),
        };
      } catch (err) {
        if (!simIpcSessionDied(err)) throw err;
      }
      const parts: string[] = [];
      if (applyResult.fuel && !applyResult.fuel.success) {
        parts.push(`fuel ${applyResult.fuel.errorCode ?? 'failed'}`);
      }
      if (applyResult.payload && !applyResult.payload.success) {
        const detail =
          applyResult.payload.details &&
          typeof applyResult.payload.details === 'object' &&
          'message' in applyResult.payload.details
            ? String((applyResult.payload.details as { message?: unknown }).message ?? '')
            : '';
        parts.push(
          detail
            ? `payload ${applyResult.payload.errorCode ?? 'failed'}: ${detail}`
            : `payload ${applyResult.payload.errorCode ?? 'failed'}`,
        );
      }
      if (applyResult.cg && !applyResult.cg.ok) {
        const failure = applyResult.cg.failures[0];
        const limits = resolved.profile.cg?.constraints;
        const margin = failure?.tolerancePct ?? CG_REBALANCE_MARGIN_MAC;
        const minMac = lastMinMac ?? limits?.minMac;
        const maxMac = lastMaxMac ?? limits?.maxMac;
        const lo =
          minMac === undefined ? undefined : minMac + margin;
        const hi =
          maxMac === undefined ? undefined : maxMac - margin;
        parts.push(
          failure && lo !== undefined && hi !== undefined
            ? `CG ${failure.actual.toFixed(1)}% outside ${lo.toFixed(1)}–${hi.toFixed(1)}% effective envelope (${minMac!.toFixed(1)}–${maxMac!.toFixed(1)}% tablet ±${margin}% margin)`
            : failure
              ? `CG ${failure.actual.toFixed(1)}% out of envelope`
              : 'CG out of envelope',
        );
      }
      error = formatPipeError(
        `Apply failed (${parts.join(', ') || 'unknown'})`,
      );
      if (skipPayloadRollback && !restoreFuelOnRollback) {
        error += ' — check CDU/EFB load manually (no classic station rollback)';
      } else if (rollbackOk === false) {
        error += ' — ROLLBACK INCOMPLETE, check aircraft load manually';
      } else {
        error += restoreFuelOnRollback
          ? ' — restored previous load'
          : ' — restored previous payload (fuel left as-is)';
      }
    } else {
      // Fuel/payload writes already succeeded (UI Sim=Due). compareOnce +
      // runMissionPreflight open another pipe full of CG PERCENT / station
      // reads — after a few reinjects SimConnect times out 15s each and the
      // POST freezes on "Verifying load after N CG shift(s)…". Watch owns
      // Loaded vs Due after HTTP returns.
      compareVerdict = 'warn';
      compareSummary =
        cgRebalanceMoves > 0
          ? `Inject applied after ${cgRebalanceMoves} CG shift(s)`
          : 'Inject applied';
      if (softCgWarn && applyResult.cg?.failures[0]) {
        const failure = applyResult.cg.failures[0];
        compareSummary =
          `${compareSummary}\n  [warn] CG_SOFT: live ${failure.actual.toFixed(1)}% MAC outside provisional envelope (apply kept)`;
      }
      watchDebugLog('inject', 'skip sync verify/preflight', {
        missionId: mission.id,
        cgRebalanceMoves,
      });
    }

    if (error) {
      setOfpLoadProgress(mission.id, {
        phase: 'failed',
        message: error,
        cgAttempt: cgRebalanceMoves || undefined,
        cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
      });
    } else {
      setOfpLoadProgress(mission.id, {
        phase: 'done',
        message:
          cgRebalanceMoves > 0
            ? `Load applied after ${cgRebalanceMoves} CG rebalance pass(es).`
            : 'Load applied.',
        cgAttempt: cgRebalanceMoves || undefined,
        cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
      });
    }

    watchDebugLog('inject', 'end', {
      ok: !error,
      error,
      cgRebalanceMoves,
      compareVerdict,
      fuelOk: applyResult?.fuel?.success ?? null,
      payloadOk: applyResult?.payload?.success ?? null,
      payloadError: applyResult?.payload?.errorCode ?? null,
      afterStations: stationsSnapshot(afterLive.stations),
      afterFuelTanks: afterLive.tanks,
      rolledBack,
      rollbackOk,
    });

    return {
      ok: !error,
      plan: built,
      identity,
      profileKey,
      profilePath,
      fingerprint,
      before: beforeLive,
      apply: applyResult,
      after: afterLive,
      rolledBack,
      rollbackOk,
      compareSummary,
      compareVerdict,
      preflight,
      error,
      cgRebalanceMoves,
      ballastLb: ballastPlacedLb,
      displayCg: {
        liveMac: lastLiveMac,
        ...resolveInjectCgEnvelope({
          envelopeSource: resolved.profile.cg?.envelopeSource,
          profileMinMac: resolved.profile.cg?.constraints?.minMac,
          profileMaxMac: resolved.profile.cg?.constraints?.maxMac,
          liveMinMac: lastMinMac,
          liveMaxMac: lastMaxMac,
        }),
      },
    };
  } catch (err) {
    if (err instanceof OfpLoadCancelledError) {
      error = 'Inject cancelled';
      watchDebugLog('inject', 'cancelled', {
        missionId: mission.id,
        cgRebalanceMoves,
      });
      setOfpLoadProgress(mission.id, {
        phase: 'failed',
        message: 'Inject cancelled',
        cgAttempt: cgRebalanceMoves || undefined,
        cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
      });
      if (!built) {
        built = {
          plan: {} as LoadPlanRequest,
          blockFuelLb: 0,
          cargoLb: 0,
          fuelUnit: 'gallons',
          tankCapacityTotal: 0,
          baggageCapacityLb: 0,
          preservedStations: [],
          baggageStations: [],
          crewStations: [],
          passengerStations: [],
          seatStations: [],
          movableStations: [],
        };
      }
      if (engine && rollbackPlan) {
        try {
          const restore = await engine.applyLoadPlan(
            rollbackRequest(rollbackPlan, restoreFuelOnRollback),
          );
          rolledBack = true;
          rollbackOk = applySucceeded({
            fuel: restore.fuel,
            payload: restore.payload,
          });
        } catch {
          rolledBack = true;
          rollbackOk = false;
        }
      }
      return {
        ok: false,
        plan: built,
        identity,
        profileKey,
        profilePath,
        fingerprint,
        before: beforeLive,
        apply: applyResult ?? {},
        after: afterLive,
        rolledBack,
        rollbackOk,
        compareSummary,
        compareVerdict,
        preflight,
        error,
        cgRebalanceMoves,
        ballastLb: ballastPlacedLb,
      };
    }
    if (err instanceof OfpLoadTimedOutError) {
      error = err.message;
      watchDebugLog('inject', 'timed out', {
        missionId: mission.id,
        elapsedMs: Date.now() - injectStartedAtMs,
        error,
        cgRebalanceMoves,
      });
      setOfpLoadProgress(mission.id, {
        phase: 'failed',
        message: error,
      });
      if (!built) {
        built = {
          plan: {} as LoadPlanRequest,
          blockFuelLb: 0,
          cargoLb: 0,
          fuelUnit: 'gallons',
          tankCapacityTotal: 0,
          baggageCapacityLb: 0,
          preservedStations: [],
          baggageStations: [],
          crewStations: [],
          passengerStations: [],
          seatStations: [],
          movableStations: [],
        };
      }
      return {
        ok: false,
        plan: built,
        identity,
        profileKey,
        profilePath,
        fingerprint,
        before: beforeLive,
        apply: applyResult ?? {},
        after: afterLive,
        rolledBack,
        rollbackOk,
        compareSummary,
        compareVerdict,
        preflight,
        error,
        cgRebalanceMoves,
        ballastLb: ballastPlacedLb,
      };
    }
    error = formatPipeError(
      err instanceof Error ? err.message : String(err),
    );
    watchDebugLog('inject', 'throw', {
      missionId: mission.id,
      error,
      pipeDisconnect: isPipeDisconnectError(err),
      cgRebalanceMoves,
      afterStations: stationsSnapshot(afterLive.stations),
    });
    setOfpLoadProgress(mission.id, {
      phase: 'failed',
      message: error,
    });
    if (!built) {
      // Minimal empty plan so callers still get a structured error.
      built = {
        plan: {} as LoadPlanRequest,
        blockFuelLb: 0,
        cargoLb: 0,
        fuelUnit: 'gallons',
        tankCapacityTotal: 0,
        baggageCapacityLb: 0,
        preservedStations: [],
        baggageStations: [],
        crewStations: [],
        passengerStations: [],
        seatStations: [],
        movableStations: [],
      };
    }
    return {
      ok: false,
      plan: built,
      identity,
      profileKey,
      profilePath,
      fingerprint,
      before: beforeLive,
      apply: applyResult ?? {},
      after: afterLive,
      rolledBack,
      rollbackOk,
      compareSummary,
      compareVerdict,
      preflight,
      error,
      cgRebalanceMoves,
      ballastLb: ballastPlacedLb,
    };
  } finally {
    releaseSimBridgeGateOnce();
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
  } finally {
    endOfpLoadActive();
  }
}
