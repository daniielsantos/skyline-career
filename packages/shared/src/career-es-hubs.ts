/**
 * Spain career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type EsCareerRegion = 'ES-N' | 'ES-C' | 'ES-S' | 'ES-E' | 'ES-CN';

export type EsCareerHubDef = {
  icao: string;
  name: string;
  region: EsCareerRegion;
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
  produce: { machinery: 1.35, electronics: 1.15, general: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 15 curated Spain hubs (mainland + Canary Islands). */
export const ES_CAREER_HUBS: readonly EsCareerHubDef[] = [
  {
    icao: 'LEBB',
    name: 'Bilbao',
    region: 'ES-N',
    hubTier: 'regional',
    lat: 43.3011,
    lon: -2.91061,
    ...industrial,
  },
  {
    icao: 'LEVX',
    name: 'Vigo',
    region: 'ES-N',
    hubTier: 'regional',
    lat: 42.2318,
    lon: -8.62677,
    produce: { perishables: 1.3, general: 1.15, machinery: 1.05 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LECO',
    name: 'A Coruna',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 43.3021,
    lon: -8.37726,
    ...agro,
  },
  {
    icao: 'LEAS',
    name: 'Asturias',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 43.5636,
    lon: -6.03462,
    ...industrial,
  },
  {
    icao: 'LEMD',
    name: 'Madrid Barajas',
    region: 'ES-C',
    hubTier: 'major',
    lat: 40.4936,
    lon: -3.56676,
    produce: { general: 1.5, electronics: 1.35, machinery: 1.2 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.05 },
  },
  {
    icao: 'LEDA',
    name: 'Lleida Alguaire',
    region: 'ES-C',
    hubTier: 'regional',
    lat: 41.7282,
    lon: 0.535023,
    ...industrial,
  },
  {
    icao: 'LEVD',
    name: 'Valladolid',
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 41.7061,
    lon: -4.85194,
    ...city,
  },
  {
    icao: 'LEMG',
    name: 'Malaga',
    region: 'ES-S',
    hubTier: 'regional',
    lat: 36.6749,
    lon: -4.49911,
    produce: { perishables: 1.25, general: 1.25, electronics: 1.05 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LEZL',
    name: 'Sevilla',
    region: 'ES-S',
    hubTier: 'regional',
    lat: 37.418,
    lon: -5.89311,
    produce: { general: 1.25, machinery: 1.15, perishables: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'LEGR',
    name: 'Granada',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 37.1887,
    lon: -3.77736,
    ...agro,
  },
  {
    icao: 'LERT',
    name: 'Jerez',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 36.7446,
    lon: -6.06011,
    ...agro,
  },
  {
    icao: 'LEBL',
    name: 'Barcelona El Prat',
    region: 'ES-E',
    hubTier: 'major',
    lat: 41.2971,
    lon: 2.07846,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'LEAL',
    name: 'Alicante',
    region: 'ES-E',
    hubTier: 'regional',
    lat: 38.2822,
    lon: -0.558156,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LEPA',
    name: 'Palma de Mallorca',
    region: 'ES-E',
    hubTier: 'regional',
    lat: 39.5517,
    lon: 2.73881,
    produce: { general: 1.2, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 0.95 },
  },
  {
    icao: 'GCLP',
    name: 'Gran Canaria',
    region: 'ES-CN',
    hubTier: 'major',
    lat: 27.9319,
    lon: -15.3866,
    produce: { perishables: 1.3, general: 1.25, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.2 },
  },
];

export const ES_CAREER_HUB_COUNT = 15;

export function buildEsFeederCorridors(
  hubs: readonly EsCareerHubDef[] = ES_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertEsCareerHubCatalog(): void {
  if (ES_CAREER_HUBS.length !== ES_CAREER_HUB_COUNT) {
    throw new Error(
      `ES_CAREER_HUBS length ${ES_CAREER_HUBS.length} !== ${ES_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['LEMD', 'LEBL', 'GCLP'] as const) {
    if (!ES_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`ES catalog must include major ${icao}`);
    }
  }
  if (ES_CAREER_HUBS.some((h) => h.icao === 'GCTS')) {
    throw new Error('ES catalog must use GCLP for Canaries cargo, not GCTS Tenerife');
  }
}
