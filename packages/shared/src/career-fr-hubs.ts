/**
 * France career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type FrCareerRegion = 'FR-N' | 'FR-C' | 'FR-S' | 'FR-E';

export type FrCareerHubDef = {
  icao: string;
  name: string;
  region: FrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const city = {
  produce: { general: 1.2, electronics: 1.05, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agro = {
  produce: { perishables: 1.4, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const industrial = {
  produce: { machinery: 1.35, electronics: 1.2, general: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 14 curated France hubs. */
export const FR_CAREER_HUBS: readonly FrCareerHubDef[] = [
  {
    icao: 'LFPG',
    name: 'Paris Charles de Gaulle',
    region: 'FR-N',
    hubTier: 'major',
    lat: 49.0097,
    lon: 2.54778,
    produce: { electronics: 1.4, general: 1.5, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LFPO',
    name: 'Paris Orly',
    region: 'FR-N',
    hubTier: 'regional',
    lat: 48.7233,
    lon: 2.37944,
    produce: { general: 1.3, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 1.0, supplies: 1.05 },
  },
  {
    icao: 'LFRS',
    name: 'Nantes Atlantique',
    region: 'FR-N',
    hubTier: 'regional',
    lat: 47.1532,
    lon: -1.61073,
    ...industrial,
  },
  {
    icao: 'LFRB',
    name: 'Brest Bretagne',
    region: 'FR-N',
    hubTier: 'spoke',
    lat: 48.4479,
    lon: -4.41854,
    ...city,
  },
  {
    icao: 'LFLL',
    name: 'Lyon Saint-Exupery',
    region: 'FR-C',
    hubTier: 'major',
    lat: 45.7256,
    lon: 5.08111,
    produce: { machinery: 1.3, electronics: 1.25, general: 1.35 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'LFLC',
    name: 'Clermont-Ferrand',
    region: 'FR-C',
    hubTier: 'spoke',
    lat: 45.7867,
    lon: 3.16917,
    ...industrial,
  },
  {
    icao: 'LFLX',
    name: 'Chateauroux Centre',
    region: 'FR-C',
    hubTier: 'spoke',
    lat: 46.8622,
    lon: 1.73067,
    ...agro,
  },
  {
    icao: 'LFML',
    name: 'Marseille Provence',
    region: 'FR-S',
    hubTier: 'major',
    lat: 43.4393,
    lon: 5.22142,
    produce: { general: 1.35, machinery: 1.2, perishables: 1.2 },
    consume: { electronics: 1.1, supplies: 1.05 },
  },
  {
    icao: 'LFBO',
    name: 'Toulouse Blagnac',
    region: 'FR-S',
    hubTier: 'regional',
    lat: 43.6291,
    lon: 1.36382,
    ...industrial,
  },
  {
    icao: 'LFBD',
    name: 'Bordeaux Merignac',
    region: 'FR-S',
    hubTier: 'regional',
    lat: 44.8283,
    lon: -0.715556,
    produce: { perishables: 1.3, general: 1.2, machinery: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'LFMN',
    name: 'Nice Cote d Azur',
    region: 'FR-S',
    hubTier: 'regional',
    lat: 43.6584,
    lon: 7.21587,
    produce: { general: 1.25, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 0.95, supplies: 1.05 },
  },
  {
    icao: 'LFST',
    name: 'Strasbourg',
    region: 'FR-E',
    hubTier: 'regional',
    lat: 48.5383,
    lon: 7.62823,
    ...industrial,
  },
  {
    icao: 'LFSB',
    name: 'Basel-Mulhouse',
    region: 'FR-E',
    hubTier: 'regional',
    lat: 47.5896,
    lon: 7.52991,
    produce: { electronics: 1.25, machinery: 1.2, general: 1.2 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'LFOB',
    name: 'Beauvais Tille',
    region: 'FR-N',
    hubTier: 'spoke',
    lat: 49.4544,
    lon: 2.11278,
    ...city,
  },
];

export const FR_CAREER_HUB_COUNT = 14;

export function buildFrFeederCorridors(
  hubs: readonly FrCareerHubDef[] = FR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertFrCareerHubCatalog(): void {
  if (FR_CAREER_HUBS.length !== FR_CAREER_HUB_COUNT) {
    throw new Error(
      `FR_CAREER_HUBS length ${FR_CAREER_HUBS.length} !== ${FR_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['LFPG', 'LFLL', 'LFML'] as const) {
    if (!FR_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`FR catalog must include major ${icao}`);
    }
  }
}
