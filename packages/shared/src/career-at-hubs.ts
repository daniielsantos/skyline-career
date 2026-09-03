/**
 * Austria career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { AT_DENSIFY_HUBS, AT_DENSIFY_HUB_COUNT } from './career-at-hubs-densify.js';

export type AtCareerRegion = 'AT-E' | 'AT-W';

export type AtCareerHubDef = {
  icao: string;
  name: string;
  region: AtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const alpine = {
  produce: { perishables: 1.3, general: 1.15, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const industrial = {
  produce: { machinery: 1.3, electronics: 1.15, general: 1.2 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Austria hubs. */
export const AT_CAREER_HUBS: readonly AtCareerHubDef[] = [
  {
    icao: 'LOWW',
    name: 'Vienna',
    region: 'AT-E',
    hubTier: 'major',
    lat: 48.1103,
    lon: 16.5697,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LOWL',
    name: 'Linz',
    region: 'AT-E',
    hubTier: 'regional',
    lat: 48.2332,
    lon: 14.1875,
    ...industrial,
  },
  {
    icao: 'LOWG',
    name: 'Graz',
    region: 'AT-E',
    hubTier: 'spoke',
    lat: 46.9911,
    lon: 15.4396,
    ...industrial,
  },
  {
    icao: 'LOWI',
    name: 'Innsbruck',
    region: 'AT-W',
    hubTier: 'regional',
    lat: 47.2602,
    lon: 11.3439,
    ...alpine,
  },
  {
    icao: 'LOWS',
    name: 'Salzburg',
    region: 'AT-W',
    hubTier: 'regional',
    lat: 47.7933,
    lon: 13.0043,
    produce: { general: 1.25, perishables: 1.2, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LOWK',
    name: 'Klagenfurt',
    region: 'AT-W',
    hubTier: 'spoke',
    lat: 46.6425,
    lon: 14.3377,
    ...alpine,
  },
  ...AT_DENSIFY_HUBS,
];

export const AT_CAREER_HUB_COUNT = 6 + AT_DENSIFY_HUB_COUNT;

export function buildAtFeederCorridors(
  hubs: readonly AtCareerHubDef[] = AT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAtCareerHubCatalog(): void {
  if (AT_CAREER_HUBS.length !== AT_CAREER_HUB_COUNT) {
    throw new Error(
      `AT_CAREER_HUBS length ${AT_CAREER_HUBS.length} !== ${AT_CAREER_HUB_COUNT}`,
    );
  }
  if (!AT_CAREER_HUBS.some((h) => h.icao === 'LOWW' && h.hubTier === 'major')) {
    throw new Error('AT catalog must include major LOWW');
  }
}
