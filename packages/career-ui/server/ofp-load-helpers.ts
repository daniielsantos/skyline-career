/**
 * Apply confirmed SimBrief OFP fuel/payload into the live aircraft.
 * Mirrors preflight-helpers: short-lived NamedPipeSimBridge + resolveLiveAircraft.
 */
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  assertRolesPackAllowsDirectInjection,
  careerFuelMatchOk,
  flightPhaseFromSample,
  normalizeAircraftTitle,
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
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { compareOnce, formatComplianceSummary } from '../../agent/src/ofp-compliance/run-compare.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import {
  OfpLoadPlanError,
  allocateCargoRoundPerSeat,
  buildOfpLoadPlan,
  buildRollbackPlan,
  CG_BALANCE_STEP_LB,
  cgCounterweightPerSeatLb,
  equalizeMovableStations,
  equalizeLateralStationPairs,
  fuelTankTargetsForRound,
  FUEL_INJECT_ROUNDS,
  absorbFuelResidualFloors,
  liveFuelMatchesTarget,
  FREIGHTER_PILOT_LB,
  GA_BAGGAGE_SOFT_MAX_LB,
  resolveCgCounterweightBias,
  seatSoftMaxLb,
  shiftCargoForCg,
  type BuiltOfpLoadPlan,
} from '../../agent/src/ofp-load-plan.ts';
import { readLiveCgState } from '../../agent/src/live-cg.ts';
import { ProfileCache } from '../../agent/src/profile-cache.ts';
import {
  defaultCacheDir,
  defaultProfileDirs,
  loadProfilesFromDirs,
} from '../../agent/src/profile-registry.ts';
import { resolveLiveAircraft } from '../../agent/src/resolve-live.ts';
import { runMissionPreflight, type MissionPreflightResult } from './preflight-helpers.ts';
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
/** Settle after payload writes before trusting live CG (MSFS lag). */
const PAYLOAD_CG_SETTLE_MS = 900;
/** Settle between staged fuel inject rounds (shorter than payload CG settle). */
const FUEL_ROUND_SETTLE_MS = 450;
/** Gap between station/fuel SimVar writes during inject (Host pipe stability). */
const INJECT_WRITE_GAP_MS = 50;

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

async function readLiveTanks(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
): Promise<Record<string, number>> {
  const tanks: Record<string, number> = {};
  for (const tank of profile.fuel.tanks) {
    try {
      tanks[tank.id] = await bridge.readSimVar({
        name: tank.readVar,
        unit: tank.readUnit || profile.fuel.unit || 'gallons',
      });
    } catch {
      tanks[tank.id] = 0;
    }
  }
  return tanks;
}

/**
 * After a fuel write, AUX/TIP SimVars often read 0 for a beat while mains already
 * show the new quantity (Learjet → Sim 2508 = L+R only, tips flash empty).
 * Prefer the written target when live collapsed relative to what we just applied.
 */
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
): Promise<Record<number, number>> {
  const stations: Record<number, number> = {};
  for (const station of profile.payload.stations) {
    const name = station.readVar ?? `PAYLOAD STATION WEIGHT:${station.index}`;
    try {
      stations[station.index] = await bridge.readSimVar({
        name,
        unit: 'pounds',
      });
    } catch {
      stations[station.index] = 0;
    }
  }
  return stations;
}

