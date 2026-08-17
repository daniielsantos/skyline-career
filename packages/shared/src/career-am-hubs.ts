/**
 * Armenia career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AmCareerRegion = 'AM-C';

export type AmCareerHubDef = {
  icao: string;
  name: string;
  region: AmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Armenia hubs. */
export const AM_CAREER_HUBS: readonly AmCareerHubDef[] = [
  {
    icao: 'UDYZ',
    name: 'Yerevan Zvartnots',
    region: 'AM-C',
    hubTier: 'major',
    lat: 40.1473,
    lon: 44.3959,
    produce: { electronics: 1.2, general: 1.25, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'UDLS',
    name: 'Gyumri Shirak',
    region: 'AM-C',
    hubTier: 'spoke',
    lat: 40.7504,
    lon: 43.8593,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const AM_CAREER_HUB_COUNT = 2;

export function buildAmFeederCorridors(
  hubs: readonly AmCareerHubDef[] = AM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAmCareerHubCatalog(): void {
  if (AM_CAREER_HUBS.length !== AM_CAREER_HUB_COUNT) {
    throw new Error(
      `AM_CAREER_HUBS length ${AM_CAREER_HUBS.length} !== ${AM_CAREER_HUB_COUNT}`,
    );
  }
  if (!AM_CAREER_HUBS.some((h) => h.icao === 'UDYZ' && h.hubTier === 'major')) {
    throw new Error('AM catalog must include major UDYZ');
  }
}
