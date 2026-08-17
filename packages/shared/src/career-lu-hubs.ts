/**
 * Luxembourg career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LuCareerRegion = 'LU-C';

export type LuCareerHubDef = {
  icao: string;
  name: string;
  region: LuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Luxembourg hub. */
export const LU_CAREER_HUBS: readonly LuCareerHubDef[] = [
  {
    icao: 'ELLX',
    name: 'Luxembourg',
    region: 'LU-C',
    hubTier: 'major',
    lat: 49.6233,
    lon: 6.2044,
    produce: { electronics: 1.35, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.1, supplies: 1.05, general: 1.05 },
  },
];

export const LU_CAREER_HUB_COUNT = 1;

export function buildLuFeederCorridors(
  hubs: readonly LuCareerHubDef[] = LU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLuCareerHubCatalog(): void {
  if (LU_CAREER_HUBS.length !== LU_CAREER_HUB_COUNT) {
    throw new Error(
      `LU_CAREER_HUBS length ${LU_CAREER_HUBS.length} !== ${LU_CAREER_HUB_COUNT}`,
    );
  }
  if (!LU_CAREER_HUBS.some((h) => h.icao === 'ELLX' && h.hubTier === 'major')) {
    throw new Error('LU catalog must include major ELLX');
  }
}
