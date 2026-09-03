/**
 * Ireland career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { IE_DENSIFY_HUBS, IE_DENSIFY_HUB_COUNT } from './career-ie-hubs-densify.js';

export type IeCareerRegion = 'IE-E' | 'IE-W';

export type IeCareerHubDef = {
  icao: string;
  name: string;
  region: IeCareerRegion;
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
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Ireland hubs. */
export const IE_CAREER_HUBS: readonly IeCareerHubDef[] = [
  {
    icao: 'EIDW',
    name: 'Dublin',
    region: 'IE-E',
    hubTier: 'major',
    lat: 53.4213,
    lon: -6.27007,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'EICK',
    name: 'Cork',
    region: 'IE-E',
    hubTier: 'regional',
    lat: 51.8413,
    lon: -8.49111,
    produce: { perishables: 1.25, general: 1.2, electronics: 1.05 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'EIWF',
    name: 'Waterford',
    region: 'IE-E',
    hubTier: 'spoke',
    lat: 52.1872,
    lon: -7.08696,
    ...agro,
  },
  {
    icao: 'EINN',
    name: 'Shannon',
    region: 'IE-W',
    hubTier: 'regional',
    lat: 52.702,
    lon: -8.92482,
    produce: { general: 1.25, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EIKN',
    name: 'Ireland West Knock',
    region: 'IE-W',
    hubTier: 'spoke',
    lat: 53.9103,
    lon: -8.81111,
    ...city,
  },
  ...IE_DENSIFY_HUBS,
];

export const IE_CAREER_HUB_COUNT = 5 + IE_DENSIFY_HUB_COUNT;

export function buildIeFeederCorridors(
  hubs: readonly IeCareerHubDef[] = IE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIeCareerHubCatalog(): void {
  if (IE_CAREER_HUBS.length !== IE_CAREER_HUB_COUNT) {
    throw new Error(
      `IE_CAREER_HUBS length ${IE_CAREER_HUBS.length} !== ${IE_CAREER_HUB_COUNT}`,
    );
  }
  if (!IE_CAREER_HUBS.some((h) => h.icao === 'EIDW' && h.hubTier === 'major')) {
    throw new Error('IE catalog must include major EIDW');
  }
}
