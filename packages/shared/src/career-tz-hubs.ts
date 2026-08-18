/**
 * Tanzania career hub catalog — AF-1 Sub-Saharan core (East Africa coast).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TzCareerRegion = 'TZ-E' | 'TZ-N';

export type TzCareerHubDef = {
  icao: string;
  name: string;
  region: TzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Tanzania hubs. Dar cargo major is HTDA Julius Nyerere. */
export const TZ_CAREER_HUBS: readonly TzCareerHubDef[] = [
  {
    icao: 'HTDA',
    name: 'Dar es Salaam Julius Nyerere',
    region: 'TZ-E',
    hubTier: 'major',
    lat: -6.8781,
    lon: 39.2026,
    produce: { general: 1.4, perishables: 1.3, machinery: 1.2 },
    consume: { electronics: 1.0, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'HTKJ',
    name: 'Kilimanjaro International',
    region: 'TZ-N',
    hubTier: 'regional',
    lat: -3.4294,
    lon: 37.0745,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const TZ_CAREER_HUB_COUNT = 2;

export function buildTzFeederCorridors(
  hubs: readonly TzCareerHubDef[] = TZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTzCareerHubCatalog(): void {
  if (TZ_CAREER_HUBS.length !== TZ_CAREER_HUB_COUNT) {
    throw new Error(
      `TZ_CAREER_HUBS length ${TZ_CAREER_HUBS.length} !== ${TZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!TZ_CAREER_HUBS.some((h) => h.icao === 'HTDA' && h.hubTier === 'major')) {
    throw new Error('TZ catalog must include major HTDA (Julius Nyerere)');
  }
  if (!TZ_CAREER_HUBS.some((h) => h.icao === 'HTKJ')) {
    throw new Error('TZ catalog must include HTKJ Kilimanjaro');
  }
}
