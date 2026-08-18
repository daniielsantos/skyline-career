/**
 * Ethiopia career hub catalog — AF-1 Sub-Saharan core (Horn / Nile hinge).
 * Landlocked — no seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type EtCareerRegion = 'ET-C';

export type EtCareerHubDef = {
  icao: string;
  name: string;
  region: EtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Ethiopia hub. Addis cargo major is HAAB Bole. */
export const ET_CAREER_HUBS: readonly EtCareerHubDef[] = [
  {
    icao: 'HAAB',
    name: 'Addis Ababa Bole',
    region: 'ET-C',
    hubTier: 'major',
    lat: 8.9779,
    lon: 38.7993,
    produce: { electronics: 1.35, general: 1.4, perishables: 1.25 },
    consume: { machinery: 1.0, supplies: 1.15, fuel: 1.2 },
  },
];

export const ET_CAREER_HUB_COUNT = 1;

export function buildEtFeederCorridors(
  hubs: readonly EtCareerHubDef[] = ET_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertEtCareerHubCatalog(): void {
  if (ET_CAREER_HUBS.length !== ET_CAREER_HUB_COUNT) {
    throw new Error(
      `ET_CAREER_HUBS length ${ET_CAREER_HUBS.length} !== ${ET_CAREER_HUB_COUNT}`,
    );
  }
  if (!ET_CAREER_HUBS.some((h) => h.icao === 'HAAB' && h.hubTier === 'major')) {
    throw new Error('ET catalog must include major HAAB (Bole)');
  }
}
