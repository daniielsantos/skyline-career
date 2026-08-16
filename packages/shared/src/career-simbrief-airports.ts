/**
 * Cargo/Dispatch hubs must exist in SimBrief navdata.
 * SimBrief does not publish an airport dump (unlike inputs.airframes.json),
 * so we keep a checked-in allowlist. Bush / bushTripOnly strips are exempt
 * (PLN, not Dispatch Redirect).
 */

import { AR_CAREER_HUBS } from './career-ar-hubs.js';
import { BO_CAREER_HUBS } from './career-bo-hubs.js';
import { BR_CAREER_HUBS } from './career-br-hubs.js';
import { CA_CAREER_HUBS } from './career-ca-hubs.js';
import { CL_CAREER_HUBS } from './career-cl-hubs.js';
import { CO_CAREER_HUBS } from './career-co-hubs.js';
import { EC_CAREER_HUBS } from './career-ec-hubs.js';
import { GF_CAREER_HUBS } from './career-gf-hubs.js';
import { GY_CAREER_HUBS } from './career-gy-hubs.js';
import { MX_CAREER_HUBS } from './career-mx-hubs.js';
import { PE_CAREER_HUBS } from './career-pe-hubs.js';
import { PY_CAREER_HUBS } from './career-py-hubs.js';
import { SR_CAREER_HUBS } from './career-sr-hubs.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { UY_CAREER_HUBS } from './career-uy-hubs.js';
import { VE_CAREER_HUBS } from './career-ve-hubs.js';
import { PA_CAREER_HUBS } from './career-pa-hubs.js';
import { CR_CAREER_HUBS } from './career-cr-hubs.js';
import { NI_CAREER_HUBS } from './career-ni-hubs.js';
import { HN_CAREER_HUBS } from './career-hn-hubs.js';
import { SV_CAREER_HUBS } from './career-sv-hubs.js';
import { GT_CAREER_HUBS } from './career-gt-hubs.js';
import { BZ_CAREER_HUBS } from './career-bz-hubs.js';
import { CU_CAREER_HUBS } from './career-cu-hubs.js';
import { DO_CAREER_HUBS } from './career-do-hubs.js';
import { HT_CAREER_HUBS } from './career-ht-hubs.js';
import { JM_CAREER_HUBS } from './career-jm-hubs.js';
import { BS_CAREER_HUBS } from './career-bs-hubs.js';
import { TT_CAREER_HUBS } from './career-tt-hubs.js';
import { BB_CAREER_HUBS } from './career-bb-hubs.js';
import { LC_CAREER_HUBS } from './career-lc-hubs.js';
import { GD_CAREER_HUBS } from './career-gd-hubs.js';
import { AG_CAREER_HUBS } from './career-ag-hubs.js';
import { GP_CAREER_HUBS } from './career-gp-hubs.js';
import { MQ_CAREER_HUBS } from './career-mq-hubs.js';
import { CW_CAREER_HUBS } from './career-cw-hubs.js';
import { SX_CAREER_HUBS } from './career-sx-hubs.js';
import { AW_CAREER_HUBS } from './career-aw-hubs.js';
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
  ...UY_CAREER_HUBS,
  ...PY_CAREER_HUBS,
  ...PE_CAREER_HUBS,
  ...BO_CAREER_HUBS,
  ...EC_CAREER_HUBS,
  ...CO_CAREER_HUBS,
  ...VE_CAREER_HUBS,
  ...GY_CAREER_HUBS,
  ...SR_CAREER_HUBS,
  ...GF_CAREER_HUBS,
  ...PA_CAREER_HUBS,
  ...CR_CAREER_HUBS,
  ...NI_CAREER_HUBS,
  ...HN_CAREER_HUBS,
  ...SV_CAREER_HUBS,
  ...GT_CAREER_HUBS,
  ...BZ_CAREER_HUBS,
  ...CU_CAREER_HUBS,
  ...DO_CAREER_HUBS,
  ...HT_CAREER_HUBS,
  ...JM_CAREER_HUBS,
  ...BS_CAREER_HUBS,
  ...TT_CAREER_HUBS,
  ...BB_CAREER_HUBS,
  ...LC_CAREER_HUBS,
  ...GD_CAREER_HUBS,
  ...AG_CAREER_HUBS,
  ...GP_CAREER_HUBS,
  ...MQ_CAREER_HUBS,
  ...CW_CAREER_HUBS,
  ...SX_CAREER_HUBS,
  ...AW_CAREER_HUBS,
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
