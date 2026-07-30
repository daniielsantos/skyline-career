/**
 * Preflight Live Load — SimBrief OFP vs live MSFS fuel/payload/weight.
 * Reuses agent compare-ofp stack (compareOnce + roles pack).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ofpCargoKg,
  type MissionIntent,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { compareOnce, formatComplianceSummary } from '../../agent/src/ofp-compliance/run-compare.ts';
import { loadRolesPackFile } from '../../agent/src/ofp-compliance/scaffold-roles.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

export type PreflightCheckResult = {
  verdict: 'pass' | 'warn' | 'fail';
  summary: string;
  checkedAtIso: string;
  phase: string;
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

  const { expectation } = await fetchSimBriefLatestOfp({
    username,
    userid,
    staticId: mission.staticId,
  });

  let ofp = expectation;
  try {
    const rolesPath = resolve(repoRoot, mission.rolesPackRelPath);
    const rolesPack = await loadRolesPackFile(rolesPath);
    ofp = applyOfpOverrides(expectation, {
      stationRoles: rolesPack.payload?.stationRoles,
      liveSources: rolesPack.liveSources,
    });
  } catch {
    // Freighter compare still works without roles; classic payload path.
  }

  const bridge = new NamedPipeSimBridge(
    opts.pipeName ? { pipeName: opts.pipeName } : {},
  );
  try {
    await bridge.open('Skyline Career UI Preflight');
    const { snapshot, live } = await compareOnce(bridge, {
      ofp,
      locked: false,
    });
    const checkedAtIso = new Date().toISOString();
    const check: PreflightCheckResult = {
      verdict: snapshot.verdict,
      summary: formatComplianceSummary(snapshot),
      checkedAtIso,
      phase: snapshot.phase,
      findings: snapshot.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
      })),
    };
    return {
      check,
      summary: check.summary,
      ofp: {
        originIcao: ofp.originIcao,
        destIcao: ofp.destIcao,
        icao: ofp.icao,
        cargoKg: ofpCargoKg(ofp),
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
      await bridge.close();
    } catch {
      /* ignore */
    }
  }
}

/** True when mission must not auto/manual depart without override. */
export function preflightBlocksDepart(mission: MissionIntent): boolean {
  return mission.lastPreflightCheck?.verdict === 'fail';
}
