/**
 * Gambia career hub catalog — AF-5 West Africa leftovers.
 *
 * Banjul cargo major is GBYD. Island-adjacent hop to Dakar GOOY.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GmCareerRegion = 'GM-W';

export type GmCareerHubDef = {
  icao: string;
  name: string;
  region: GmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Gambia hub. Banjul is GBYD. */
export const GM_CAREER_HUBS: readonly GmCareerHubDef[] = [
  {
    icao: 'GBYD',
    name: 'Banjul International',
    region: 'GM-W',
    hubTier: 'major',
    lat: 13.338,
    lon: -16.6522,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const GM_CAREER_HUB_COUNT = 1;

export function buildGmFeederCorridors(
  hubs: readonly GmCareerHubDef[] = GM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGmCareerHubCatalog(): void {
  if (GM_CAREER_HUBS.length !== GM_CAREER_HUB_COUNT) {
    throw new Error(
      `GM_CAREER_HUBS length ${GM_CAREER_HUBS.length} !== ${GM_CAREER_HUB_COUNT}`,
    );
  }
  if (!GM_CAREER_HUBS.some((h) => h.icao === 'GBYD' && h.hubTier === 'major')) {
    throw new Error('GM catalog must include major GBYD (Banjul)');
  }
}
