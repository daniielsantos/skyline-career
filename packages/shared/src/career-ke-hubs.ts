/**
 * Kenya career hub catalog — AF-1 Sub-Saharan core (East Africa hinge).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { KE_DENSIFY_HUBS, KE_DENSIFY_HUB_COUNT } from './career-ke-hubs-densify.js';

export type KeCareerRegion = 'KE-C' | 'KE-E';

export type KeCareerHubDef = {
  icao: string;
  name: string;
  region: KeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Kenya hubs. Nairobi cargo major is HKJK (not HKNW Wilson). */
export const KE_CAREER_HUBS: readonly KeCareerHubDef[] = [
  {
    icao: 'HKJK',
    name: 'Nairobi Jomo Kenyatta',
    region: 'KE-C',
    hubTier: 'major',
    lat: -1.3192,
    lon: 36.9278,
    produce: { electronics: 1.4, general: 1.45, perishables: 1.3 },
    consume: { machinery: 1.0, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'HKMO',
    name: 'Mombasa Moi',
    region: 'KE-E',
    hubTier: 'regional',
    lat: -4.0348,
    lon: 39.5942,
    produce: { general: 1.3, perishables: 1.25, machinery: 1.15 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.15 },
  },
  ...KE_DENSIFY_HUBS,
];

export const KE_CAREER_HUB_COUNT = 2 + KE_DENSIFY_HUB_COUNT;

export function buildKeFeederCorridors(
  hubs: readonly KeCareerHubDef[] = KE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKeCareerHubCatalog(): void {
  if (KE_CAREER_HUBS.length !== KE_CAREER_HUB_COUNT) {
    throw new Error(
      `KE_CAREER_HUBS length ${KE_CAREER_HUBS.length} !== ${KE_CAREER_HUB_COUNT}`,
    );
  }
  if (!KE_CAREER_HUBS.some((h) => h.icao === 'HKJK' && h.hubTier === 'major')) {
    throw new Error('KE catalog must include major HKJK (Jomo Kenyatta)');
  }
  if (!KE_CAREER_HUBS.some((h) => h.icao === 'HKMO')) {
    throw new Error('KE catalog must include HKMO Mombasa (port pickup)');
  }
  if (KE_CAREER_HUBS.some((h) => h.icao === 'HKNW')) {
    throw new Error('KE catalog must use HKJK for Nairobi cargo, not HKNW Wilson');
  }
}
