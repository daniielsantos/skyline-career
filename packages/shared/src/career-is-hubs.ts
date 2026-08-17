/**
 * Iceland career hub catalog — EU-5 North Atlantic.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type IsCareerRegion = 'IS-SW' | 'IS-NE';

export type IsCareerHubDef = {
  icao: string;
  name: string;
  region: IsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Iceland hubs. */
export const IS_CAREER_HUBS: readonly IsCareerHubDef[] = [
  {
    icao: 'BIKF',
    name: 'Keflavik',
    region: 'IS-SW',
    hubTier: 'major',
    lat: 63.985,
    lon: -22.6056,
    produce: { electronics: 1.25, general: 1.35, machinery: 1.1 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'BIRK',
    name: 'Reykjavik',
    region: 'IS-SW',
    hubTier: 'regional',
    lat: 64.13,
    lon: -21.9406,
    produce: { general: 1.25, electronics: 1.1, supplies: 1.05 },
    consume: { perishables: 1.15, machinery: 0.95 },
  },
  {
    icao: 'BIAR',
    name: 'Akureyri',
    region: 'IS-NE',
    hubTier: 'regional',
    lat: 65.66,
    lon: -18.0727,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'BIEG',
    name: 'Egilsstadir',
    region: 'IS-NE',
    hubTier: 'spoke',
    lat: 65.2833,
    lon: -14.4014,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const IS_CAREER_HUB_COUNT = 4;

export function buildIsFeederCorridors(
  hubs: readonly IsCareerHubDef[] = IS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIsCareerHubCatalog(): void {
  if (IS_CAREER_HUBS.length !== IS_CAREER_HUB_COUNT) {
    throw new Error(
      `IS_CAREER_HUBS length ${IS_CAREER_HUBS.length} !== ${IS_CAREER_HUB_COUNT}`,
    );
  }
  if (!IS_CAREER_HUBS.some((h) => h.icao === 'BIKF' && h.hubTier === 'major')) {
    throw new Error('IS catalog must include major BIKF');
  }
}
