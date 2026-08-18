/**
 * Guinea-Bissau career hub catalog — AF-5 West Africa leftovers.
 *
 * Bissau cargo major is GGOV Osvaldo Vieira.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GwCareerRegion = 'GW-C';

export type GwCareerHubDef = {
  icao: string;
  name: string;
  region: GwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Guinea-Bissau hub. Bissau is GGOV. */
export const GW_CAREER_HUBS: readonly GwCareerHubDef[] = [
  {
    icao: 'GGOV',
    name: 'Bissau Osvaldo Vieira',
    region: 'GW-C',
    hubTier: 'major',
    lat: 11.8943,
    lon: -15.6536,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.15 },
  },
];

export const GW_CAREER_HUB_COUNT = 1;

export function buildGwFeederCorridors(
  hubs: readonly GwCareerHubDef[] = GW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGwCareerHubCatalog(): void {
  if (GW_CAREER_HUBS.length !== GW_CAREER_HUB_COUNT) {
    throw new Error(
      `GW_CAREER_HUBS length ${GW_CAREER_HUBS.length} !== ${GW_CAREER_HUB_COUNT}`,
    );
  }
  if (!GW_CAREER_HUBS.some((h) => h.icao === 'GGOV' && h.hubTier === 'major')) {
    throw new Error('GW catalog must include major GGOV (Bissau)');
  }
}
