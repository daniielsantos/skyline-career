/**
 * New Caledonia career hub catalog — Asia-15 Coral Sea face.
 *
 * Nouméa cargo major is NWWW La Tontouta (not Magenta NWWM).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NcCareerRegion = 'NC-S';

export type NcCareerHubDef = {
  icao: string;
  name: string;
  region: NcCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated New Caledonia hub. Nouméa seaport pickup is NWWW. */
export const NC_CAREER_HUBS: readonly NcCareerHubDef[] = [
  {
    icao: 'NWWW',
    name: 'Noumea La Tontouta',
    region: 'NC-S',
    hubTier: 'major',
    lat: -22.0146,
    lon: 166.213,
    produce: { general: 1.3, machinery: 1.2, supplies: 1.1 },
    consume: { perishables: 1.15, electronics: 1.0, fuel: 1.2 },
  },
];

export const NC_CAREER_HUB_COUNT = 1;

export function buildNcFeederCorridors(
  hubs: readonly NcCareerHubDef[] = NC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNcCareerHubCatalog(): void {
  if (NC_CAREER_HUBS.length !== NC_CAREER_HUB_COUNT) {
    throw new Error(
      `NC_CAREER_HUBS length ${NC_CAREER_HUBS.length} !== ${NC_CAREER_HUB_COUNT}`,
    );
  }
  if (!NC_CAREER_HUBS.some((h) => h.icao === 'NWWW' && h.hubTier === 'major')) {
    throw new Error('NC catalog must include major NWWW (La Tontouta)');
  }
  if (NC_CAREER_HUBS.some((h) => h.icao === 'NWWM')) {
    throw new Error('NC catalog must not seed NWWM Magenta as the cargo major');
  }
}
