/**
 * Algeria career hub catalog — MENA-1 Mediterranean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type DzCareerRegion = 'DZ-N' | 'DZ-W' | 'DZ-E';

export type DzCareerHubDef = {
  icao: string;
  name: string;
  region: DzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const city = {
  produce: { general: 1.15, electronics: 1.0, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Algeria hubs (Mediterranean coast; Sahara omitted). */
export const DZ_CAREER_HUBS: readonly DzCareerHubDef[] = [
  {
    icao: 'DAAG',
    name: 'Algiers Houari Boumediene',
    region: 'DZ-N',
    hubTier: 'major',
    lat: 36.691,
    lon: 3.2154,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'DAAE',
    name: 'Bejaia Soummam',
    region: 'DZ-N',
    hubTier: 'spoke',
    lat: 36.7119,
    lon: 5.0699,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'DAOO',
    name: 'Oran Ahmed Ben Bella',
    region: 'DZ-W',
    hubTier: 'regional',
    lat: 35.6239,
    lon: -0.6212,
    produce: { machinery: 1.2, general: 1.25, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'DABC',
    name: 'Constantine Mohamed Boudiaf',
    region: 'DZ-E',
    hubTier: 'spoke',
    lat: 36.276,
    lon: 6.6204,
    ...city,
  },
  {
    icao: 'DAAS',
    name: 'Setif 8 May 1945',
    region: 'DZ-E',
    hubTier: 'spoke',
    lat: 36.1781,
    lon: 5.3245,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const DZ_CAREER_HUB_COUNT = 5;

export function buildDzFeederCorridors(
  hubs: readonly DzCareerHubDef[] = DZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertDzCareerHubCatalog(): void {
  if (DZ_CAREER_HUBS.length !== DZ_CAREER_HUB_COUNT) {
    throw new Error(
      `DZ_CAREER_HUBS length ${DZ_CAREER_HUBS.length} !== ${DZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!DZ_CAREER_HUBS.some((h) => h.icao === 'DAAG' && h.hubTier === 'major')) {
    throw new Error('DZ catalog must include major DAAG');
  }
}
