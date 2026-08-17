/**
 * Sweden career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SeCareerRegion = 'SE-S' | 'SE-N';

export type SeCareerHubDef = {
  icao: string;
  name: string;
  region: SeCareerRegion;
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

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 8 curated Sweden hubs. */
export const SE_CAREER_HUBS: readonly SeCareerHubDef[] = [
  {
    icao: 'ESSA',
    name: 'Stockholm Arlanda',
    region: 'SE-S',
    hubTier: 'major',
    lat: 59.6519,
    lon: 17.9186,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'ESSB',
    name: 'Stockholm Bromma',
    region: 'SE-S',
    hubTier: 'regional',
    lat: 59.3544,
    lon: 17.9416,
    produce: { general: 1.25, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 1.0, supplies: 1.0 },
  },
  {
    icao: 'ESGG',
    name: 'Gothenburg Landvetter',
    region: 'SE-S',
    hubTier: 'regional',
    lat: 57.6628,
    lon: 12.2798,
    ...industrial,
  },
  {
    icao: 'ESKN',
    name: 'Stockholm Skavsta',
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 58.7886,
    lon: 16.9122,
    produce: { general: 1.15, electronics: 1.05, supplies: 1.0 },
    consume: { perishables: 1.05, machinery: 0.9 },
  },
  {
    icao: 'ESMX',
    name: 'Kalmar',
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 56.6853,
    lon: 16.2876,
    ...agro,
  },
  {
    icao: 'ESDF',
    name: 'Ronneby',
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 56.2667,
    lon: 15.265,
    ...agro,
  },
  {
    icao: 'ESPA',
    name: 'Lulea',
    region: 'SE-N',
    hubTier: 'regional',
    lat: 65.5436,
    lon: 22.122,
    produce: { machinery: 1.25, general: 1.2, electronics: 1.05 },
    consume: { perishables: 1.1, supplies: 1.05, fuel: 1.0 },
  },
  {
    icao: 'ESNU',
    name: 'Umea',
    region: 'SE-N',
    hubTier: 'spoke',
    lat: 63.7918,
    lon: 20.2828,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const SE_CAREER_HUB_COUNT = 8;

export function buildSeFeederCorridors(
  hubs: readonly SeCareerHubDef[] = SE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSeCareerHubCatalog(): void {
  if (SE_CAREER_HUBS.length !== SE_CAREER_HUB_COUNT) {
    throw new Error(
      `SE_CAREER_HUBS length ${SE_CAREER_HUBS.length} !== ${SE_CAREER_HUB_COUNT}`,
    );
  }
  if (!SE_CAREER_HUBS.some((h) => h.icao === 'ESSA' && h.hubTier === 'major')) {
    throw new Error('SE catalog must include major ESSA');
  }
}
