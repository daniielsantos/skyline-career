/**
 * Montenegro career hub catalog — EU-6 W. Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MeCareerRegion = 'ME-C';

export type MeCareerHubDef = {
  icao: string;
  name: string;
  region: MeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Montenegro hubs. */
export const ME_CAREER_HUBS: readonly MeCareerHubDef[] = [
  {
    icao: 'LYPG',
    name: 'Podgorica',
    region: 'ME-C',
    hubTier: 'major',
    lat: 42.3594,
    lon: 19.2519,
    produce: { general: 1.3, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LYTV',
    name: 'Tivat',
    region: 'ME-C',
    hubTier: 'regional',
    lat: 42.4047,
    lon: 18.7233,
    produce: { perishables: 1.2, general: 1.2, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
];

export const ME_CAREER_HUB_COUNT = 2;

export function buildMeFeederCorridors(
  hubs: readonly MeCareerHubDef[] = ME_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMeCareerHubCatalog(): void {
  if (ME_CAREER_HUBS.length !== ME_CAREER_HUB_COUNT) {
    throw new Error(
      `ME_CAREER_HUBS length ${ME_CAREER_HUBS.length} !== ${ME_CAREER_HUB_COUNT}`,
    );
  }
  if (!ME_CAREER_HUBS.some((h) => h.icao === 'LYPG' && h.hubTier === 'major')) {
    throw new Error('ME catalog must include major LYPG');
  }
}
