/**
 * Vanuatu career hub catalog — Asia-17 leftover Pacific face.
 *
 * Port Vila cargo major is NVVV Bauerfield (not Santo NVSS).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type VuCareerRegion = 'VU-C';

export type VuCareerHubDef = {
  icao: string;
  name: string;
  region: VuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Vanuatu hub. Port Vila seaport pickup is NVVV. */
export const VU_CAREER_HUBS: readonly VuCareerHubDef[] = [
  {
    icao: 'NVVV',
    name: 'Port Vila Bauerfield',
    region: 'VU-C',
    hubTier: 'major',
    lat: -17.6993,
    lon: 168.32,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
];

export const VU_CAREER_HUB_COUNT = 1;

export function buildVuFeederCorridors(
  hubs: readonly VuCareerHubDef[] = VU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVuCareerHubCatalog(): void {
  if (VU_CAREER_HUBS.length !== VU_CAREER_HUB_COUNT) {
    throw new Error(
      `VU_CAREER_HUBS length ${VU_CAREER_HUBS.length} !== ${VU_CAREER_HUB_COUNT}`,
    );
  }
  if (!VU_CAREER_HUBS.some((h) => h.icao === 'NVVV' && h.hubTier === 'major')) {
    throw new Error('VU catalog must include major NVVV (Bauerfield)');
  }
  if (VU_CAREER_HUBS.some((h) => h.icao === 'NVSS')) {
    throw new Error('VU catalog must not seed NVSS Santo as the cargo major');
  }
}
