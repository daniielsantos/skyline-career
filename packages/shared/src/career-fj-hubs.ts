/**
 * Fiji career hub catalog — Asia-15 Fiji Basin face.
 *
 * Nadi cargo major is NFFN (not Suva Nausori NFSF).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type FjCareerRegion = 'FJ-W';

export type FjCareerHubDef = {
  icao: string;
  name: string;
  region: FjCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Fiji hub. Nadi seaport pickup is NFFN. */
export const FJ_CAREER_HUBS: readonly FjCareerHubDef[] = [
  {
    icao: 'NFFN',
    name: 'Nadi International',
    region: 'FJ-W',
    hubTier: 'major',
    lat: -17.7618,
    lon: 177.4378,
    produce: { perishables: 1.3, general: 1.35, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
];

export const FJ_CAREER_HUB_COUNT = 1;

export function buildFjFeederCorridors(
  hubs: readonly FjCareerHubDef[] = FJ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertFjCareerHubCatalog(): void {
  if (FJ_CAREER_HUBS.length !== FJ_CAREER_HUB_COUNT) {
    throw new Error(
      `FJ_CAREER_HUBS length ${FJ_CAREER_HUBS.length} !== ${FJ_CAREER_HUB_COUNT}`,
    );
  }
  if (!FJ_CAREER_HUBS.some((h) => h.icao === 'NFFN' && h.hubTier === 'major')) {
    throw new Error('FJ catalog must include major NFFN (Nadi)');
  }
  if (FJ_CAREER_HUBS.some((h) => h.icao === 'NFSF')) {
    throw new Error('FJ catalog must not seed NFSF Nausori as the cargo major');
  }
}
