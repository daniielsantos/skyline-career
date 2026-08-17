/**
 * Finland career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type FiCareerRegion = 'FI-S' | 'FI-N';

export type FiCareerHubDef = {
  icao: string;
  name: string;
  region: FiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const forest = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Finland hubs. */
export const FI_CAREER_HUBS: readonly FiCareerHubDef[] = [
  {
    icao: 'EFHK',
    name: 'Helsinki Vantaa',
    region: 'FI-S',
    hubTier: 'major',
    lat: 60.3172,
    lon: 24.9633,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EFTU',
    name: 'Turku',
    region: 'FI-S',
    hubTier: 'regional',
    lat: 60.5141,
    lon: 22.2628,
    produce: { general: 1.25, machinery: 1.15, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EFVA',
    name: 'Vaasa',
    region: 'FI-S',
    hubTier: 'spoke',
    lat: 63.0507,
    lon: 21.7622,
    ...forest,
  },
  {
    icao: 'EFJY',
    name: 'Jyvaskyla',
    region: 'FI-S',
    hubTier: 'spoke',
    lat: 62.3995,
    lon: 25.6783,
    ...forest,
  },
  {
    icao: 'EFRO',
    name: 'Rovaniemi',
    region: 'FI-N',
    hubTier: 'regional',
    lat: 66.5648,
    lon: 25.8304,
    produce: { perishables: 1.2, general: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.05 },
  },
  {
    icao: 'EFKU',
    name: 'Kuopio',
    region: 'FI-N',
    hubTier: 'spoke',
    lat: 63.0071,
    lon: 27.7978,
    ...forest,
  },
];

export const FI_CAREER_HUB_COUNT = 6;

export function buildFiFeederCorridors(
  hubs: readonly FiCareerHubDef[] = FI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertFiCareerHubCatalog(): void {
  if (FI_CAREER_HUBS.length !== FI_CAREER_HUB_COUNT) {
    throw new Error(
      `FI_CAREER_HUBS length ${FI_CAREER_HUBS.length} !== ${FI_CAREER_HUB_COUNT}`,
    );
  }
  if (!FI_CAREER_HUBS.some((h) => h.icao === 'EFHK' && h.hubTier === 'major')) {
    throw new Error('FI catalog must include major EFHK');
  }
}
