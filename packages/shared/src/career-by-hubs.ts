/**
 * Belarus career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ByCareerRegion = 'BY-C';

export type ByCareerHubDef = {
  icao: string;
  name: string;
  region: ByCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Belarus hubs. */
export const BY_CAREER_HUBS: readonly ByCareerHubDef[] = [
  {
    icao: 'UMMS',
    name: 'Minsk National',
    region: 'BY-C',
    hubTier: 'major',
    lat: 53.8825,
    lon: 28.0307,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'UMBB',
    name: 'Brest',
    region: 'BY-C',
    hubTier: 'regional',
    lat: 52.1083,
    lon: 23.8981,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'UMGG',
    name: 'Gomel',
    region: 'BY-C',
    hubTier: 'spoke',
    lat: 52.527,
    lon: 31.0167,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const BY_CAREER_HUB_COUNT = 3;

export function buildByFeederCorridors(
  hubs: readonly ByCareerHubDef[] = BY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertByCareerHubCatalog(): void {
  if (BY_CAREER_HUBS.length !== BY_CAREER_HUB_COUNT) {
    throw new Error(
      `BY_CAREER_HUBS length ${BY_CAREER_HUBS.length} !== ${BY_CAREER_HUB_COUNT}`,
    );
  }
  if (!BY_CAREER_HUBS.some((h) => h.icao === 'UMMS' && h.hubTier === 'major')) {
    throw new Error('BY catalog must include major UMMS');
  }
}
