/**
 * Tajikistan career hub catalog — Asia-6 Central Asia east.
 *
 * UTDK (Kulob) omitted: not present in stock MSFS Facilities scenery.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TjCareerRegion = 'TJ-S' | 'TJ-N';

export type TjCareerHubDef = {
  icao: string;
  name: string;
  region: TjCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Tajikistan hubs (stock MSFS Facilities). Skip UTDT Bokhtar. */
export const TJ_CAREER_HUBS: readonly TjCareerHubDef[] = [
  {
    icao: 'UTDD',
    name: 'Dushanbe International',
    region: 'TJ-S',
    hubTier: 'major',
    lat: 38.5436,
    lon: 68.8247,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'UTDL',
    name: 'Khujand International',
    region: 'TJ-N',
    hubTier: 'regional',
    lat: 40.2154,
    lon: 69.6953,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 1.0, supplies: 1.1, fuel: 1.15 },
  },
];

export const TJ_CAREER_HUB_COUNT = 2;

export function buildTjFeederCorridors(
  hubs: readonly TjCareerHubDef[] = TJ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTjCareerHubCatalog(): void {
  if (TJ_CAREER_HUBS.length !== TJ_CAREER_HUB_COUNT) {
    throw new Error(
      `TJ_CAREER_HUBS length ${TJ_CAREER_HUBS.length} !== ${TJ_CAREER_HUB_COUNT}`,
    );
  }
  if (!TJ_CAREER_HUBS.some((h) => h.icao === 'UTDD' && h.hubTier === 'major')) {
    throw new Error('TJ catalog must include major UTDD (Dushanbe)');
  }
  if (!TJ_CAREER_HUBS.some((h) => h.icao === 'UTDL')) {
    throw new Error('TJ catalog must include UTDL Khujand');
  }
  if (TJ_CAREER_HUBS.some((h) => h.icao === 'UTDK' || h.icao === 'UTDT')) {
    throw new Error('TJ catalog must not seed UTDK Kulob or UTDT Bokhtar');
  }
}
