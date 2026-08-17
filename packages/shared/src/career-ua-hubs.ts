/**
 * Ukraine career hub catalog — EU-7 East.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type UaCareerRegion = 'UA-W' | 'UA-C' | 'UA-E';

export type UaCareerHubDef = {
  icao: string;
  name: string;
  region: UaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 6 curated Ukraine hubs. */
export const UA_CAREER_HUBS: readonly UaCareerHubDef[] = [
  {
    icao: 'UKBB',
    name: 'Kyiv Boryspil',
    region: 'UA-C',
    hubTier: 'major',
    lat: 50.345,
    lon: 30.8947,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'UKKK',
    name: 'Kyiv Zhuliany',
    region: 'UA-C',
    hubTier: 'regional',
    lat: 50.4017,
    lon: 30.4497,
    produce: { electronics: 1.2, general: 1.25, supplies: 1.05 },
    consume: { perishables: 1.1, machinery: 0.95 },
  },
  {
    icao: 'UKLL',
    name: 'Lviv',
    region: 'UA-W',
    hubTier: 'regional',
    lat: 49.8125,
    lon: 23.9561,
    produce: { general: 1.25, machinery: 1.15, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'UKOO',
    name: 'Odesa',
    region: 'UA-W',
    hubTier: 'regional',
    lat: 46.4268,
    lon: 30.6765,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'UKHH',
    name: 'Kharkiv',
    region: 'UA-E',
    hubTier: 'regional',
    lat: 49.9248,
    lon: 36.29,
    produce: { machinery: 1.25, general: 1.25, electronics: 1.15 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'UKDD',
    name: 'Dnipro',
    region: 'UA-E',
    hubTier: 'spoke',
    lat: 48.3572,
    lon: 35.1006,
    produce: { machinery: 1.2, general: 1.2, supplies: 1.0 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
];

export const UA_CAREER_HUB_COUNT = 6;

export function buildUaFeederCorridors(
  hubs: readonly UaCareerHubDef[] = UA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertUaCareerHubCatalog(): void {
  if (UA_CAREER_HUBS.length !== UA_CAREER_HUB_COUNT) {
    throw new Error(
      `UA_CAREER_HUBS length ${UA_CAREER_HUBS.length} !== ${UA_CAREER_HUB_COUNT}`,
    );
  }
  if (!UA_CAREER_HUBS.some((h) => h.icao === 'UKBB' && h.hubTier === 'major')) {
    throw new Error('UA catalog must include major UKBB');
  }
}
