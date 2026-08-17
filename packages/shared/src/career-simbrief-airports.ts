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
import { PT_CAREER_HUBS } from './career-pt-hubs.js';
import { ES_CAREER_HUBS } from './career-es-hubs.js';
import { FR_CAREER_HUBS } from './career-fr-hubs.js';
import { GB_CAREER_HUBS } from './career-gb-hubs.js';
import { DE_CAREER_HUBS } from './career-de-hubs.js';
import { NL_CAREER_HUBS } from './career-nl-hubs.js';
import { BE_CAREER_HUBS } from './career-be-hubs.js';
import { IT_CAREER_HUBS } from './career-it-hubs.js';
import { IE_CAREER_HUBS } from './career-ie-hubs.js';
import { DK_CAREER_HUBS } from './career-dk-hubs.js';
import { NO_CAREER_HUBS } from './career-no-hubs.js';
import { SE_CAREER_HUBS } from './career-se-hubs.js';
import { FI_CAREER_HUBS } from './career-fi-hubs.js';
import { CH_CAREER_HUBS } from './career-ch-hubs.js';
import { AT_CAREER_HUBS } from './career-at-hubs.js';
import { PL_CAREER_HUBS } from './career-pl-hubs.js';
import { CZ_CAREER_HUBS } from './career-cz-hubs.js';
import { SK_CAREER_HUBS } from './career-sk-hubs.js';
import { HU_CAREER_HUBS } from './career-hu-hubs.js';
import { EE_CAREER_HUBS } from './career-ee-hubs.js';
import { LV_CAREER_HUBS } from './career-lv-hubs.js';
import { LT_CAREER_HUBS } from './career-lt-hubs.js';
import { HR_CAREER_HUBS } from './career-hr-hubs.js';
import { SI_CAREER_HUBS } from './career-si-hubs.js';
import { RO_CAREER_HUBS } from './career-ro-hubs.js';
import { BG_CAREER_HUBS } from './career-bg-hubs.js';
import { GR_CAREER_HUBS } from './career-gr-hubs.js';
import { RS_CAREER_HUBS } from './career-rs-hubs.js';
import { IS_CAREER_HUBS } from './career-is-hubs.js';
import { BA_CAREER_HUBS } from './career-ba-hubs.js';
import { ME_CAREER_HUBS } from './career-me-hubs.js';
import { AL_CAREER_HUBS } from './career-al-hubs.js';
import { MK_CAREER_HUBS } from './career-mk-hubs.js';
import { TR_CAREER_HUBS } from './career-tr-hubs.js';
import { UA_CAREER_HUBS } from './career-ua-hubs.js';
import { BY_CAREER_HUBS } from './career-by-hubs.js';
import { MD_CAREER_HUBS } from './career-md-hubs.js';
import { GE_CAREER_HUBS } from './career-ge-hubs.js';
import { AM_CAREER_HUBS } from './career-am-hubs.js';
import { AZ_CAREER_HUBS } from './career-az-hubs.js';
import { LU_CAREER_HUBS } from './career-lu-hubs.js';
import { MT_CAREER_HUBS } from './career-mt-hubs.js';
import { CY_CAREER_HUBS } from './career-cy-hubs.js';
import { XK_CAREER_HUBS } from './career-xk-hubs.js';
import { MA_CAREER_HUBS } from './career-ma-hubs.js';
import { DZ_CAREER_HUBS } from './career-dz-hubs.js';
import { TN_CAREER_HUBS } from './career-tn-hubs.js';
import { EG_CAREER_HUBS } from './career-eg-hubs.js';
import { IL_CAREER_HUBS } from './career-il-hubs.js';
import { SA_CAREER_HUBS } from './career-sa-hubs.js';
import { AE_CAREER_HUBS } from './career-ae-hubs.js';
import { QA_CAREER_HUBS } from './career-qa-hubs.js';
import { BH_CAREER_HUBS } from './career-bh-hubs.js';
import { KW_CAREER_HUBS } from './career-kw-hubs.js';
import { OM_CAREER_HUBS } from './career-om-hubs.js';
import { IQ_CAREER_HUBS } from './career-iq-hubs.js';
import { IR_CAREER_HUBS } from './career-ir-hubs.js';
import { JO_CAREER_HUBS } from './career-jo-hubs.js';
import { LB_CAREER_HUBS } from './career-lb-hubs.js';
import { SY_CAREER_HUBS } from './career-sy-hubs.js';
import { LY_CAREER_HUBS } from './career-ly-hubs.js';
import { SD_CAREER_HUBS } from './career-sd-hubs.js';
import { YE_CAREER_HUBS } from './career-ye-hubs.js';
import { PK_CAREER_HUBS } from './career-pk-hubs.js';
import { IN_CAREER_HUBS } from './career-in-hubs.js';
import { LK_CAREER_HUBS } from './career-lk-hubs.js';
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
  ...PT_CAREER_HUBS,
  ...ES_CAREER_HUBS,
  ...FR_CAREER_HUBS,
  ...GB_CAREER_HUBS,
  ...DE_CAREER_HUBS,
  ...NL_CAREER_HUBS,
  ...BE_CAREER_HUBS,
  ...IT_CAREER_HUBS,
  ...IE_CAREER_HUBS,
  ...DK_CAREER_HUBS,
  ...NO_CAREER_HUBS,
  ...SE_CAREER_HUBS,
  ...FI_CAREER_HUBS,
  ...CH_CAREER_HUBS,
  ...AT_CAREER_HUBS,
  ...PL_CAREER_HUBS,
  ...CZ_CAREER_HUBS,
  ...SK_CAREER_HUBS,
  ...HU_CAREER_HUBS,
  ...EE_CAREER_HUBS,
  ...LV_CAREER_HUBS,
  ...LT_CAREER_HUBS,
  ...HR_CAREER_HUBS,
  ...SI_CAREER_HUBS,
  ...RO_CAREER_HUBS,
  ...BG_CAREER_HUBS,
  ...GR_CAREER_HUBS,
  ...RS_CAREER_HUBS,
  ...IS_CAREER_HUBS,
  ...BA_CAREER_HUBS,
  ...ME_CAREER_HUBS,
  ...AL_CAREER_HUBS,
  ...MK_CAREER_HUBS,
  ...TR_CAREER_HUBS,
  ...UA_CAREER_HUBS,
  ...BY_CAREER_HUBS,
  ...MD_CAREER_HUBS,
  ...GE_CAREER_HUBS,
  ...AM_CAREER_HUBS,
  ...AZ_CAREER_HUBS,
  ...LU_CAREER_HUBS,
  ...MT_CAREER_HUBS,
  ...CY_CAREER_HUBS,
  ...XK_CAREER_HUBS,
  ...MA_CAREER_HUBS,
  ...DZ_CAREER_HUBS,
  ...TN_CAREER_HUBS,
  ...EG_CAREER_HUBS,
  ...IL_CAREER_HUBS,
  ...SA_CAREER_HUBS,
  ...AE_CAREER_HUBS,
  ...QA_CAREER_HUBS,
  ...BH_CAREER_HUBS,
  ...KW_CAREER_HUBS,
  ...OM_CAREER_HUBS,
  ...IQ_CAREER_HUBS,
  ...IR_CAREER_HUBS,
  ...JO_CAREER_HUBS,
  ...LB_CAREER_HUBS,
  ...SY_CAREER_HUBS,
  ...LY_CAREER_HUBS,
  ...SD_CAREER_HUBS,
  ...YE_CAREER_HUBS,
  ...PK_CAREER_HUBS,
  ...IN_CAREER_HUBS,
  ...LK_CAREER_HUBS,
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
