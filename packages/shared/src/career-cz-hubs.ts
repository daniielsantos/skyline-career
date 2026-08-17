/**
 * Czechia career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CzCareerRegion = 'CZ-W' | 'CZ-E';

export type CzCareerHubDef = {
  icao: string;
  name: string;
  region: CzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const industrial = {
  produce: { machinery: 1.3, electronics: 1.2, general: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Czechia hubs. */
export const CZ_CAREER_HUBS: readonly CzCareerHubDef[] = [
  {
    icao: 'LKPR',
    name: 'Prague Vaclav Havel',
    region: 'CZ-W',
    hubTier: 'major',
    lat: 50.1008,
    lon: 14.26,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LKKV',
    name: 'Karlovy Vary',
    region: 'CZ-W',
    hubTier: 'spoke',
    lat: 50.202,
    lon: 12.915,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LKTB',
    name: 'Brno Turany',
    region: 'CZ-E',
    hubTier: 'regional',
    lat: 49.1513,
    lon: 16.6944,
    ...industrial,
  },
  {
    icao: 'LKMT',
    name: 'Ostrava Mosnov',
    region: 'CZ-E',
    hubTier: 'regional',
    lat: 49.6963,
    lon: 18.1111,
    ...industrial,
  },
  {
    icao: 'LKPD',
    name: 'Pardubice',
    region: 'CZ-E',
    hubTier: 'spoke',
    lat: 50.0134,
    lon: 15.7386,
    produce: { general: 1.15, machinery: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
];

export const CZ_CAREER_HUB_COUNT = 5;

export function buildCzFeederCorridors(
  hubs: readonly CzCareerHubDef[] = CZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCzCareerHubCatalog(): void {
  if (CZ_CAREER_HUBS.length !== CZ_CAREER_HUB_COUNT) {
    throw new Error(
      `CZ_CAREER_HUBS length ${CZ_CAREER_HUBS.length} !== ${CZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!CZ_CAREER_HUBS.some((h) => h.icao === 'LKPR' && h.hubTier === 'major')) {
    throw new Error('CZ catalog must include major LKPR');
  }
}
