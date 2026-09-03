/**
 * Malaysia career hub catalog — Asia-11 Strait of Malacca face.
 *
 * KLIA is WMKK (not WMSA Subang as major, not WMKB Butterworth).
 * East Malaysia WB* (Sabah / Sarawak) is seeded as MY-E / MY-K — no road link
 * to the peninsula (`REGION_NEIGHBORS` stays Borneo-only).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { MY_DENSIFY_HUBS, MY_DENSIFY_HUB_COUNT } from './career-my-hubs-densify.js';

export type MyCareerRegion = 'MY-C' | 'MY-N' | 'MY-E' | 'MY-K';

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

/** 7 curated Malaysia hubs. Port Klang pickup is WMKK; KK / Kuching are East ports. */
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
  {
    icao: 'WBKK',
    name: 'Kota Kinabalu International',
    region: 'MY-E',
    hubTier: 'regional',
    lat: 5.9327,
    lon: 116.0493,
    produce: { general: 1.3, perishables: 1.2, electronics: 1.15 },
    consume: { machinery: 1.05, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'WBKS',
    name: 'Sandakan',
    region: 'MY-E',
    hubTier: 'regional',
    lat: 5.9009,
    lon: 118.059,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'WBGG',
    name: 'Kuching International',
    region: 'MY-K',
    hubTier: 'regional',
    lat: 1.4874,
    lon: 110.3529,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 1.0, supplies: 1.1, fuel: 1.2 },
  },
  ...MY_DENSIFY_HUBS,
];

export const MY_CAREER_HUB_COUNT = 7 + MY_DENSIFY_HUB_COUNT;

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
  if (MY_CAREER_HUBS.some((h) => h.icao === 'WMKB')) {
    throw new Error('MY catalog must not seed WMKB Butterworth');
  }
  if (!MY_CAREER_HUBS.some((h) => h.icao === 'WBKK')) {
    throw new Error('MY catalog must include WBKK Kota Kinabalu');
  }
  if (!MY_CAREER_HUBS.some((h) => h.icao === 'WBGG')) {
    throw new Error('MY catalog must include WBGG Kuching');
  }
}
