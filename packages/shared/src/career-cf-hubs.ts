/**
 * Central African Republic career hub catalog — AF-4 Central Africa / Congo basin.
 * Landlocked — no seaport pickup.
 *
 * Bangui cargo major is FEFF M'Poko.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CfCareerRegion = 'CF-C';

export type CfCareerHubDef = {
  icao: string;
  name: string;
  region: CfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated CAR hub. Bangui is FEFF. */
export const CF_CAREER_HUBS: readonly CfCareerHubDef[] = [
  {
    icao: 'FEFF',
    name: "Bangui M'Poko",
    region: 'CF-C',
    hubTier: 'major',
    lat: 4.3985,
    lon: 18.5188,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.95, fuel: 1.15 },
  },
];

export const CF_CAREER_HUB_COUNT = 1;

export function buildCfFeederCorridors(
  hubs: readonly CfCareerHubDef[] = CF_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCfCareerHubCatalog(): void {
  if (CF_CAREER_HUBS.length !== CF_CAREER_HUB_COUNT) {
    throw new Error(
      `CF_CAREER_HUBS length ${CF_CAREER_HUBS.length} !== ${CF_CAREER_HUB_COUNT}`,
    );
  }
  if (!CF_CAREER_HUBS.some((h) => h.icao === 'FEFF' && h.hubTier === 'major')) {
    throw new Error("CF catalog must include major FEFF (M'Poko)");
  }
}
