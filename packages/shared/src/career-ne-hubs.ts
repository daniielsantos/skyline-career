/**
 * Niger career hub catalog — AF-5 West Africa leftovers.
 * Landlocked — no seaport pickup.
 *
 * Niamey cargo major is DRRN Diori Hamani.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NeCareerRegion = 'NE-W';

export type NeCareerHubDef = {
  icao: string;
  name: string;
  region: NeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Niger hub. Niamey is DRRN. */
export const NE_CAREER_HUBS: readonly NeCareerHubDef[] = [
  {
    icao: 'DRRN',
    name: 'Niamey Diori Hamani',
    region: 'NE-W',
    hubTier: 'major',
    lat: 13.4815,
    lon: 2.1836,
    produce: { general: 1.3, supplies: 1.2, machinery: 1.1 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
];

export const NE_CAREER_HUB_COUNT = 1;

export function buildNeFeederCorridors(
  hubs: readonly NeCareerHubDef[] = NE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNeCareerHubCatalog(): void {
  if (NE_CAREER_HUBS.length !== NE_CAREER_HUB_COUNT) {
    throw new Error(
      `NE_CAREER_HUBS length ${NE_CAREER_HUBS.length} !== ${NE_CAREER_HUB_COUNT}`,
    );
  }
  if (!NE_CAREER_HUBS.some((h) => h.icao === 'DRRN' && h.hubTier === 'major')) {
    throw new Error('NE catalog must include major DRRN (Niamey)');
  }
}
