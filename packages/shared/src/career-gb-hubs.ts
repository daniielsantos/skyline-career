/**
 * United Kingdom career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GbCareerRegion = 'GB-S' | 'GB-M' | 'GB-N';

export type GbCareerHubDef = {
  icao: string;
  name: string;
  region: GbCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const industrial = {
  produce: { machinery: 1.35, electronics: 1.2, general: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 12 curated UK hubs. */
export const GB_CAREER_HUBS: readonly GbCareerHubDef[] = [
  {
    icao: 'EGLL',
    name: 'London Heathrow',
    region: 'GB-S',
    hubTier: 'major',
    lat: 51.4706,
    lon: -0.461941,
    produce: { electronics: 1.45, general: 1.5, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EGKK',
    name: 'London Gatwick',
    region: 'GB-S',
    hubTier: 'regional',
    lat: 51.1481,
    lon: -0.190278,
    produce: { general: 1.3, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 1.0, supplies: 1.05 },
  },
  {
    icao: 'EGSS',
    name: 'London Stansted',
    region: 'GB-S',
    hubTier: 'regional',
    lat: 51.885,
    lon: 0.235,
    produce: { general: 1.25, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EGHH',
    name: 'Bournemouth',
    region: 'GB-S',
    hubTier: 'spoke',
    lat: 50.78,
    lon: -1.8425,
    ...city,
  },
  {
    icao: 'EGHI',
    name: 'Southampton',
    region: 'GB-S',
    hubTier: 'spoke',
    lat: 50.9503,
    lon: -1.3568,
    produce: { general: 1.15, machinery: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'EGCC',
    name: 'Manchester',
    region: 'GB-M',
    hubTier: 'major',
    lat: 53.3537,
    lon: -2.27495,
    produce: { machinery: 1.3, electronics: 1.25, general: 1.35 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'EGGP',
    name: 'Liverpool John Lennon',
    region: 'GB-M',
    hubTier: 'regional',
    lat: 53.3336,
    lon: -2.84972,
    ...industrial,
  },
  {
    icao: 'EGBB',
    name: 'Birmingham',
    region: 'GB-M',
    hubTier: 'regional',
    lat: 52.4539,
    lon: -1.74803,
    ...industrial,
  },
  {
    icao: 'EGNX',
    name: 'East Midlands',
    region: 'GB-M',
    hubTier: 'spoke',
    lat: 52.8311,
    lon: -1.32806,
    produce: { general: 1.2, machinery: 1.15, electronics: 1.05 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'EGPH',
    name: 'Edinburgh',
    region: 'GB-N',
    hubTier: 'major',
    lat: 55.95,
    lon: -3.3725,
    produce: { general: 1.3, electronics: 1.2, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'EGPF',
    name: 'Glasgow',
    region: 'GB-N',
    hubTier: 'regional',
    lat: 55.8719,
    lon: -4.43306,
    ...industrial,
  },
  {
    icao: 'EGNT',
    name: 'Newcastle',
    region: 'GB-N',
    hubTier: 'regional',
    lat: 55.0375,
    lon: -1.69167,
    produce: { machinery: 1.25, general: 1.2, electronics: 1.05 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
];

export const GB_CAREER_HUB_COUNT = 12;

export function buildGbFeederCorridors(
  hubs: readonly GbCareerHubDef[] = GB_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGbCareerHubCatalog(): void {
  if (GB_CAREER_HUBS.length !== GB_CAREER_HUB_COUNT) {
    throw new Error(
      `GB_CAREER_HUBS length ${GB_CAREER_HUBS.length} !== ${GB_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['EGLL', 'EGCC', 'EGPH'] as const) {
    if (!GB_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`GB catalog must include major ${icao}`);
    }
  }
}