/** Station sum, or gross−empty−fuel when station SimVars under-read (Accu-Sim). */
async function readLivePayloadTotalLb(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  stations?: Record<number, number>,
): Promise<number> {
  const liveStations = stations ?? (await readLiveStations(bridge, profile));
  const stationSum = sumRecord(liveStations);
  let massBalanceLb: number | undefined;
  try {
    const empty = await bridge.readSimVar({ name: 'EMPTY WEIGHT', unit: 'pounds' });
    const gross = await bridge.readSimVar({ name: 'TOTAL WEIGHT', unit: 'pounds' });
    let fuelLb: number;
    try {
      fuelLb = await bridge.readSimVar({
        name: 'FUEL TOTAL QUANTITY WEIGHT',
        unit: 'pounds',
      });
    } catch {
      const gal = await bridge.readSimVar({
        name: 'FUEL TOTAL QUANTITY',
        unit: 'gallons',
      });
      const dens = await bridge.readSimVar({
        name: 'FUEL WEIGHT PER GALLON',
        unit: 'pounds',
      });
      fuelLb = gal * dens;
    }
    if (
      Number.isFinite(empty) &&
      Number.isFinite(gross) &&
      Number.isFinite(fuelLb) &&
      empty > 0 &&
      gross > empty
    ) {
      massBalanceLb = Math.max(0, gross - empty - Math.max(0, fuelLb));
    }
  } catch {
    /* keep station sum */
  }
  const resolved = resolveLivePayloadLb({
    stationSumLb: stationSum,
    massBalanceLb,
  });
  return resolved.payloadLb ?? stationSum;
}

async function readFuelLbPerGal(bridge: NamedPipeSimBridge): Promise<number | undefined> {
  try {
    const dens = await bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
    return Number.isFinite(dens) && dens > 4 && dens < 9 ? dens : undefined;
  } catch {
    return undefined;
  }
}

