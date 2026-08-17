/**
 * Switzerland career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ChCareerRegion = 'CH-C';

export type ChCareerHubDef = {
  icao: string;
  name: string;
  region: ChCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const alpine = {
  produce: { general: 1.15, perishables: 1.2, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 1.0, machinery: 0.95, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Switzerland hubs. */
export const CH_CAREER_HUBS: readonly ChCareerHubDef[] = [
  {
    icao: 'LSZH',
    name: 'Zurich',
    region: 'CH-C',
    hubTier: 'major',
    lat: 47.4647,
    lon: 8.54917,
    produce: { electronics: 1.45, general: 1.4, machinery: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LSGG',
    name: 'Geneva',
    region: 'CH-C',
    hubTier: 'regional',
    lat: 46.2381,
    lon: 6.10895,
    produce: { electronics: 1.3, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'LSZB',
    name: 'Bern Belp',
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 46.9122,
    lon: 7.49715,
    ...alpine,
  },
  {
    icao: 'LSZA',
    name: 'Lugano',
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 46.0043,
    lon: 8.91058,
    ...alpine,
  },
  {
    icao: 'LSZR',
    name: 'St Gallen Altenrhein',
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 47.485,
    lon: 9.56077,
    produce: { general: 1.15, electronics: 1.05, supplies: 1.0 },
    consume: { perishables: 1.05, machinery: 0.9 },
  },
];

export const CH_CAREER_HUB_COUNT = 5;

export function buildChFeederCorridors(
  hubs: readonly ChCareerHubDef[] = CH_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertChCareerHubCatalog(): void {
  if (CH_CAREER_HUBS.length !== CH_CAREER_HUB_COUNT) {
    throw new Error(
      `CH_CAREER_HUBS length ${CH_CAREER_HUBS.length} !== ${CH_CAREER_HUB_COUNT}`,
    );
  }
  if (!CH_CAREER_HUBS.some((h) => h.icao === 'LSZH' && h.hubTier === 'major')) {
    throw new Error('CH catalog must include major LSZH');
  }
}
