/**
 * Sierra Leone career hub catalog — AF-5 West Africa leftovers.
 *
 * Freetown cargo major is GFLL Lungi (not GFHA Hastings).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SlCareerRegion = 'SL-W';

export type SlCareerHubDef = {
  icao: string;
  name: string;
  region: SlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Sierra Leone hub. Freetown is GFLL Lungi (not GFHA). */
export const SL_CAREER_HUBS: readonly SlCareerHubDef[] = [
  {
    icao: 'GFLL',
    name: 'Freetown Lungi',
    region: 'SL-W',
    hubTier: 'major',
    lat: 8.6164,
    lon: -13.1955,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.95, fuel: 1.15 },
  },
];

export const SL_CAREER_HUB_COUNT = 1;

export function buildSlFeederCorridors(
  hubs: readonly SlCareerHubDef[] = SL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSlCareerHubCatalog(): void {
  if (SL_CAREER_HUBS.length !== SL_CAREER_HUB_COUNT) {
    throw new Error(
      `SL_CAREER_HUBS length ${SL_CAREER_HUBS.length} !== ${SL_CAREER_HUB_COUNT}`,
    );
  }
  if (!SL_CAREER_HUBS.some((h) => h.icao === 'GFLL' && h.hubTier === 'major')) {
    throw new Error('SL catalog must include major GFLL (Lungi)');
  }
  if (SL_CAREER_HUBS.some((h) => h.icao === 'GFHA')) {
    throw new Error('SL catalog must use GFLL for Freetown, not GFHA Hastings');
  }
}
