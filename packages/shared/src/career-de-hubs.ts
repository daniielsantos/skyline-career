/**
 * Germany career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type DeCareerRegion = 'DE-N' | 'DE-W' | 'DE-S' | 'DE-E';

export type DeCareerHubDef = {
  icao: string;
  name: string;
  region: DeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const industrial = {
  produce: { machinery: 1.4, electronics: 1.25, general: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 12 curated Germany hubs. */
export const DE_CAREER_HUBS: readonly DeCareerHubDef[] = [
  {
    icao: 'EDDH',
    name: 'Hamburg',
    region: 'DE-N',
    hubTier: 'major',
    lat: 53.6304,
    lon: 9.98823,
    produce: { machinery: 1.3, general: 1.35, electronics: 1.2 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'EDDW',
    name: 'Bremen',
    region: 'DE-N',
    hubTier: 'regional',
    lat: 53.0475,
    lon: 8.78667,
    ...industrial,
  },
  {
    icao: 'EDDV',
    name: 'Hannover',
    region: 'DE-N',
    hubTier: 'regional',
    lat: 52.4611,
    lon: 9.68508,
    ...industrial,
  },
  {
    icao: 'EDDF',
    name: 'Frankfurt Main',
    region: 'DE-W',
    hubTier: 'major',
    lat: 50.0264,
    lon: 8.54313,
    produce: { electronics: 1.45, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EDDK',
    name: 'Cologne Bonn',
    region: 'DE-W',
    hubTier: 'regional',
    lat: 50.8659,
    lon: 7.14274,
    ...industrial,
  },
  {
    icao: 'EDDL',
    name: 'Dusseldorf',
    region: 'DE-W',
    hubTier: 'regional',
    lat: 51.2895,
    lon: 6.76678,
    produce: { electronics: 1.25, machinery: 1.2, general: 1.25 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EDDM',
    name: 'Munich',
    region: 'DE-S',
    hubTier: 'major',
    lat: 48.3538,
    lon: 11.7861,
    produce: { electronics: 1.4, machinery: 1.3, general: 1.35 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'EDDS',
    name: 'Stuttgart',
    region: 'DE-S',
    hubTier: 'regional',
    lat: 48.6899,
    lon: 9.22196,
    ...industrial,
  },
  {
    icao: 'EDDN',
    name: 'Nuremberg',
    region: 'DE-S',
    hubTier: 'regional',
    lat: 49.4987,
    lon: 11.078,
    ...industrial,
  },
  {
    icao: 'EDDB',
    name: 'Berlin Brandenburg',
    region: 'DE-E',
    hubTier: 'major',
    lat: 52.3514,
    lon: 13.4939,
    produce: { general: 1.4, electronics: 1.3, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1 },
  },
  {
    icao: 'EDDP',
    name: 'Leipzig Halle',
    region: 'DE-E',
    hubTier: 'regional',
    lat: 51.4239,
    lon: 12.2364,
    produce: { general: 1.3, machinery: 1.2, electronics: 1.15 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EDDC',
    name: 'Dresden',
    region: 'DE-E',
    hubTier: 'spoke',
    lat: 51.1328,
    lon: 13.7672,
    ...city,
  },
];

export const DE_CAREER_HUB_COUNT = 12;

export function buildDeFeederCorridors(
  hubs: readonly DeCareerHubDef[] = DE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertDeCareerHubCatalog(): void {
  if (DE_CAREER_HUBS.length !== DE_CAREER_HUB_COUNT) {
    throw new Error(
      `DE_CAREER_HUBS length ${DE_CAREER_HUBS.length} !== ${DE_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['EDDF', 'EDDH', 'EDDM', 'EDDB'] as const) {
    if (!DE_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`DE catalog must include major ${icao}`);
    }
  }
}
