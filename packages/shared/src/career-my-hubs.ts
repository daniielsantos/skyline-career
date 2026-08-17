/**
 * Malaysia career hub catalog — Asia-11 Strait of Malacca face.
 *
 * KLIA is WMKK (not WMSA Subang as major, not WMKB Butterworth).
 * East Malaysia WB* (Sabah / Sarawak) deferred with Indonesia / Borneo.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MyCareerRegion = 'MY-C' | 'MY-N';

export type MyCareerHubDef = {
  icao: string;
  name: string;
  region: MyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated peninsula Malaysia hubs. Port Klang pickup is WMKK. */
export const MY_CAREER_HUBS: readonly MyCareerHubDef[] = [
  {
    icao: 'WMKK',
    name: 'Kuala Lumpur International',
    region: 'MY-C',
    hubTier: 'major',
    lat: 2.7456,
    lon: 101.71,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'WMKJ',
    name: 'Johor Bahru Senai',
    region: 'MY-C',
    hubTier: 'regional',
    lat: 1.6413,
    lon: 103.67,
    produce: { machinery: 1.25, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.05, perishables: 1.1, fuel: 1.1 },
  },
  {
    icao: 'WMKP',
    name: 'Penang International',
    region: 'MY-N',
    hubTier: 'regional',
    lat: 5.2963,
    lon: 100.2762,
    produce: { electronics: 1.35, general: 1.3, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.2 },
  },
  {
    icao: 'WMKI',
    name: 'Ipoh Sultan Azlan Shah',
    region: 'MY-N',
    hubTier: 'regional',
    lat: 4.5673,
    lon: 101.0916,
    produce: { general: 1.2, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const MY_CAREER_HUB_COUNT = 4;

export function buildMyFeederCorridors(
  hubs: readonly MyCareerHubDef[] = MY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMyCareerHubCatalog(): void {
  if (MY_CAREER_HUBS.length !== MY_CAREER_HUB_COUNT) {
    throw new Error(
      `MY_CAREER_HUBS length ${MY_CAREER_HUBS.length} !== ${MY_CAREER_HUB_COUNT}`,
    );
  }
  if (!MY_CAREER_HUBS.some((h) => h.icao === 'WMKK' && h.hubTier === 'major')) {
    throw new Error('MY catalog must include major WMKK (KLIA)');
  }
  if (MY_CAREER_HUBS.some((h) => h.icao === 'WMSA' && h.hubTier === 'major')) {
    throw new Error('MY catalog must not treat WMSA Subang as the cargo major');
  }
  if (MY_CAREER_HUBS.some((h) => h.icao === 'WMKB' || h.icao.startsWith('WB'))) {
    throw new Error('MY catalog must not seed WMKB Butterworth or East Malaysia WB*');
  }
}
