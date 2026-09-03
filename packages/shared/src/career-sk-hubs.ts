/**
 * Slovakia career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { SK_DENSIFY_HUBS, SK_DENSIFY_HUB_COUNT } from './career-sk-hubs-densify.js';

export type SkCareerRegion = 'SK-C';

export type SkCareerHubDef = {
  icao: string;
  name: string;
  region: SkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Slovakia hubs. */
export const SK_CAREER_HUBS: readonly SkCareerHubDef[] = [
  {
    icao: 'LZIB',
    name: 'Bratislava',
    region: 'SK-C',
    hubTier: 'major',
    lat: 48.1702,
    lon: 17.2127,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LZKZ',
    name: 'Kosice',
    region: 'SK-C',
    hubTier: 'regional',
    lat: 48.6631,
    lon: 21.2411,
    produce: { machinery: 1.2, general: 1.2, electronics: 1.05 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'LZTT',
    name: 'Poprad Tatry',
    region: 'SK-C',
    hubTier: 'spoke',
    lat: 49.0736,
    lon: 20.2411,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LZPP',
    name: 'Piestany',
    region: 'SK-C',
    hubTier: 'spoke',
    lat: 48.6252,
    lon: 17.8284,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  ...SK_DENSIFY_HUBS,
];

export const SK_CAREER_HUB_COUNT = 4 + SK_DENSIFY_HUB_COUNT;

export function buildSkFeederCorridors(
  hubs: readonly SkCareerHubDef[] = SK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSkCareerHubCatalog(): void {
  if (SK_CAREER_HUBS.length !== SK_CAREER_HUB_COUNT) {
    throw new Error(
      `SK_CAREER_HUBS length ${SK_CAREER_HUBS.length} !== ${SK_CAREER_HUB_COUNT}`,
    );
  }
  if (!SK_CAREER_HUBS.some((h) => h.icao === 'LZIB' && h.hubTier === 'major')) {
    throw new Error('SK catalog must include major LZIB');
  }
}
