/**
 * Tonga career hub catalog — Asia-16 Polynesia face.
 *
 * Tongatapu cargo major is NFTF Fua'amotu (not Vava'u NFTV).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ToCareerRegion = 'TO-T';

export type ToCareerHubDef = {
  icao: string;
  name: string;
  region: ToCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Tonga hub. Nuku'alofa seaport pickup is NFTF. */
export const TO_CAREER_HUBS: readonly ToCareerHubDef[] = [
  {
    icao: 'NFTF',
    name: "Fua'amotu International",
    region: 'TO-T',
    hubTier: 'major',
    lat: -21.2414,
    lon: -175.1492,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
];

export const TO_CAREER_HUB_COUNT = 1;

export function buildToFeederCorridors(
  hubs: readonly ToCareerHubDef[] = TO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertToCareerHubCatalog(): void {
  if (TO_CAREER_HUBS.length !== TO_CAREER_HUB_COUNT) {
    throw new Error(
      `TO_CAREER_HUBS length ${TO_CAREER_HUBS.length} !== ${TO_CAREER_HUB_COUNT}`,
    );
  }
  if (!TO_CAREER_HUBS.some((h) => h.icao === 'NFTF' && h.hubTier === 'major')) {
    throw new Error('TO catalog must include major NFTF (Fua\'amotu)');
  }
  if (TO_CAREER_HUBS.some((h) => h.icao === 'NFTV')) {
    throw new Error('TO catalog must not seed NFTV Vava\'u as the cargo major');
  }
}
