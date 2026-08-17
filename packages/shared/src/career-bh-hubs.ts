/**
 * Bahrain career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BhCareerRegion = 'BH-C';

export type BhCareerHubDef = {
  icao: string;
  name: string;
  region: BhCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Bahrain hub (island single-major, Caribbean-style). */
export const BH_CAREER_HUBS: readonly BhCareerHubDef[] = [
  {
    icao: 'OBBI',
    name: 'Bahrain International',
    region: 'BH-C',
    hubTier: 'major',
    lat: 26.2708,
    lon: 50.6336,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
];

export const BH_CAREER_HUB_COUNT = 1;

export function buildBhFeederCorridors(
  hubs: readonly BhCareerHubDef[] = BH_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBhCareerHubCatalog(): void {
  if (BH_CAREER_HUBS.length !== BH_CAREER_HUB_COUNT) {
    throw new Error(
      `BH_CAREER_HUBS length ${BH_CAREER_HUBS.length} !== ${BH_CAREER_HUB_COUNT}`,
    );
  }
  if (!BH_CAREER_HUBS.some((h) => h.icao === 'OBBI' && h.hubTier === 'major')) {
    throw new Error('BH catalog must include major OBBI');
  }
}
