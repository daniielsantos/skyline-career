/**
 * United Arab Emirates career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AeCareerRegion = 'AE-N' | 'AE-C';

export type AeCareerHubDef = {
  icao: string;
  name: string;
  region: AeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const northern = {
  produce: { electronics: 1.2, general: 1.25, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, machinery: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated UAE hubs. Dubai cargo gateway is OMDB. */
export const AE_CAREER_HUBS: readonly AeCareerHubDef[] = [
  {
    icao: 'OMDB',
    name: 'Dubai International',
    region: 'AE-N',
    hubTier: 'major',
    lat: 25.2532,
    lon: 55.3657,
    produce: { electronics: 1.55, general: 1.55, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.1 },
  },
  {
    icao: 'OMSJ',
    name: 'Sharjah',
    region: 'AE-N',
    hubTier: 'regional',
    lat: 25.3286,
    lon: 55.5172,
    ...northern,
  },
  {
    icao: 'OMRK',
    name: 'Ras Al Khaimah',
    region: 'AE-N',
    hubTier: 'spoke',
    lat: 25.6135,
    lon: 55.9388,
    ...northern,
  },
  {
    icao: 'OMAA',
    name: 'Abu Dhabi International',
    region: 'AE-C',
    hubTier: 'major',
    lat: 24.433,
    lon: 54.6511,
    produce: { electronics: 1.45, general: 1.45, machinery: 1.3 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OMAL',
    name: 'Al Ain',
    region: 'AE-C',
    hubTier: 'regional',
    lat: 24.2617,
    lon: 55.6092,
    produce: { perishables: 1.2, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'OMFJ',
    name: 'Fujairah',
    region: 'AE-N',
    hubTier: 'spoke',
    lat: 25.1122,
    lon: 56.324,
    produce: { general: 1.2, machinery: 1.15, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.95, fuel: 1.1 },
  },
];

export const AE_CAREER_HUB_COUNT = 6;

export function buildAeFeederCorridors(
  hubs: readonly AeCareerHubDef[] = AE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAeCareerHubCatalog(): void {
  if (AE_CAREER_HUBS.length !== AE_CAREER_HUB_COUNT) {
    throw new Error(
      `AE_CAREER_HUBS length ${AE_CAREER_HUBS.length} !== ${AE_CAREER_HUB_COUNT}`,
    );
  }
  if (!AE_CAREER_HUBS.some((h) => h.icao === 'OMDB' && h.hubTier === 'major')) {
    throw new Error('AE catalog must include major OMDB');
  }
  if (!AE_CAREER_HUBS.some((h) => h.icao === 'OMAA' && h.hubTier === 'major')) {
    throw new Error('AE catalog must include major OMAA');
  }
}
