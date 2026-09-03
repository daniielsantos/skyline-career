/**
 * Belgium career hub catalog — EU-1 Western core (light).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { BE_DENSIFY_HUBS, BE_DENSIFY_HUB_COUNT } from './career-be-hubs-densify.js';

export type BeCareerRegion = 'BE-C';

export type BeCareerHubDef = {
  icao: string;
  name: string;
  region: BeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated + densify Belgium hubs. */
export const BE_CAREER_HUBS: readonly BeCareerHubDef[] = [
  {
    icao: 'EBBR',
    name: 'Brussels',
    region: 'BE-C',
    hubTier: 'major',
    lat: 50.9014,
    lon: 4.48444,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EBAW',
    name: 'Antwerp Deurne',
    region: 'BE-C',
    hubTier: 'regional',
    lat: 51.1894,
    lon: 4.46028,
    produce: { machinery: 1.25, general: 1.25, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EBCI',
    name: 'Brussels South Charleroi',
    region: 'BE-C',
    hubTier: 'regional',
    lat: 50.4592,
    lon: 4.45382,
    produce: { general: 1.2, electronics: 1.1, perishables: 1.05 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  ...BE_DENSIFY_HUBS,
];

export const BE_CAREER_HUB_COUNT = 3 + BE_DENSIFY_HUB_COUNT;

export function buildBeFeederCorridors(
  hubs: readonly BeCareerHubDef[] = BE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBeCareerHubCatalog(): void {
  if (BE_CAREER_HUBS.length !== BE_CAREER_HUB_COUNT) {
    throw new Error(
      `BE_CAREER_HUBS length ${BE_CAREER_HUBS.length} !== ${BE_CAREER_HUB_COUNT}`,
    );
  }
  if (!BE_CAREER_HUBS.some((h) => h.icao === 'EBBR' && h.hubTier === 'major')) {
    throw new Error('BE catalog must include major EBBR');
  }
}
