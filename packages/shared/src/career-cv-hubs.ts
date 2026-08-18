/**
 * Cabo Verde career hub catalog — AF-5 West Africa leftovers (Atlantic island hop).
 *
 * Sal cargo major is GVAC Amílcar Cabral — the long-haul Atlantic stop.
 * Skip Praia GVNP (separate island; would need its own fuel hub).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CvCareerRegion = 'CV-N';

export type CvCareerHubDef = {
  icao: string;
  name: string;
  region: CvCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Cabo Verde hub. Sal is GVAC (not GVNP Praia). */
export const CV_CAREER_HUBS: readonly CvCareerHubDef[] = [
  {
    icao: 'GVAC',
    name: 'Sal Amílcar Cabral',
    region: 'CV-N',
    hubTier: 'major',
    lat: 16.7414,
    lon: -22.9494,
    produce: { general: 1.25, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.2 },
  },
];

export const CV_CAREER_HUB_COUNT = 1;

export function buildCvFeederCorridors(
  hubs: readonly CvCareerHubDef[] = CV_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCvCareerHubCatalog(): void {
  if (CV_CAREER_HUBS.length !== CV_CAREER_HUB_COUNT) {
    throw new Error(
      `CV_CAREER_HUBS length ${CV_CAREER_HUBS.length} !== ${CV_CAREER_HUB_COUNT}`,
    );
  }
  if (!CV_CAREER_HUBS.some((h) => h.icao === 'GVAC' && h.hubTier === 'major')) {
    throw new Error('CV catalog must include major GVAC (Sal)');
  }
}
