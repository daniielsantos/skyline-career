/**
 * Eswatini career hub catalog — AF-6 Africa leftovers (southern cone).
 * Landlocked — no seaport pickup.
 *
 * Cargo major is FDSK King Mswati III (not FDMS Matsapha).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SzCareerRegion = 'SZ-E';

export type SzCareerHubDef = {
  icao: string;
  name: string;
  region: SzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Eswatini hub. King Mswati is FDSK (not FDMS Matsapha). */
export const SZ_CAREER_HUBS: readonly SzCareerHubDef[] = [
  {
    icao: 'FDSK',
    name: 'King Mswati III International',
    region: 'SZ-E',
    hubTier: 'major',
    lat: -26.3586,
    lon: 31.7169,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const SZ_CAREER_HUB_COUNT = 1;

export function buildSzFeederCorridors(
  hubs: readonly SzCareerHubDef[] = SZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSzCareerHubCatalog(): void {
  if (SZ_CAREER_HUBS.length !== SZ_CAREER_HUB_COUNT) {
    throw new Error(
      `SZ_CAREER_HUBS length ${SZ_CAREER_HUBS.length} !== ${SZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!SZ_CAREER_HUBS.some((h) => h.icao === 'FDSK' && h.hubTier === 'major')) {
    throw new Error('SZ catalog must include major FDSK (King Mswati III)');
  }
  if (SZ_CAREER_HUBS.some((h) => h.icao === 'FDMS')) {
    throw new Error('SZ catalog must use FDSK, not FDMS Matsapha');
  }
}
