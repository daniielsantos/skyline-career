/**
 * Uganda career hub catalog — AF-2 Sub-Saharan densify (Great Lakes).
 * Landlocked — no seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { UG_DENSIFY_HUBS, UG_DENSIFY_HUB_COUNT } from './career-ug-hubs-densify.js';

export type UgCareerRegion = 'UG-C';

export type UgCareerHubDef = {
  icao: string;
  name: string;
  region: UgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Uganda hub. Kampala cargo major is HUEN Entebbe. */
export const UG_CAREER_HUBS: readonly UgCareerHubDef[] = [
  {
    icao: 'HUEN',
    name: 'Entebbe International',
    region: 'UG-C',
    hubTier: 'major',
    lat: 0.0424,
    lon: 32.4435,
    produce: { perishables: 1.3, general: 1.35, electronics: 1.15 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
  ...UG_DENSIFY_HUBS,
];

export const UG_CAREER_HUB_COUNT = 1 + UG_DENSIFY_HUB_COUNT;

export function buildUgFeederCorridors(
  hubs: readonly UgCareerHubDef[] = UG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertUgCareerHubCatalog(): void {
  if (UG_CAREER_HUBS.length !== UG_CAREER_HUB_COUNT) {
    throw new Error(
      `UG_CAREER_HUBS length ${UG_CAREER_HUBS.length} !== ${UG_CAREER_HUB_COUNT}`,
    );
  }
  if (!UG_CAREER_HUBS.some((h) => h.icao === 'HUEN' && h.hubTier === 'major')) {
    throw new Error('UG catalog must include major HUEN (Entebbe)');
  }
}
