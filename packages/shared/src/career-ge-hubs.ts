/**
 * Georgia career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GeCareerRegion = 'GE-C';

export type GeCareerHubDef = {
  icao: string;
  name: string;
  region: GeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Georgia hubs. */
export const GE_CAREER_HUBS: readonly GeCareerHubDef[] = [
  {
    icao: 'UGTB',
    name: 'Tbilisi',
    region: 'GE-C',
    hubTier: 'major',
    lat: 41.6692,
    lon: 44.9547,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'UGKO',
    name: 'Kutaisi',
    region: 'GE-C',
    hubTier: 'regional',
    lat: 42.1767,
    lon: 42.4826,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'UGSB',
    name: 'Batumi',
    region: 'GE-C',
    hubTier: 'regional',
    lat: 41.6103,
    lon: 41.5997,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
];

export const GE_CAREER_HUB_COUNT = 3;

export function buildGeFeederCorridors(
  hubs: readonly GeCareerHubDef[] = GE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGeCareerHubCatalog(): void {
  if (GE_CAREER_HUBS.length !== GE_CAREER_HUB_COUNT) {
    throw new Error(
      `GE_CAREER_HUBS length ${GE_CAREER_HUBS.length} !== ${GE_CAREER_HUB_COUNT}`,
    );
  }
  if (!GE_CAREER_HUBS.some((h) => h.icao === 'UGTB' && h.hubTier === 'major')) {
    throw new Error('GE catalog must include major UGTB');
  }
}
