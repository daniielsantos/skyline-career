/**
 * Uzbekistan career hub catalog — Asia-5 Central Asia Silk Road.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type UzCareerRegion = 'UZ-E' | 'UZ-W';

export type UzCareerHubDef = {
  icao: string;
  name: string;
  region: UzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const oasis = {
  produce: { general: 1.2, perishables: 1.2, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 4 curated Uzbekistan hubs. Tashkent is UTTT (not UTNN Nukus). */
export const UZ_CAREER_HUBS: readonly UzCareerHubDef[] = [
  {
    icao: 'UTTT',
    name: 'Tashkent International',
    region: 'UZ-E',
    hubTier: 'major',
    lat: 41.2579,
    lon: 69.2812,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'UTSS',
    name: 'Samarkand International',
    region: 'UZ-E',
    hubTier: 'regional',
    lat: 39.7018,
    lon: 66.9815,
    produce: { general: 1.3, perishables: 1.25, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.1 },
  },
  {
    icao: 'UTSB',
    name: 'Bukhara International',
    region: 'UZ-W',
    hubTier: 'regional',
    lat: 39.7753,
    lon: 64.4823,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.1 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'UTNN',
    name: 'Nukus International',
    region: 'UZ-W',
    hubTier: 'spoke',
    lat: 42.4884,
    lon: 59.6233,
    ...oasis,
  },
];

export const UZ_CAREER_HUB_COUNT = 4;

export function buildUzFeederCorridors(
  hubs: readonly UzCareerHubDef[] = UZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertUzCareerHubCatalog(): void {
  if (UZ_CAREER_HUBS.length !== UZ_CAREER_HUB_COUNT) {
    throw new Error(
      `UZ_CAREER_HUBS length ${UZ_CAREER_HUBS.length} !== ${UZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!UZ_CAREER_HUBS.some((h) => h.icao === 'UTTT' && h.hubTier === 'major')) {
    throw new Error('UZ catalog must include major UTTT (Tashkent)');
  }
  if (!UZ_CAREER_HUBS.some((h) => h.icao === 'UTSS')) {
    throw new Error('UZ catalog must include UTSS Samarkand');
  }
  const nukus = UZ_CAREER_HUBS.find((h) => h.icao === 'UTNN');
  if (nukus?.hubTier === 'major') {
    throw new Error('UTNN Nukus must not be the Tashkent major (use UTTT)');
  }
}
