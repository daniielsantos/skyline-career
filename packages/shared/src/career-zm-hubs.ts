/**
 * Zambia career hub catalog — AF-3 Sub-Saharan leftovers.
 * Landlocked — no seaport pickup.
 *
 * Lusaka cargo major is FLKK Kenneth Kaunda (not legacy FLLS).
 * Ndola civil FLSK / old FLND omitted (FLND is now an air-force field).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ZmCareerRegion = 'ZM-C';

export type ZmCareerHubDef = {
  icao: string;
  name: string;
  region: ZmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Zambia hub. Lusaka is FLKK (not FLLS). */
export const ZM_CAREER_HUBS: readonly ZmCareerHubDef[] = [
  {
    icao: 'FLKK',
    name: 'Lusaka Kenneth Kaunda',
    region: 'ZM-C',
    hubTier: 'major',
    lat: -15.3308,
    lon: 28.4527,
    produce: { general: 1.35, electronics: 1.2, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
];

export const ZM_CAREER_HUB_COUNT = 1;

export function buildZmFeederCorridors(
  hubs: readonly ZmCareerHubDef[] = ZM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertZmCareerHubCatalog(): void {
  if (ZM_CAREER_HUBS.length !== ZM_CAREER_HUB_COUNT) {
    throw new Error(
      `ZM_CAREER_HUBS length ${ZM_CAREER_HUBS.length} !== ${ZM_CAREER_HUB_COUNT}`,
    );
  }
  if (!ZM_CAREER_HUBS.some((h) => h.icao === 'FLKK' && h.hubTier === 'major')) {
    throw new Error('ZM catalog must include major FLKK (Kenneth Kaunda)');
  }
  if (ZM_CAREER_HUBS.some((h) => h.icao === 'FLLS')) {
    throw new Error('ZM catalog must use FLKK for Lusaka, not legacy FLLS');
  }
  if (ZM_CAREER_HUBS.some((h) => h.icao === 'FLND' || h.icao === 'FLSK')) {
    throw new Error('ZM catalog skips Ndola (FLND is AFB; FLSK may lack stock MSFS)');
  }
}
