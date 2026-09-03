/**
 * Italy career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { IT_DENSIFY_HUBS, IT_DENSIFY_HUB_COUNT } from './career-it-hubs-densify.js';

export type ItCareerRegion = 'IT-N' | 'IT-C' | 'IT-S';

export type ItCareerHubDef = {
  icao: string;
  name: string;
  region: ItCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const industrial = {
  produce: { machinery: 1.35, electronics: 1.2, general: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const agro = {
  produce: { perishables: 1.4, general: 1.15, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 12 curated Italy hubs. */
export const IT_CAREER_HUBS: readonly ItCareerHubDef[] = [
  {
    icao: 'LIMC',
    name: 'Milan Malpensa',
    region: 'IT-N',
    hubTier: 'major',
    lat: 45.6306,
    lon: 8.72811,
    produce: { electronics: 1.4, machinery: 1.3, general: 1.4 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'LIML',
    name: 'Milan Linate',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.4451,
    lon: 9.27674,
    produce: { general: 1.25, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 1.0, supplies: 1.0 },
  },
  {
    icao: 'LIME',
    name: 'Bergamo Orio al Serio',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.6739,
    lon: 9.70417,
    ...industrial,
  },
  {
    icao: 'LIPE',
    name: 'Bologna',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 44.5354,
    lon: 11.2887,
    ...industrial,
  },
  {
    icao: 'LIPZ',
    name: 'Venice Marco Polo',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.5053,
    lon: 12.3519,
    produce: { general: 1.25, perishables: 1.2, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.05 },
  },
  {
    icao: 'LIRF',
    name: 'Rome Fiumicino',
    region: 'IT-C',
    hubTier: 'major',
    lat: 41.8003,
    lon: 12.2389,
    produce: { general: 1.45, electronics: 1.3, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LIRA',
    name: 'Rome Ciampino',
    region: 'IT-C',
    hubTier: 'regional',
    lat: 41.7994,
    lon: 12.5949,
    produce: { general: 1.2, perishables: 1.15, electronics: 1.05 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LIRQ',
    name: 'Florence',
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 43.81,
    lon: 11.2051,
    ...agro,
  },
  {
    icao: 'LIRN',
    name: 'Naples Capodichino',
    region: 'IT-S',
    hubTier: 'regional',
    lat: 40.886,
    lon: 14.2908,
    produce: { general: 1.3, perishables: 1.25, machinery: 1.1 },
    consume: { electronics: 1.05, supplies: 1.05 },
  },
  {
    icao: 'LICC',
    name: 'Catania Fontanarossa',
    region: 'IT-S',
    hubTier: 'regional',
    lat: 37.4668,
    lon: 15.0664,
    ...agro,
  },
  {
    icao: 'LICJ',
    name: 'Palermo Punta Raisi',
    region: 'IT-S',
    hubTier: 'regional',
    lat: 38.176,
    lon: 13.091,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LIBD',
    name: 'Bari',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 41.1389,
    lon: 16.7606,
    ...agro,
  },
  ...IT_DENSIFY_HUBS,
];

export const IT_CAREER_HUB_COUNT = 12 + IT_DENSIFY_HUB_COUNT;

export function buildItFeederCorridors(
  hubs: readonly ItCareerHubDef[] = IT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertItCareerHubCatalog(): void {
  if (IT_CAREER_HUBS.length !== IT_CAREER_HUB_COUNT) {
    throw new Error(
      `IT_CAREER_HUBS length ${IT_CAREER_HUBS.length} !== ${IT_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['LIMC', 'LIRF'] as const) {
    if (!IT_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`IT catalog must include major ${icao}`);
    }
  }
}
