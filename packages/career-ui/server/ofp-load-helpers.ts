/**
 * Apply confirmed SimBrief OFP fuel/payload into the live aircraft.
 * Mirrors preflight-helpers: short-lived NamedPipeSimBridge + resolveLiveAircraft.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  assertRolesPackAllowsDirectInjection,
  flightPhaseFromSample,
  normalizeAircraftTitle,
  resolveLivePayloadLb,
  type AircraftProfile,
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
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import type { CareerWatchSession } from './watch-helpers.ts';

export { isOfpLoadActive };

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

/** Stay this many %MAC inside the live envelope after inject rebalance. */
const CG_REBALANCE_MARGIN_MAC = 1;
/** CG nudge passes after the equal payload apply (50 lb each). */
const CG_REBALANCE_MAX_ITERATIONS = 24;
/** Settle after payload writes before trusting live CG (MSFS lag). */
const PAYLOAD_CG_SETTLE_MS = 900;

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

export function getOfpLoadProgress(missionId: string): OfpLoadProgress | null {
  return ofpLoadProgressByMission.get(missionId) ?? null;
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
    return { ...full, cgPolicy: 'soft' };
  }
  return { payload: full.payload, cgPolicy: 'soft' };
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
    return {
      connected: true,
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
}

export async function applyMissionOfpLoad(
  mission: MissionIntent,
  opts: {
    username?: string;
    userid?: string;
    pipeName?: string;
    catalogUrl?: string;
    runPreflightAfter?: boolean;
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

  let ofp = expectation;
  let stationRoles = expectation.payload?.stationRoles;

  const bridge = new NamedPipeSimBridge({
    ...(opts.pipeName ? { pipeName: opts.pipeName } : {}),
    // Multi-step inject can exceed the default 10s IPC budget on slow SimConnect.
    requestTimeoutMs: 60_000,
    connectTimeoutMs: 10_000,
  });

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
    const fuelAlreadyOk = liveFuelMatchesTarget(beforeLive.tanks, plannedTanks);
    const plannedFuelLb = built.blockFuelLb;
    const plannedPayloadLb =
      built.plan.payload?.total ??
      sumRecord(built.plan.payload?.stations) ??
      built.cargoLb + built.crewStations.length * FREIGHTER_PILOT_LB;

    const tanksToFuelLb = (tanks: Record<string, number>): number => {
      const qty = sumRecord(tanks);
      const unit = resolved.profile.fuel.unit ?? 'gallons';
      if (unit === 'pounds') return qty;
      if (unit === 'kilograms') return qty * 2.20462262185;
      if (unit === 'liters') return qty * (fuelLbPerGal / 3.785411784);
      return qty * fuelLbPerGal;
    };

    afterLive = {
      tanks: { ...beforeLive.tanks },
      stations: { ...beforeLive.stations },
    };

    const seatStations = built.seatStations ?? [
      ...built.crewStations,
      ...(built.passengerStations ?? []),
    ];
    const baggageStations = built.baggageStations;
    const minRetainByIndex: Record<number, number> = {};
    for (const idx of built.crewStations) {
      minRetainByIndex[idx] = FREIGHTER_PILOT_LB;
    }
    const seatSoftMaxByIndex: Record<number, number> = {};
    for (const idx of seatStations) {
      seatSoftMaxByIndex[idx] = seatSoftMaxLb(resolved.profile, idx);
    }
    const preferSeatFill = (built.passengerStations?.length ?? 0) > 0;
    const baggageSoftMaxByIndex: Record<number, number> = {};
    for (const idx of baggageStations) {
      const hard =
        resolved.profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
      baggageSoftMaxByIndex[idx] = preferSeatFill
        ? Math.min(hard, GA_BAGGAGE_SOFT_MAX_LB)
        : hard;
    }

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

    const publishLiveProgress = (
      phase: OfpLoadProgressPhase,
      message: string,
      extra?: { cgAttempt?: number; liveMac?: number },
    ) => {
      setOfpLoadProgress(mission.id, {
        phase,
        message,
        cgAttempt: extra?.cgAttempt,
        cgMaxAttempts: CG_REBALANCE_MAX_ITERATIONS,
        liveMac: extra?.liveMac,
        liveFuelLb: tanksToFuelLb(afterLive.tanks),
        // Prefer working plan when station SimVars under-read mid-inject.
        livePayloadLb: Math.max(
          sumRecord(afterLive.stations),
          sumRecord(workingStations),
        ),
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
      try {
        return await engine!.applyLoadPlan({
          payload: { stations, total },
          cgPolicy: 'none',
          skipVerify: true,
        });
      } catch (err) {
        if (!isPipeDisconnectError(err)) throw err;
        await reconnectBridge();
        return engine!.applyLoadPlan({
          payload: { stations, total },
          cgPolicy: 'none',
          skipVerify: true,
        });
      }
    };

    assertOfpLoadNotCancelled(mission.id);
    publishLiveProgress(
      'injecting',
      fuelAlreadyOk
        ? `Fuel OK — loading payload +${CG_BALANCE_STEP_LB} lb/seat across ${seatCount} seats…`
        : 'Injecting OFP fuel…',
    );

    if (!fuelAlreadyOk && built.plan.fuel) {
      applyResult = await engine.applyLoadPlan({
        fuel: built.plan.fuel,
        cgPolicy: 'none',
        // Live tank read below is the source of truth — avoid 6s verify IPC storms.
        skipVerify: true,
      });
      restoreFuelOnRollback = Boolean(
        applyResult.fuel && !applyResult.fuel.success,
      );
      assertOfpLoadNotCancelled(mission.id);
      await delayCancellable(mission.id, PAYLOAD_CG_SETTLE_MS);
      afterLive = {
        tanks: await readLiveTanks(bridge, resolved.profile),
        stations: afterLive.stations,
      };
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
          break;
        }

        const trendNote =
          macTrend > 0.05 ? 'drifting aft' : macTrend < -0.05 ? 'drifting fwd' : 'stable';
        publishLiveProgress(
          'balancing',
          stillPlacing
            ? `+${perSeatLb} lb/seat → ${bias} (${trendNote}) · ${Math.min(cargoPlacedLb + perSeatLb * seatCount, cargoTargetLb)}/${cargoTargetLb} lb` +
              (liveMac !== undefined ? ` · ${liveMac.toFixed(1)}% MAC` : '')
            : `Counterweight → ${bias} +${perSeatLb} lb/seat (${trendNote}, ${i + 1}/${CG_REBALANCE_MAX_ITERATIONS}` +
              (liveMac !== undefined ? `, ${liveMac.toFixed(1)}% MAC` : '') +
              `)`,
          { cgAttempt: i + 1, liveMac },
        );

        let nextStations = workingStations;
        let movedLb = 0;
        if (stillPlacing) {
          // Seats first (soft-capped). Baggage only when seats are full or freighter.
          let placeIndexes: number[];
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
            break;
          }
          const placeBias =
            placeIndexes === baggageStations || !preferSeatFill ? bias : 'equal';
          const placed = allocateCargoRoundPerSeat(
            workingStations,
            resolved.profile,
            placeIndexes,
            // Baggage: small steps so we can stop at the aft CG limit.
            placeIndexes === baggageStations
              ? Math.min(perSeatLb, GA_BAGGAGE_SOFT_MAX_LB)
              : perSeatLb,
            placeBias,
            cargoTargetLb - cargoPlacedLb,
            softMax ? { softMaxByIndex: softMax } : undefined,
          );
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
            break;
          }
        } else {
          break;
        }

        if (movedLb <= 0) {
          if (!stillPlacing && haveEnvelope && !inEnvelope) {
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
          break;
        }

        const total = Object.values(nextStations).reduce((a, b) => a + b, 0);
        workingStations = nextStations;
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
        publishLiveProgress(
          'balancing',
          stillPlacing
            ? `Placed ${cargoPlacedLb}/${cargoTargetLb} lb (+${perSeatLb} lb/seat → ${bias}, ${trendNote})` +
              (liveMac !== undefined ? ` · ${liveMac.toFixed(1)}% MAC` : '')
            : `Counterweight applied (+${perSeatLb} lb/seat → ${bias}, ${trendNote})` +
              (liveMac !== undefined ? ` · ${liveMac.toFixed(1)}% MAC` : ''),
          { cgAttempt: i + 1, liveMac },
        );
        if (payloadApply.payload && !payloadApply.payload.success) {
          break;
        }
      }

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
        const inEnvelope = liveMac >= lo && liveMac <= hi;
        const failure = {
          var: 'CG PERCENT',
          expected: (minMac + maxMac) / 2,
          actual: liveMac,
          tolerancePct: CG_REBALANCE_MARGIN_MAC,
        };
        if (inEnvelope) {
          applyResult = { ...applyResult, cg: { ok: true, failures: [] } };
        } else if (cgPolicy === 'strict' && !preferSeatFill) {
          applyResult = {
            ...applyResult,
            cg: { ok: false, failures: [failure] },
          };
        } else {
          // Soft / GA seat-first: keep the load; CG at limit is advisory.
          softCgWarn = true;
          applyResult = {
            ...applyResult,
            cg: { ok: true, failures: [failure] },
          };
        }
      }
    }

    afterLive = {
      tanks: await readLiveTanks(bridge, resolved.profile),
      stations: await readLiveStations(bridge, resolved.profile),
    };

    // Station SimVars can under-read on Accu-Sim while gross weight shows the load.
    // Prefer mass-balance total; also trust in-memory workingStations when reads are ~0.
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
    if (
      livePayloadSumLb + 75 < plannedPayloadSumLb * 0.5 &&
      workingSumLb >= plannedPayloadSumLb * 0.5
    ) {
      livePayloadSumLb = workingSumLb;
      afterLive = { ...afterLive, stations: { ...workingStations } };
    }

    const payloadInjectStuck =
      applySucceeded(applyResult) &&
      plannedPayloadSumLb > 75 &&
      livePayloadSumLb + 75 < plannedPayloadSumLb * 0.5;
    if (payloadInjectStuck && applyResult) {
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
        const tolerance = failure?.tolerancePct ?? 0;
        parts.push(
          failure && limits
            ? `CG ${failure.actual.toFixed(1)}% outside ${
                limits.minMac === undefined ? '−∞' : limits.minMac - tolerance
              }–${
                limits.maxMac === undefined ? '∞' : limits.maxMac + tolerance
              }% effective envelope`
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
          rolledBack = true;
          const restore = await engine.applyLoadPlan(
            rollbackRequest(rollbackPlan, restoreFuelOnRollback),
          );
          rollbackOk = applySucceeded(restore);
          afterLive = {
            tanks: await readLiveTanks(bridge, resolved.profile),
            stations: await readLiveStations(bridge, resolved.profile),
          };
          error = `Post-apply OFP compare failed: ${compareSummary}`;
          if (rollbackOk === false) {
            error += ' — ROLLBACK INCOMPLETE, check aircraft load manually';
          } else {
            error += restoreFuelOnRollback
              ? ' — restored previous load'
              : ' — restored previous payload (fuel left as-is)';
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
      try {
        preflight = await runMissionPreflight(mission, {
          username,
          userid,
          pipeName: opts.pipeName,
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
