/**
 * Côte d'Ivoire career hub catalog — AF-1 Sub-Saharan core (Gulf of Guinea face).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CiCareerRegion = 'CI-S';

export type CiCareerHubDef = {
  icao: string;
  name: string;
  region: CiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Côte d'Ivoire hub. Abidjan cargo major is DIAP. */
export const CI_CAREER_HUBS: readonly CiCareerHubDef[] = [
  {
    icao: 'DIAP',
    name: 'Abidjan Félix-Houphouët-Boigny',
    region: 'CI-S',
    hubTier: 'major',
    lat: 5.2614,
    lon: -3.9263,
    produce: { perishables: 1.3, general: 1.4, electronics: 1.15 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
];

export const CI_CAREER_HUB_COUNT = 1;

export function buildCiFeederCorridors(
  hubs: readonly CiCareerHubDef[] = CI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCiCareerHubCatalog(): void {
  if (CI_CAREER_HUBS.length !== CI_CAREER_HUB_COUNT) {
    throw new Error(
      `CI_CAREER_HUBS length ${CI_CAREER_HUBS.length} !== ${CI_CAREER_HUB_COUNT}`,
    );
  }
  if (!CI_CAREER_HUBS.some((h) => h.icao === 'DIAP' && h.hubTier === 'major')) {
    throw new Error('CI catalog must include major DIAP (Abidjan)');
  }
}