async function readLiveWeightLimits(bridge: NamedPipeSimBridge): Promise<{
  emptyWeightLb?: number;
  maxGrossWeightLb?: number;
}> {
  const out: { emptyWeightLb?: number; maxGrossWeightLb?: number } = {};
  try {
    const empty = await bridge.readSimVar({ name: 'EMPTY WEIGHT', unit: 'pounds' });
    if (Number.isFinite(empty) && empty > 0) out.emptyWeightLb = empty;
  } catch {
    /* optional */
  }
  try {
    const mtow = await bridge.readSimVar({ name: 'MAX GROSS WEIGHT', unit: 'pounds' });
    if (Number.isFinite(mtow) && mtow > 0) out.maxGrossWeightLb = mtow;
  } catch {
    /* optional */
  }
  return out;
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
    const status: SimBridgeStatusPayload = {
      connected: Boolean(ping.connected ?? true),
      mode: ping.mode ?? null,
      aircraftTitle,
      onGround: snap.onGround,
      enginesRunning: snap.enginesRunning,
      parkingBrake: snap.parkingBrake ?? null,
      phase: phaseFromFlags(
        snap.onGround,
        snap.enginesRunning,
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
  beginOfpLoadActive();
  watchDebugLog('inject', 'begin', {
    missionId: mission.id,
    staticId: mission.staticId,
    writeGapMs: INJECT_WRITE_GAP_MS,
  });
  try {
  setOfpLoadProgress(mission.id, {
    phase: 'planning',
    message: 'Building fuel and payload plan from OFP…',
  });

  const username = opts.username?.trim() || process.env.SIMBRIEF_USERNAME?.trim();
  const userid = opts.userid?.trim() || process.env.SIMBRIEF_USERID?.trim();
  if (!username && !userid) {
    clearOfpLoadProgress(mission.id);
    throw new Error(
      'SimBrief username required — set it in Settings or SIMBRIEF_USERNAME env',
    );
  }

  const { expectation } = await fetchSimBriefLatestOfp({
    username,
    userid,
    staticId: mission.staticId,
  });

  let ofp = applyTargetBlockFuelKg(expectation, opts.targetBlockFuelKg);
  let stationRoles = ofp.payload?.stationRoles;

  const bridge = new NamedPipeSimBridge({
    ...(opts.pipeName ? { pipeName: opts.pipeName } : {}),
    // Multi-step inject can exceed the default 10s IPC budget on slow SimConnect.
    requestTimeoutMs: 60_000,
    connectTimeoutMs: 10_000,
  });

  // Hold the exclusive gate for the whole write session so probe/preflight/Watch
  // reopen cannot open a second pipe client mid-inject (0xC00000B0).
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
  let engine: DefaultProfileEngine | null = null;
  let rollbackPlan: LoadPlanRequest | null = null;
  /** True only when we attempted a fuel write that did not succeed (needs undo). */
  let restoreFuelOnRollback = false;

  try {
    assertOfpLoadNotCancelled(mission.id);
    await bridge.open('Skyline Career UI OFP Load');

    assertOfpLoadNotCancelled(mission.id);
    const localCatalog = await loadProfilesFromDirs(defaultProfileDirs(repoRoot));
    const cache = new ProfileCache(defaultCacheDir(repoRoot));
    const resolved = await resolveLiveAircraft({
      bridge,
      localCatalog,
      cache,
      catalogUrl: opts.catalogUrl,
    });

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

    const snap = await bridge.snapshot();
    beforeLive = {
      tanks: await readLiveTanks(bridge, resolved.profile),
      stations: await readLiveStations(bridge, resolved.profile),
      onGround: snap.onGround,
      enginesRunning: snap.enginesRunning,
    };

    const fuelLbPerGal = await readFuelLbPerGal(bridge);
    const weightLimits = await readLiveWeightLimits(bridge);

    try {
      built = buildOfpLoadPlan({
        ofp,
        profile: resolved.profile,
        stationRoles,
        liveStationsLb: beforeLive.stations,
        fuelLbPerGal,
        cargoKgFallback: mission.cargoKg,
        emptyWeightLb: weightLimits.emptyWeightLb,
        maxGrossWeightLb: weightLimits.maxGrossWeightLb,
      });
    } catch (planError) {
      if (planError instanceof OfpLoadPlanError) {
        throw new Error(`${planError.code}: ${planError.message}`);
      }
      throw planError;
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
    const plannedPayloadLb =
      built.plan.payload?.total ??
      sumRecord(built.plan.payload?.stations) ??
      built.cargoLb + built.crewStations.length * FREIGHTER_PILOT_LB;

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
    for (const idx of seatStations) {
      seatSoftMaxByIndex[idx] = seatSoftMaxLb(resolved.profile, idx);
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

    const publishLiveProgress = (
      phase: OfpLoadProgressPhase,
      message: string,
      extra?: { cgAttempt?: number; liveMac?: number },
    ) => {
      const liveStationSum = sumRecord(afterLive.stations);
      const workingSum = sumRecord(workingStations);
      const stationsForUi =
        liveStationSum >= workingSum * 0.5
          ? { ...afterLive.stations }
          : { ...workingStations };
      const rawFuelLb = tanksToFuelLb(afterLive.tanks);
      const rawTanks = schematicTanksFromProfile(afterLive.tanks);
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
        liveMac: extra?.liveMac,
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
    let cargoTargetLb = built.cargoLb;
    const seatCount = preferSeatFill
      ? Math.max(1, seatStations.length)
      : Math.max(1, baggageStations.length || built.movableStations.length);
    let bias: 'equal' | 'forward' | 'aft' = 'equal';
    let softCgWarn = false;
    let lastLiveMac: number | undefined;
    let prevLiveMac: number | undefined;
    let lastMinMac: number | undefined;
    let lastMaxMac: number | undefined;
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
      try {
        await bridge.close({ disconnectHost: false });
      } catch {
        /* ignore */
      }
      await bridge.open('Skyline Career UI OFP Load');
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

    const applyFuelRound = async (tanks: Record<string, number>) => {
      const t0 = Date.now();
      const fuel = { ...built.plan.fuel!, tanks };
      try {
        const result = await engine!.applyLoadPlan({
          fuel,
          cgPolicy: 'none',
          skipVerify: true,
          writeGapMs: INJECT_WRITE_GAP_MS,
        });
        watchDebugLog('inject', 'fuel round ok', {
          ms: Date.now() - t0,
          success: result.fuel?.success ?? null,
          errorCode: result.fuel?.errorCode ?? null,
          tanks: Object.fromEntries(
            Object.entries(tanks).map(([k, v]) => [k, Math.round(v * 10) / 10]),
          ),
        });
        return result;
      } catch (err) {
        watchDebugLog('inject', 'fuel round throw', {
          ms: Date.now() - t0,
          pipeDisconnect: isPipeDisconnectError(err),
          error: err instanceof Error ? err.message : String(err),
        });
        if (!isPipeDisconnectError(err)) throw err;
        await reconnectBridge();
        watchDebugLog('inject', 'fuel round retry after reconnect', {});
        const result = await engine!.applyLoadPlan({
          fuel,
          cgPolicy: 'none',
          skipVerify: true,
          writeGapMs: INJECT_WRITE_GAP_MS,
        });
        watchDebugLog('inject', 'fuel round retry result', {
          success: result.fuel?.success ?? null,
          errorCode: result.fuel?.errorCode ?? null,
        });
        return result;
      }
    };

    assertOfpLoadNotCancelled(mission.id);
    const mxNote = opts.mxFuelBurnNote?.trim();
    const withMxNote = (message: string) =>
      mxNote && message.startsWith('Injecting OFP fuel')
        ? `${message} · ${mxNote}`
        : message;
    publishLiveProgress(
      'injecting',
      fuelAlreadyOk
        ? `Fuel OK — loading payload +${CG_BALANCE_STEP_LB} lb/seat across ${seatCount} seats…`
        : withMxNote(`Injecting OFP fuel (1/${FUEL_INJECT_ROUNDS})…`),
    );

    if (!fuelAlreadyOk && built.plan.fuel) {
      if (beforeLive.enginesRunning) {
        throw new Error(
          'Shut down engines before fuel inject — MSFS will not drain AUX/tip tanks with engines running',
        );
      }
      const startTanks = { ...beforeLive.tanks };
      let endTanks = built.plan.fuel.tanks ?? {};
      restoreFuelOnRollback = false;
      for (let round = 1; round <= FUEL_INJECT_ROUNDS; round++) {
        assertOfpLoadNotCancelled(mission.id);
        const tanks = fuelTankTargetsForRound(
          startTanks,
          endTanks,
          round,
          FUEL_INJECT_ROUNDS,
        );
        publishLiveProgress(
          'injecting',
          withMxNote(`Injecting OFP fuel (${round}/${FUEL_INJECT_ROUNDS})…`),
        );
        const fuelApply = await applyFuelRound(tanks);
        applyResult = {
          ...(applyResult ?? {}),
          fuel: fuelApply.fuel ?? applyResult?.fuel,
        };
        if (fuelApply.fuel && !fuelApply.fuel.success) {
          restoreFuelOnRollback = true;
          break;
        }
        const settleMs =
          round < FUEL_INJECT_ROUNDS
            ? FUEL_ROUND_SETTLE_MS
            : PAYLOAD_CG_SETTLE_MS;
        await delayCancellable(mission.id, settleMs);
        const liveTanks = await readLiveTanks(bridge, resolved.profile);
        afterLive = {
          tanks: preferWrittenFuelTanks(liveTanks, tanks),
          stations: afterLive.stations,
        };
        // Seed sticky schematic from the write we just applied so tip holds work
        // even if beforeLive started with AUX already glitched to 0.
        lastGoodSchematicTanks =
          pickFuelTankBreakdown(
            schematicTanksFromProfile(afterLive.tanks),
            lastGoodSchematicTanks,
            tanksToFuelLb(afterLive.tanks),
          ) ?? schematicTanksFromProfile(tanks);
        lastGoodFuelLb = tanksToFuelLb(afterLive.tanks);
        publishLiveProgress(
          'injecting',
          `Fuel ${round}/${FUEL_INJECT_ROUNDS} · ${Math.round(tanksToFuelLb(afterLive.tanks))} lb live`,
        );
      }
      // Accept MSFS unusable floors on drained tanks (King Air tip/AUX residual).
      if (!restoreFuelOnRollback) {
        const liveAfter = await readLiveTanks(bridge, resolved.profile);
        const absorbed = absorbFuelResidualFloors(endTanks, liveAfter);
        if (absorbed.added > 0.05) {
          endTanks = absorbed.tanks;
          built.plan.fuel = { ...built.plan.fuel!, tanks: endTanks };
          const addedLb = tanksToFuelLb(absorbed.tanks) - tanksToFuelLb(plannedTanks);
          if (addedLb > 0.5) {
            plannedFuelLb = built.blockFuelLb + addedLb;
          }
          watchDebugLog('inject', 'absorbed fuel residual floors', {
            addedQty: Math.round(absorbed.added * 100) / 100,
            addedLb: Math.round(addedLb),
            tanks: Object.fromEntries(
              Object.entries(endTanks).map(([k, v]) => [
                k,
                Math.round(v * 10) / 10,
              ]),
            ),
          });
          publishLiveProgress(
            'injecting',
            `Fuel residual floors accepted · ${Math.round(tanksToFuelLb(liveAfter))} lb live`,
          );
        }
        afterLive = {
          tanks: liveAfter,
          stations: afterLive.stations,
        };
      }
      if (!applyResult) applyResult = {};
    } else {
      applyResult = {};
      restoreFuelOnRollback = false;
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
      await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
      afterLive = {
        tanks: afterLive.tanks,
        stations: await readLiveStations(bridge, resolved.profile),
      };
      publishLiveProgress(
        'balancing',
        `Crew seeded — placing cargo +${CG_BALANCE_STEP_LB} lb per seat…`,
      );
    }

    const fuelOk =
      fuelAlreadyOk || !applyResult.fuel || applyResult.fuel.success;
    if (fuelOk) {
      for (let i = 0; i < CG_REBALANCE_MAX_ITERATIONS; i++) {
        assertOfpLoadNotCancelled(mission.id);
        const liveCg = await readLiveCgState(bridge, {
          readVar: resolved.profile.cg?.readVar,
          readUnit: resolved.profile.cg?.readUnit,
        });
        const minMac =
          liveCg.minMac ?? resolved.profile.cg?.constraints?.minMac;
        const maxMac =
          liveCg.maxMac ?? resolved.profile.cg?.constraints?.maxMac;
        const liveMac = liveCg.liveMac;
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

        if (haveEnvelope) {
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

        const stillPlacing = cargoPlacedLb < cargoTargetLb - 0.5;
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

        let nextStations = workingStations;
        let movedLb = 0;
        let placeIndexes: number[] = [];
        let placeBias: 'equal' | 'forward' | 'aft' = bias;
        if (stillPlacing) {
          // Seats first (soft-capped). Baggage only when seats are full or freighter.
          let softMax: Record<number, number> | undefined;
          if (preferSeatFill && roomUnderSoftCap(seatStations)) {
            placeIndexes = seatStations;
            softMax = seatSoftMaxByIndex;
          } else if (roomOnBaggage()) {
            // Already on/aft of aft limit → more baggage would only push further aft.
            if (
              preferSeatFill &&
              haveEnvelope &&
              liveMac !== undefined &&
              hi !== undefined &&
              liveMac >= hi
            ) {
              cargoTargetLb = cargoPlacedLb;
              publishLiveProgress(
                'balancing',
                `CG at aft limit (${liveMac.toFixed(1)}% MAC) — stopping baggage add at ${cargoPlacedLb} lb`,
                { cgAttempt: i + 1, liveMac },
              );
              watchDebugLog('inject', 'balance stop', {
                round: i,
                reason: 'aft_limit',
                cargoPlacedLb: Math.round(cargoPlacedLb),
                liveMac,
              });
              break;
            }
            placeIndexes = baggageStations;
            softMax = baggageSoftMaxByIndex;
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
          placeBias =
            placeIndexes === baggageStations || !preferSeatFill ? bias : 'equal';
          const stepLb =
            placeIndexes === baggageStations
              ? Math.min(perSeatLb, GA_BAGGAGE_SOFT_MAX_LB)
              : perSeatLb;
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
          if (
            placed.movedLb <= 0 &&
            placeBias !== 'equal' &&
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
          const direction = bias === 'aft' ? 'aft' : 'forward';
          const half = Math.max(1, Math.ceil(seatCount / 2));
          const shiftBudget = perSeatLb * half;
          let shifted = shiftCargoForCg(
            workingStations,
            resolved.profile,
            seatStations.length >= 2 ? seatStations : built.movableStations,
            direction,
            shiftBudget,
            {
              minRetainByIndex,
              softMaxByIndex: seatSoftMaxByIndex,
            },
          );
          if (
            shifted.movedLb <= 0 &&
            direction === 'forward' &&
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
              },
            );
          }
          nextStations = shifted.stations;
          movedLb = shifted.movedLb;
          // Freighter (no pax seats): shift among baggage when crew seats can't move.
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
              {
                minRetainByIndex,
                softMaxByIndex: baggageSoftMaxByIndex,
              },
            );
            nextStations = shifted.stations;
            movedLb = shifted.movedLb;
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
        await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
        applyResult = {
          ...applyResult,
          payload: payloadApply.payload ?? applyResult.payload,
          cg: payloadApply.cg ?? applyResult.cg,
        };
        afterLive = {
          tanks: afterLive.tanks,
          stations: await readLiveStations(bridge, resolved.profile),
        };
        // Re-read CG after settle so the UI sees verified state for this round.
        const verifiedCg = await readLiveCgState(bridge, {
          readVar: resolved.profile.cg?.readVar,
          readUnit: resolved.profile.cg?.readUnit,
        });
        const verifiedMac = verifiedCg.liveMac ?? liveMac;
        lastLiveMac = verifiedMac;
        prevLiveMac = verifiedMac;
        const liveSum = sumRecord(afterLive.stations);
        const workSum = sumRecord(workingStations);
        const underApplied = liveSum + 75 < workSum * 0.7;
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
          working: stationsSnapshot(workingStations),
          live: stationsSnapshot(afterLive.stations),
        });

        // Ghost stations: write "succeeds" but live stays 0 — or sticks briefly then
        // drops (Learjet S17/S18). Also catch partial ghosts when only ~200 lb is
        // missing (old gate required live < 70% of working, so mild losses were ignored).
        const ghostCandidates = baggageStations.filter((idx) => {
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
          await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
          applyResult = {
            ...applyResult,
            payload: rewriteApply.payload ?? applyResult.payload,
          };
          afterLive = {
            tanks: afterLive.tanks,
            stations: await readLiveStations(bridge, resolved.profile),
          };
          watchDebugLog('inject', 'dead stations rewrite', {
            pass: ghostPrunePasses,
            writeOk: rewriteApply.payload?.success ?? null,
            live: stationsSnapshot(afterLive.stations),
            liveSum: Math.round(sumRecord(afterLive.stations)),
            workingSum: Math.round(rewriteTotal),
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

      const finalCg = await readLiveCgState(bridge, {
        readVar: resolved.profile.cg?.readVar,
        readUnit: resolved.profile.cg?.readUnit,
      });
      const minMac =
        finalCg.minMac ??
        lastMinMac ??
        resolved.profile.cg?.constraints?.minMac;
      const maxMac =
        finalCg.maxMac ??
        lastMaxMac ??
        resolved.profile.cg?.constraints?.maxMac;
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

    afterLive = {
      tanks: await readLiveTanks(bridge, resolved.profile),
      stations: await readLiveStations(bridge, resolved.profile),
    };

    // Station SimVars can under-read on Accu-Sim while gross weight shows the load.
    // Only trust in-memory workingStations when mass-balance also shows the mass
    // (ghost stations that ignore writes must NOT fake a successful inject).
    const plannedPayloadSumLb =
      built.plan.payload?.total ??
      sumRecord(built.plan.payload?.stations) ??
      plannedPayloadLb;
    const workingSumLb = sumRecord(workingStations);
    let livePayloadSumLb = await readLivePayloadTotalLb(
      bridge,
      resolved.profile,
      afterLive.stations,
    );
    const stationSumLb = sumRecord(afterLive.stations);
    let massBalanceLb: number | undefined;
    try {
      const empty = await bridge.readSimVar({ name: 'EMPTY WEIGHT', unit: 'pounds' });
      const gross = await bridge.readSimVar({ name: 'TOTAL WEIGHT', unit: 'pounds' });
      const fuelLb = await bridge.readSimVar({
        name: 'FUEL TOTAL QUANTITY WEIGHT',
        unit: 'pounds',
      });
      if (
        Number.isFinite(empty) &&
        Number.isFinite(gross) &&
        Number.isFinite(fuelLb) &&
        empty > 0 &&
        gross > empty
      ) {
        massBalanceLb = Math.max(0, gross - empty - Math.max(0, fuelLb));
      }
    } catch {
      /* optional */
    }
    const massConfirmsWorking =
      massBalanceLb !== undefined &&
      massBalanceLb + 100 >= workingSumLb * 0.7;
    if (
      livePayloadSumLb + 75 < plannedPayloadSumLb * 0.5 &&
      workingSumLb >= plannedPayloadSumLb * 0.5 &&
      massConfirmsWorking
    ) {
      watchDebugLog('inject', 'trust working (mass-balance confirms)', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        massBalanceLb: massBalanceLb !== undefined ? Math.round(massBalanceLb) : null,
        stationSumLb: Math.round(stationSumLb),
      });
      livePayloadSumLb = workingSumLb;
      afterLive = { ...afterLive, stations: { ...workingStations } };
    } else if (
      livePayloadSumLb + 75 < plannedPayloadSumLb * 0.5 &&
      workingSumLb >= plannedPayloadSumLb * 0.5
    ) {
      watchDebugLog('inject', 'refuse trust working (mass under-read)', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
        massBalanceLb: massBalanceLb !== undefined ? Math.round(massBalanceLb) : null,
        stationSumLb: Math.round(stationSumLb),
        live: stationsSnapshot(afterLive.stations),
      });
    }

    const payloadInjectStuck =
      applySucceeded(applyResult) &&
      plannedPayloadSumLb > 75 &&
      livePayloadSumLb + 75 < plannedPayloadSumLb * 0.5;
    if (payloadInjectStuck && applyResult) {
      watchDebugLog('inject', 'payload stuck vs plan', {
        livePayloadSumLb: Math.round(livePayloadSumLb),
        plannedPayloadSumLb: Math.round(plannedPayloadSumLb),
        workingSumLb: Math.round(workingSumLb),
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
      // Never wipe a load that mass-balance / working plan still shows as present.
      const mbStillLoaded =
        (await readLivePayloadTotalLb(bridge, resolved.profile)) >=
        Math.max(100, plannedPayloadSumLb * 0.45);
      if (
        applyResult.payload?.errorCode === 'PAYLOAD_NOT_APPLIED' &&
        (mbStillLoaded || workingSumLb >= plannedPayloadSumLb * 0.45)
      ) {
        applyResult = {
          ...applyResult,
          payload: {
            ...applyResult.payload,
            success: true,
            errorCode: undefined,
            details: {
              message:
                'Station SimVars under-read; kept injected load (mass-balance / plan trust)',
            },
          },
        };
      }
    }

    if (!applySucceeded(applyResult)) {
      rolledBack = true;
      const restore = await engine.applyLoadPlan(
        rollbackRequest(rollbackPlan, restoreFuelOnRollback),
      );
      rollbackOk = applySucceeded({
        fuel: restore.fuel,
        payload: restore.payload,
      });
      afterLive = {
        tanks: await readLiveTanks(bridge, resolved.profile),
        stations: await readLiveStations(bridge, resolved.profile),
      };
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
        const minMac = limits?.minMac;
        const maxMac = limits?.maxMac;
        const lo =
          minMac === undefined ? undefined : minMac + margin;
        const hi =
          maxMac === undefined ? undefined : maxMac - margin;
        parts.push(
          failure && lo !== undefined && hi !== undefined
            ? `CG ${failure.actual.toFixed(1)}% outside ${lo.toFixed(0)}–${hi.toFixed(0)}% effective envelope (${minMac}–${maxMac}% tablet ±${margin}% margin)`
            : failure
              ? `CG ${failure.actual.toFixed(1)}% out of envelope`
              : 'CG out of envelope',
        );
      }
      error = formatPipeError(
        `Apply failed (${parts.join(', ') || 'unknown'})`,
      );
      if (rollbackOk === false) {
        error += ' — ROLLBACK INCOMPLETE, check aircraft load manually';
      } else {
        error += restoreFuelOnRollback
          ? ' — restored previous load'
          : ' — restored previous payload (fuel left as-is)';
      }
    } else {
      // Real acceptance: OFP compare (Caravan payload verify only checks station 1).
      try {
        setOfpLoadProgress(mission.id, {
          phase: 'verifying',
          message:
            cgRebalanceMoves > 0
              ? `Verifying load after ${cgRebalanceMoves} CG shift(s)…`
              : 'Verifying injected load against OFP…',
          cgAttempt: cgRebalanceMoves || undefined,
          cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
        });
        const { snapshot } = await compareOnce(bridge, { ofp, locked: false });
        compareVerdict = snapshot.verdict;
        compareSummary = formatComplianceSummary(snapshot);
        if (cgRebalanceMoves > 0) {
          compareSummary =
            `${compareSummary}\n  [info] CG_REBALANCE: shifted cargo ${cgRebalanceMoves} time(s) to fit envelope`;
        }
        if (softCgWarn && applyResult.cg?.failures[0]) {
          const failure = applyResult.cg.failures[0];
          compareSummary =
            `${compareSummary}\n  [warn] CG_SOFT: live ${failure.actual.toFixed(1)}% MAC outside provisional envelope (apply kept)`;
        }
        if (snapshot.verdict === 'fail') {
          // Do NOT rollback a successful station/fuel write because OFP semantics
          // disagree (e.g. SimBrief "baggage" cargo sitting on GA cabin seats, or
          // soft-cap/CG stopped short of OFP lbs). Career Loaded vs Due is the
          // Depart gate — wiping the inject left Sim at 0 with Due still full.
          compareSummary =
            `${compareSummary}\n  [warn] OFP_COMPARE_SOFT: injected load kept — fix Loaded vs Due or re-inject before depart`;
          if (compareVerdict === 'fail') {
            compareVerdict = 'warn';
          }
        }
      } catch (compareError) {
        compareSummary =
          compareError instanceof Error ? compareError.message : String(compareError);
        // Soft: apply succeeded; compare plumbing failed — still run optional preflight.
      }
    }

    if (!error && opts.runPreflightAfter !== false) {
      // Release only this pipe client; the host's SimConnect session is shared.
      try {
        await bridge.close({ disconnectHost: false });
      } catch {
        /* ignore */
      }
      // Let post-inject preflight take the exclusive gate.
      releaseSimBridgeGateOnce();
      try {
        preflight = await runMissionPreflight(mission, {
          username,
          userid,
          pipeName: opts.pipeName,
          targetBlockFuelKg: opts.targetBlockFuelKg,
        });
      } catch (preflightError) {
        // Load already succeeded; surface preflight plumbing as soft failure note.
        const msg =
          preflightError instanceof Error
            ? preflightError.message
            : String(preflightError);
        compareSummary = compareSummary
          ? `${compareSummary} · Preflight follow-up failed: ${msg}`
          : `Preflight follow-up failed: ${msg}`;
      }
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
