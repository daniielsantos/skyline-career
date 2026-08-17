/**
 * Lithuania career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LtCareerRegion = 'LT-C';

export type LtCareerHubDef = {
  icao: string;
  name: string;
  region: LtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Lithuania hubs. */
export const LT_CAREER_HUBS: readonly LtCareerHubDef[] = [
  {
    icao: 'EYVI',
    name: 'Vilnius',
    region: 'LT-C',
    hubTier: 'major',
    lat: 54.6341,
    lon: 25.2858,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'EYKA',
    name: 'Kaunas',
    region: 'LT-C',
    hubTier: 'regional',
    lat: 54.9639,
    lon: 24.0848,
    produce: { machinery: 1.2, general: 1.2, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EYPA',
    name: 'Palanga',
    region: 'LT-C',
    hubTier: 'spoke',
    lat: 55.9733,
    lon: 21.0939,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'EYSA',
    name: 'Siauliai',
    region: 'LT-C',
    hubTier: 'spoke',
    lat: 55.8939,
    lon: 23.395,
    produce: { general: 1.15, machinery: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
];

export const LT_CAREER_HUB_COUNT = 4;

export function buildLtFeederCorridors(
  hubs: readonly LtCareerHubDef[] = LT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLtCareerHubCatalog(): void {
  if (LT_CAREER_HUBS.length !== LT_CAREER_HUB_COUNT) {
    throw new Error(
      `LT_CAREER_HUBS length ${LT_CAREER_HUBS.length} !== ${LT_CAREER_HUB_COUNT}`,
    );
  }
  if (!LT_CAREER_HUBS.some((h) => h.icao === 'EYVI' && h.hubTier === 'major')) {
    throw new Error('LT catalog must include major EYVI');
  }
}
