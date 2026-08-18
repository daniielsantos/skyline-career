/**
 * Guinea career hub catalog — AF-5 West Africa leftovers.
 *
 * Conakry cargo major is GUCY Ahmed Sékou Touré.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GnCareerRegion = 'GN-W';

export type GnCareerHubDef = {
  icao: string;
  name: string;
  region: GnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Guinea hub. Conakry is GUCY. */
export const GN_CAREER_HUBS: readonly GnCareerHubDef[] = [
  {
    icao: 'GUCY',
    name: 'Conakry Ahmed Sékou Touré',
    region: 'GN-W',
    hubTier: 'major',
    lat: 9.5769,
    lon: -13.612,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.15 },
  },
];

export const GN_CAREER_HUB_COUNT = 1;

export function buildGnFeederCorridors(
  hubs: readonly GnCareerHubDef[] = GN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGnCareerHubCatalog(): void {
  if (GN_CAREER_HUBS.length !== GN_CAREER_HUB_COUNT) {
    throw new Error(
      `GN_CAREER_HUBS length ${GN_CAREER_HUBS.length} !== ${GN_CAREER_HUB_COUNT}`,
    );
  }
  if (!GN_CAREER_HUBS.some((h) => h.icao === 'GUCY' && h.hubTier === 'major')) {
    throw new Error('GN catalog must include major GUCY (Conakry)');
  }
}
