/**
 * Benin career hub catalog — AF-5 West Africa leftovers.
 *
 * Cotonou cargo major is DBBB Cadjehoun.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BjCareerRegion = 'BJ-S';

export type BjCareerHubDef = {
  icao: string;
  name: string;
  region: BjCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Benin hub. Cotonou is DBBB. */
export const BJ_CAREER_HUBS: readonly BjCareerHubDef[] = [
  {
    icao: 'DBBB',
    name: 'Cotonou Cadjehoun',
    region: 'BJ-S',
    hubTier: 'major',
    lat: 6.3572,
    lon: 2.3844,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.15 },
  },
];

export const BJ_CAREER_HUB_COUNT = 1;

export function buildBjFeederCorridors(
  hubs: readonly BjCareerHubDef[] = BJ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBjCareerHubCatalog(): void {
  if (BJ_CAREER_HUBS.length !== BJ_CAREER_HUB_COUNT) {
    throw new Error(
      `BJ_CAREER_HUBS length ${BJ_CAREER_HUBS.length} !== ${BJ_CAREER_HUB_COUNT}`,
    );
  }
  if (!BJ_CAREER_HUBS.some((h) => h.icao === 'DBBB' && h.hubTier === 'major')) {
    throw new Error('BJ catalog must include major DBBB (Cadjehoun)');
  }
}
