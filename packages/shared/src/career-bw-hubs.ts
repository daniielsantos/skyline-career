/**
 * Botswana career hub catalog — AF-2 Sub-Saharan densify (Kalahari hinge).
 * Landlocked — no seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BwCareerRegion = 'BW-C';

export type BwCareerHubDef = {
  icao: string;
  name: string;
  region: BwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Botswana hub. Gaborone cargo major is FBSK (not FBMN Maun). */
export const BW_CAREER_HUBS: readonly BwCareerHubDef[] = [
  {
    icao: 'FBSK',
    name: 'Gaborone Sir Seretse Khama',
    region: 'BW-C',
    hubTier: 'major',
    lat: -24.5552,
    lon: 25.9182,
    produce: { general: 1.3, electronics: 1.15, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
];

export const BW_CAREER_HUB_COUNT = 1;

export function buildBwFeederCorridors(
  hubs: readonly BwCareerHubDef[] = BW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBwCareerHubCatalog(): void {
  if (BW_CAREER_HUBS.length !== BW_CAREER_HUB_COUNT) {
    throw new Error(
      `BW_CAREER_HUBS length ${BW_CAREER_HUBS.length} !== ${BW_CAREER_HUB_COUNT}`,
    );
  }
  if (!BW_CAREER_HUBS.some((h) => h.icao === 'FBSK' && h.hubTier === 'major')) {
    throw new Error('BW catalog must include major FBSK (Gaborone)');
  }
  if (BW_CAREER_HUBS.some((h) => h.icao === 'FBMN')) {
    throw new Error('BW catalog must use FBSK for Gaborone cargo, not FBMN Maun');
  }
}
