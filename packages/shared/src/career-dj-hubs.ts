/**
 * Djibouti career hub catalog — AF-7 Horn of Africa.
 *
 * Cargo major is HDAM Ambouli.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type DjCareerRegion = 'DJ-E';

export type DjCareerHubDef = {
  icao: string;
  name: string;
  region: DjCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Djibouti hub. Ambouli is HDAM. */
export const DJ_CAREER_HUBS: readonly DjCareerHubDef[] = [
  {
    icao: 'HDAM',
    name: 'Djibouti-Ambouli',
    region: 'DJ-E',
    hubTier: 'major',
    lat: 11.5473,
    lon: 43.1595,
    produce: { general: 1.3, machinery: 1.2, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.2 },
  },
];

export const DJ_CAREER_HUB_COUNT = 1;

export function buildDjFeederCorridors(
  hubs: readonly DjCareerHubDef[] = DJ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertDjCareerHubCatalog(): void {
  if (DJ_CAREER_HUBS.length !== DJ_CAREER_HUB_COUNT) {
    throw new Error(
      `DJ_CAREER_HUBS length ${DJ_CAREER_HUBS.length} !== ${DJ_CAREER_HUB_COUNT}`,
    );
  }
  if (!DJ_CAREER_HUBS.some((h) => h.icao === 'HDAM' && h.hubTier === 'major')) {
    throw new Error('DJ catalog must include major HDAM (Ambouli)');
  }
}
