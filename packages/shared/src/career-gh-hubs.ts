/**
 * Ghana career hub catalog — AF-1 Sub-Saharan core (Gulf of Guinea face).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GhCareerRegion = 'GH-C';

export type GhCareerHubDef = {
  icao: string;
  name: string;
  region: GhCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Ghana hubs. Accra cargo major is DGAA Kotoka. */
export const GH_CAREER_HUBS: readonly GhCareerHubDef[] = [
  {
    icao: 'DGAA',
    name: 'Accra Kotoka',
    region: 'GH-C',
    hubTier: 'major',
    lat: 5.6052,
    lon: -0.1668,
    produce: { general: 1.35, electronics: 1.2, perishables: 1.25 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'DGSI',
    name: 'Kumasi',
    region: 'GH-C',
    hubTier: 'regional',
    lat: 6.7146,
    lon: -1.5908,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const GH_CAREER_HUB_COUNT = 2;

export function buildGhFeederCorridors(
  hubs: readonly GhCareerHubDef[] = GH_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGhCareerHubCatalog(): void {
  if (GH_CAREER_HUBS.length !== GH_CAREER_HUB_COUNT) {
    throw new Error(
      `GH_CAREER_HUBS length ${GH_CAREER_HUBS.length} !== ${GH_CAREER_HUB_COUNT}`,
    );
  }
  if (!GH_CAREER_HUBS.some((h) => h.icao === 'DGAA' && h.hubTier === 'major')) {
    throw new Error('GH catalog must include major DGAA (Kotoka)');
  }
  if (!GH_CAREER_HUBS.some((h) => h.icao === 'DGSI')) {
    throw new Error('GH catalog must include DGSI Kumasi (inland)');
  }
}
