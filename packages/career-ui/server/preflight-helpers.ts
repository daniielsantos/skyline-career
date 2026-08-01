/**
 * Preflight Live Load — SimBrief OFP vs live MSFS fuel/payload/weight.
 * Reuses agent compare-ofp stack (compareOnce + roles pack).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KG_TO_LB,
  careerPreflightReady,
  normalizeAircraftTitle,
  ofpCargoKg,
  ofpFuelToLb,
  softenCareerPreflightVerdict,
  softenCgFindingSeverity,
  type MissionIntent,
  type OfpExpectation,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { compareOnce, formatComplianceSummary } from '../../agent/src/ofp-compliance/run-compare.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import { readLiveCgState } from '../../agent/src/live-cg.ts';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const ofpCache = new Map<string, Promise<OfpExpectation>>();

async function loadPreflightOfp(
  mission: MissionIntent,
  identity: { username?: string; userid?: string },
): Promise<OfpExpectation> {
  const key = [
    mission.staticId,
    mission.lastOfpCheck?.checkedAtIso ?? '',
    identity.username ?? '',
    identity.userid ?? '',
  ].join(':');
  let cached = ofpCache.get(key);
  if (!cached) {
    cached = fetchSimBriefLatestOfp({
      ...identity,
      staticId: mission.staticId!,
    }).then(({ expectation }) => expectation);
    ofpCache.set(key, cached);
    if (ofpCache.size > 20) {
      ofpCache.delete(ofpCache.keys().next().value!);
    }
    cached.catch(() => ofpCache.delete(key));
  }
  return cached;
}

export type PreflightCheckResult = {
  verdict: 'pass' | 'warn' | 'fail';
  summary: string;
  checkedAtIso: string;
  phase: string;
  loadVerification: {
    ready: boolean;
    fuel: { plannedLb?: number; liveLb: number; ok: boolean };
    payload: { plannedLb?: number; liveLb?: number; ok: boolean };
    aircraft: { onGround: boolean; enginesRunning: boolean };
    cg?: {
      liveMac?: number;
      minMac?: number;
      maxMac?: number;
      ok: boolean;
      severity: 'info' | 'warn';
    };
    weightNoteCount: number;
  };
  findings: Array<{ code: string; severity: string; message: string }>;
};

export type MissionPreflightResult = {
  check: PreflightCheckResult;
  summary: string;
  ofp: {
    originIcao?: string;
    destIcao?: string;
    icao?: string;
    cargoKg?: number;
    passengerCount?: number;
    blockFuel?: number;
    ofpId?: string;
  };
  live: {
    fuelTotalLb: number;
    fuelSource: string;
    payloadTotalLb?: number;
    payloadSource?: string;
    emptyLb?: number;
    zfwLb?: number;
    grossLb?: number;
    weightSource?: string;
    onGround: boolean;
    enginesRunning: boolean;
  };
};

export async function runMissionPreflight(
  mission: MissionIntent,
  opts: { username?: string; userid?: string; pipeName?: string } = {},
): Promise<MissionPreflightResult> {
  if (!mission.staticId) {
    throw new Error('Mission has no static_id — Dispatch first');
  }
  const username = opts.username?.trim() || process.env.SIMBRIEF_USERNAME?.trim();
  const userid = opts.userid?.trim() || process.env.SIMBRIEF_USERID?.trim();
  if (!username && !userid) {
    throw new Error(
      'SimBrief username required — set it in the UI or SIMBRIEF_USERNAME env',
    );
  }

  const expectation = await loadPreflightOfp(mission, { username, userid });

  const bridge = new NamedPipeSimBridge(
    opts.pipeName ? { pipeName: opts.pipeName } : {},
  );
  try {
    await bridge.open('Skyline Career UI Preflight');
    const identity = await bridge.getAircraftIdentity();
    const liveTitle = normalizeAircraftTitle(identity.title ?? '');
    let ofp = expectation;
    try {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: mission.rolesPackRelPath,
        airframeTypeId: mission.airframeTypeId,
        strictAirframeMatch: Boolean(mission.airframeTypeId),
        liveTitle: liveTitle || identity.title,
      });
      ofp = applyOfpOverrides(expectation, {
        stationRoles: roles.pack.payload?.stationRoles,
        liveSources: roles.pack.liveSources,
      });
    } catch (rolesError) {
      if (
        rolesError instanceof Error &&
        rolesError.message.includes('purchased airframe')
      ) {
        throw rolesError;
      }
      // Freighter compare still works without roles; classic payload path.
    }

    const { snapshot, live } = await compareOnce(bridge, {
      ofp,
      locked: false,
    });
    const checkedAtIso = new Date().toISOString();
    const fuelFailed = snapshot.findings.some(
      (finding) =>
        finding.severity === 'fail' && finding.code.startsWith('FUEL_'),
    );
    const payloadFailed = snapshot.findings.some(
      (finding) =>
        finding.severity === 'fail' &&
        /^(PAYLOAD_|BAGGAGE|PAX_|STATION_)/.test(finding.code),
    );
    const weightNoteCount = snapshot.findings.filter(
      (finding) =>
        finding.severity === 'warn' &&
        ['EMPTY_WEIGHT', 'TOW', 'ZFW'].includes(finding.code),
    ).length;
    const cargoKg = ofpCargoKg(ofp);

    // CG is advisory in Career preflight (OnAir-style Loaded vs Due).
    const liveCg = await readLiveCgState(bridge);
    const cgLiveMac = liveCg.liveMac;
    const cgMinMac = liveCg.minMac;
    const cgMaxMac = liveCg.maxMac;
    const cgInEnvelope =
      cgLiveMac === undefined ||
      cgMinMac === undefined ||
      cgMaxMac === undefined ||
      (cgLiveMac >= cgMinMac - 0.5 && cgLiveMac <= cgMaxMac + 0.5);
    // Soften CG findings: Preflight never fails on CG alone (OnAir Loaded vs Due).
    const findings = snapshot.findings.map((f) => ({
      code: f.code,
      severity: softenCgFindingSeverity(f.code, f.severity),
      message: f.message,
    }));
    if (cgLiveMac !== undefined) {
      const envelopeNote =
        cgMinMac !== undefined && cgMaxMac !== undefined
          ? ` envelope ${cgMinMac.toFixed(0)}–${cgMaxMac.toFixed(0)}%`
          : '';
      findings.push({
        code: 'CG_LIVE',
        severity: cgInEnvelope ? 'info' : 'warn',
        message: `Live CG ${cgLiveMac.toFixed(1)}% MAC${envelopeNote} (advisory; does not block Validate)`,
      });
    }

    // Ready = fuel + payload OK. CG / empty-weight notes never block Depart alone.
    const fuelOk = !fuelFailed;
    const payloadOk = !payloadFailed;
    const ready = careerPreflightReady({ fuelFailed, payloadFailed });
    const careerVerdict = softenCareerPreflightVerdict(ready, snapshot.verdict);

    const check: PreflightCheckResult = {
      verdict: careerVerdict,
      summary: formatComplianceSummary({
        ...snapshot,
        verdict: careerVerdict,
        findings: findings.map((f) => ({
          ...f,
          severity: f.severity as 'pass' | 'warn' | 'fail' | 'info',
        })),
      }),
      checkedAtIso,
      phase: snapshot.phase,
      loadVerification: {
        ready,
        fuel: {
          plannedLb: ofpFuelToLb(ofp.fuel).total,
          liveLb: live.fuel.total,
          ok: fuelOk,
        },
        payload: {
          plannedLb: cargoKg !== undefined ? cargoKg * KG_TO_LB : undefined,
          liveLb: live.payload?.ofpPayloadLb ?? live.payload?.total,
          ok: payloadOk,
        },
        aircraft: {
          onGround: live.onGround,
          enginesRunning: live.enginesRunning,
        },
        cg:
          cgLiveMac !== undefined
            ? {
                liveMac: cgLiveMac,
                minMac: cgMinMac,
                maxMac: cgMaxMac,
                ok: cgInEnvelope,
                severity: cgInEnvelope ? 'info' : 'warn',
              }
            : undefined,
        weightNoteCount,
      },
      findings,
    };
    return {
      check,
      summary: check.summary,
      ofp: {
        originIcao: ofp.originIcao,
        destIcao: ofp.destIcao,
        icao: ofp.icao,
        cargoKg,
        passengerCount: ofp.loadSheet?.passengerCount,
        blockFuel: ofp.loadSheet?.blockFuel,
        ofpId: ofp.ofpId,
      },
      live: {
        fuelTotalLb: live.fuel.total,
        fuelSource: live.fuel.source,
        payloadTotalLb: live.payload?.total,
        payloadSource: live.payload?.source,
        emptyLb: live.weights?.emptyLb,
        zfwLb: live.weights?.zfwLb,
        grossLb: live.weights?.grossLb,
        weightSource: live.weights?.source,
        onGround: live.onGround,
        enginesRunning: live.enginesRunning,
      },
    };
  } finally {
    try {
      // The host owns one shared SimConnect session. Closing this short-lived
      // pipe client must not disconnect Watch or a following operation.
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}

/** True when mission must not auto/manual depart without override. */
export function preflightBlocksDepart(mission: MissionIntent): boolean {
  if (!mission.lastPreflightCheck) return true;
  const ready = mission.lastPreflightCheck?.loadVerification?.ready;
  if (typeof ready === 'boolean') return !ready;
  return mission.lastPreflightCheck?.verdict === 'fail';
}
