/**
 * Somalia career hub catalog — AF-7 Horn of Africa.
 *
 * Mogadishu cargo major is HCMM Aden Adde. Skip Hargeisa / Bosaso densify.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SoCareerRegion = 'SO-S';

export type SoCareerHubDef = {
  icao: string;
  name: string;
  region: SoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Somalia hub. Mogadishu is HCMM. */
export const SO_CAREER_HUBS: readonly SoCareerHubDef[] = [
  {
    icao: 'HCMM',
    name: 'Mogadishu Aden Adde',
    region: 'SO-S',
    hubTier: 'major',
    lat: 2.0144,
    lon: 45.3047,
    produce: { general: 1.3, supplies: 1.2, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const SO_CAREER_HUB_COUNT = 1;

export function buildSoFeederCorridors(
  hubs: readonly SoCareerHubDef[] = SO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSoCareerHubCatalog(): void {
  if (SO_CAREER_HUBS.length !== SO_CAREER_HUB_COUNT) {
    throw new Error(
      `SO_CAREER_HUBS length ${SO_CAREER_HUBS.length} !== ${SO_CAREER_HUB_COUNT}`,
    );
  }
  if (!SO_CAREER_HUBS.some((h) => h.icao === 'HCMM' && h.hubTier === 'major')) {
    throw new Error('SO catalog must include major HCMM (Aden Adde)');
  }
}
