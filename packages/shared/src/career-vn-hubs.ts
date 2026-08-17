/**
 * Vietnam career hub catalog — Asia-11 South China Sea / Mekong face.
 *
 * Hanoi is VVNB Noi Bai (not VVGL Gia Lam). HCMC cargo is VVTS Tan Son Nhat
 * (not VVLT Long Thanh, still under construction). Cambodia / Laos deferred.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type VnCareerRegion = 'VN-N' | 'VN-S';

export type VnCareerHubDef = {
  icao: string;
  name: string;
  region: VnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 5 curated Vietnam hubs. Hai Phong VVCI is the northern seaport pickup. */
export const VN_CAREER_HUBS: readonly VnCareerHubDef[] = [
  {
    icao: 'VVNB',
    name: 'Hanoi Noi Bai',
    region: 'VN-N',
    hubTier: 'major',
    lat: 21.2212,
    lon: 105.807,
    produce: { electronics: 1.45, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05, fuel: 1.2 },
  },
  {
    icao: 'VVCI',
    name: 'Hai Phong Cat Bi',
    region: 'VN-N',
    hubTier: 'regional',
    lat: 20.8174,
    lon: 106.7243,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 1.0, fuel: 1.15 },
  },
  {
    icao: 'VVDN',
    name: 'Da Nang International',
    region: 'VN-N',
    hubTier: 'regional',
    lat: 16.0439,
    lon: 108.199,
    produce: { general: 1.25, perishables: 1.2, electronics: 1.1 },
    consume: { machinery: 1.0, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'VVTS',
    name: 'Ho Chi Minh Tan Son Nhat',
    region: 'VN-S',
    hubTier: 'major',
    lat: 10.8188,
    lon: 106.652,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'VVCT',
    name: 'Can Tho International',
    region: 'VN-S',
    hubTier: 'regional',
    lat: 10.0834,
    lon: 105.7094,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const VN_CAREER_HUB_COUNT = 5;

export function buildVnFeederCorridors(
  hubs: readonly VnCareerHubDef[] = VN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVnCareerHubCatalog(): void {
  if (VN_CAREER_HUBS.length !== VN_CAREER_HUB_COUNT) {
    throw new Error(
      `VN_CAREER_HUBS length ${VN_CAREER_HUBS.length} !== ${VN_CAREER_HUB_COUNT}`,
    );
  }
  if (!VN_CAREER_HUBS.some((h) => h.icao === 'VVNB' && h.hubTier === 'major')) {
    throw new Error('VN catalog must include major VVNB (Hanoi Noi Bai)');
  }
  if (!VN_CAREER_HUBS.some((h) => h.icao === 'VVTS' && h.hubTier === 'major')) {
    throw new Error('VN catalog must include major VVTS (Tan Son Nhat)');
  }
  if (!VN_CAREER_HUBS.some((h) => h.icao === 'VVCI')) {
    throw new Error('VN catalog must include VVCI Hai Phong (port pickup)');
  }
  if (VN_CAREER_HUBS.some((h) => h.icao === 'VVGL' || h.icao === 'VVLT')) {
    throw new Error('VN catalog must not seed VVGL Gia Lam or VVLT Long Thanh');
  }
}
