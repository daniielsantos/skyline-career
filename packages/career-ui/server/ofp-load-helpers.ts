/**
 * Apply confirmed SimBrief OFP fuel/payload into the live aircraft.
 * Mirrors preflight-helpers: short-lived NamedPipeSimBridge + resolveLiveAircraft.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile, LoadPlanRequest, MissionIntent } from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { compareOnce, formatComplianceSummary } from '../../agent/src/ofp-compliance/run-compare.ts';
import { loadRolesPackFile } from '../../agent/src/ofp-compliance/scaffold-roles.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import {
  OfpLoadPlanError,
  buildOfpLoadPlan,
  buildRollbackPlan,
  type BuiltOfpLoadPlan,
} from '../../agent/src/ofp-load-plan.ts';
import { ProfileCache } from '../../agent/src/profile-cache.ts';
import {
  defaultCacheDir,
  defaultProfileDirs,
  loadProfilesFromDirs,
} from '../../agent/src/profile-registry.ts';
import { resolveLiveAircraft } from '../../agent/src/resolve-live.ts';
import { runMissionPreflight, type MissionPreflightResult } from './preflight-helpers.ts';
import type { CareerWatchSession } from './watch-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

export type SimBridgeStatusPayload = {
  connected: boolean;
  mode: string | null;
  aircraftTitle: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  parkingBrake: boolean | null;
  phase: string | null;
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
};

function phaseFromFlags(onGround: boolean | null, enginesRunning: boolean | null): string | null {
  if (onGround === null) return null;
  if (!onGround) return 'airborne';
  if (enginesRunning === null) return onGround ? 'ground' : null;
  return enginesRunning ? 'ground+engines' : 'ground';
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

function applySucceeded(
  apply: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>>,
): boolean {
  if (apply.fuel && !apply.fuel.success) return false;
  if (apply.payload && !apply.payload.success) return false;
  if (apply.cg && apply.cg.ok === false) return false;
  return true;
}

export async function probeSimBridgeStatus(opts: {
  watchSession?: CareerWatchSession;
  pipeName?: string;
} = {}): Promise<SimBridgeStatusPayload> {
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
      source: 'watch',
      error: watch.lastError,
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
    return {
      connected: Boolean(ping.connected ?? true),
      mode: ping.mode ?? null,
      aircraftTitle,
      onGround: snap.onGround,
      enginesRunning: snap.enginesRunning,
      parkingBrake: snap.parkingBrake ?? null,
      phase: phaseFromFlags(snap.onGround, snap.enginesRunning),
      source: 'probe',
      error: null,
      checkedAtIso,
    };
  } catch (error) {
    return {
      connected: false,
      mode: null,
      aircraftTitle: null,
      onGround: null,
      enginesRunning: null,
      parkingBrake: null,
      phase: null,
      source: 'probe',
      error: error instanceof Error ? error.message : String(error),
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

  const username = opts.username?.trim() || process.env.SIMBRIEF_USERNAME?.trim();
  const userid = opts.userid?.trim() || process.env.SIMBRIEF_USERID?.trim();
  if (!username && !userid) {
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
  try {
    const rolesPath = resolve(repoRoot, mission.rolesPackRelPath);
    const rolesPack = await loadRolesPackFile(rolesPath);
    stationRoles = rolesPack.payload?.stationRoles ?? stationRoles;
    ofp = applyOfpOverrides(expectation, {
      stationRoles: rolesPack.payload?.stationRoles,
      liveSources: rolesPack.liveSources,
    });
  } catch {
    // Freighter may still load if OFP already carries stationRoles.
  }

  const bridge = new NamedPipeSimBridge(
    opts.pipeName ? { pipeName: opts.pipeName } : {},
  );

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

  try {
    await bridge.open('Skyline Career UI OFP Load');

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

    const snap = await bridge.snapshot();
    beforeLive = {
      tanks: await readLiveTanks(bridge, resolved.profile),
      stations: await readLiveStations(bridge, resolved.profile),
      onGround: snap.onGround,
      enginesRunning: snap.enginesRunning,
    };

    const fuelLbPerGal = await readFuelLbPerGal(bridge);

    try {
      built = buildOfpLoadPlan({
        ofp,
        profile: resolved.profile,
        stationRoles,
        liveStationsLb: beforeLive.stations,
        fuelLbPerGal,
        cargoKgFallback: mission.cargoKg,
      });
    } catch (planError) {
      if (planError instanceof OfpLoadPlanError) {
        throw new Error(`${planError.code}: ${planError.message}`);
      }
      throw planError;
    }

    const rollbackPlan = buildRollbackPlan(resolved.profile, beforeLive);
    const engine = new DefaultProfileEngine({
      profile: resolved.profile,
      bridge,
    });

    applyResult = await engine.applyLoadPlan(built.plan);
    afterLive = {
      tanks: await readLiveTanks(bridge, resolved.profile),
      stations: await readLiveStations(bridge, resolved.profile),
    };

    if (!applySucceeded(applyResult)) {
      rolledBack = true;
      const restore = await engine.applyLoadPlan(rollbackPlan);
      rollbackOk = applySucceeded(restore);
      afterLive = {
        tanks: await readLiveTanks(bridge, resolved.profile),
        stations: await readLiveStations(bridge, resolved.profile),
      };
      const parts: string[] = [];
      if (applyResult.fuel && !applyResult.fuel.success) {
        parts.push(`fuel ${applyResult.fuel.errorCode ?? 'failed'}`);
      }
      if (applyResult.payload && !applyResult.payload.success) {
        parts.push(`payload ${applyResult.payload.errorCode ?? 'failed'}`);
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
      error = `Apply failed (${parts.join(', ') || 'unknown'})`;
      if (rollbackOk === false) {
        error += ' — ROLLBACK INCOMPLETE, check aircraft load manually';
      } else {
        error += ' — restored previous load';
      }
    } else {
      // Real acceptance: OFP compare (Caravan payload verify only checks station 1).
      try {
        const { snapshot } = await compareOnce(bridge, { ofp, locked: false });
        compareVerdict = snapshot.verdict;
        compareSummary = formatComplianceSummary(snapshot);
        if (snapshot.verdict === 'fail') {
          rolledBack = true;
          const restore = await engine.applyLoadPlan(rollbackPlan);
          rollbackOk = applySucceeded(restore);
          afterLive = {
            tanks: await readLiveTanks(bridge, resolved.profile),
            stations: await readLiveStations(bridge, resolved.profile),
          };
          error = `Post-apply OFP compare failed: ${compareSummary}`;
          if (rollbackOk === false) {
            error += ' — ROLLBACK INCOMPLETE, check aircraft load manually';
          } else {
            error += ' — restored previous load';
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
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
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
    };
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}
