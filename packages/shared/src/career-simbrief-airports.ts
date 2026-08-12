/**
 * Cargo/Dispatch hubs must exist in SimBrief navdata.
 * SimBrief does not publish an airport dump (unlike inputs.airframes.json),
 * so we keep a checked-in allowlist. Bush / bushTripOnly strips are exempt
 * (PLN, not Dispatch Redirect).
 */

import { AR_CAREER_HUBS } from './career-ar-hubs.js';
import { BR_CAREER_HUBS } from './career-br-hubs.js';
import { CA_CAREER_HUBS } from './career-ca-hubs.js';
import { CL_CAREER_HUBS } from './career-cl-hubs.js';
import { MX_CAREER_HUBS } from './career-mx-hubs.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import allowlistRaw from './data/simbrief-dispatch-airports.json' with { type: 'json' };

type CareerHubRow = {
  icao: string;
  bush?: true;
  bushTripOnly?: true;
};

const ALL_CAREER_HUBS: readonly CareerHubRow[] = [
  ...BR_CAREER_HUBS,
  ...US_CAREER_HUBS,
  ...CA_CAREER_HUBS,
  ...MX_CAREER_HUBS,
  ...AR_CAREER_HUBS,
  ...CL_CAREER_HUBS,
];

/** ICAOs that must never be cargo/Dispatch hubs (MSFS-only or closed). */
export const SIMBRIEF_DISPATCH_DENY_ICAOS: readonly string[] = [
  'SCCD',
  'SCSN',
  'SCST',
  'SCTC',
];

export function isDispatchCareerHub(hub: CareerHubRow): boolean {
  return hub.bush !== true && hub.bushTripOnly !== true;
}

export function listDispatchCareerHubIcaos(): string[] {
  return ALL_CAREER_HUBS.filter(isDispatchCareerHub)
    .map((hub) => hub.icao.trim().toUpperCase())
    .sort();
}

export function listSimBriefDispatchAllowlist(): string[] {
  const raw = allowlistRaw as { icaos?: unknown };
  if (!Array.isArray(raw.icaos)) return [];
  return raw.icaos
    .filter((icao): icao is string => typeof icao === 'string')
    .map((icao) => icao.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

export function assertDispatchHubsAreSimBriefKnown(): void {
  const deny = new Set(SIMBRIEF_DISPATCH_DENY_ICAOS);
  const allow = new Set(listSimBriefDispatchAllowlist());
  const dispatch = listDispatchCareerHubIcaos();
  const missing: string[] = [];
  const banned: string[] = [];
  for (const icao of dispatch) {
    if (deny.has(icao)) banned.push(icao);
    else if (!allow.has(icao)) missing.push(icao);
  }
  if (banned.length > 0) {
    throw new Error(
      `Cargo hubs not in SimBrief (remove from catalog): ${banned.join(', ')}`,
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `Cargo hub(s) missing from simbrief-dispatch-airports.json (confirm in SimBrief Dispatch, then add): ${missing.join(', ')}`,
    );
  }
  for (const icao of deny) {
    if (allow.has(icao)) {
      throw new Error(
        `${icao} is on the SimBrief deny list but still in the allowlist`,
      );
    }
  }
}
