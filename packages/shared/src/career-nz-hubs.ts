/**
 * New Zealand career hub catalog — Asia-14 Tasman Sea face.
 *
 * Auckland cargo major is NZAA (not NZWN Wellington). Christchurch NZCH is
 * the South Island fuel hub. Queenstown NZQN and Dunedin NZDN deferred.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NzCareerRegion = 'NZ-N' | 'NZ-S';

export type NzCareerHubDef = {
  icao: string;
  name: string;
  region: NzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated New Zealand hubs. Auckland seaport pickup is NZAA. */
export const NZ_CAREER_HUBS: readonly NzCareerHubDef[] = [
  {
    icao: 'NZAA',
    name: 'Auckland International',
    region: 'NZ-N',
    hubTier: 'major',
    lat: -37.012,
    lon: 174.7863,
    produce: { electronics: 1.4, general: 1.45, perishables: 1.25 },
    consume: { machinery: 1.1, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'NZCH',
    name: 'Christchurch International',
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -43.489,
    lon: 172.5321,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
];

export const NZ_CAREER_HUB_COUNT = 2;

export function buildNzFeederCorridors(
  hubs: readonly NzCareerHubDef[] = NZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNzCareerHubCatalog(): void {
  if (NZ_CAREER_HUBS.length !== NZ_CAREER_HUB_COUNT) {
    throw new Error(
      `NZ_CAREER_HUBS length ${NZ_CAREER_HUBS.length} !== ${NZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!NZ_CAREER_HUBS.some((h) => h.icao === 'NZAA' && h.hubTier === 'major')) {
    throw new Error('NZ catalog must include major NZAA (Auckland)');
  }
  if (NZ_CAREER_HUBS.some((h) => ['NZWN', 'NZQN', 'NZDN'].includes(h.icao))) {
    throw new Error('NZ catalog must not seed Wellington, Queenstown, or Dunedin');
  }
}
