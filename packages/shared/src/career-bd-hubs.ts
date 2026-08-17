/**
 * Bangladesh career hub catalog — Asia-8 Bay of Bengal face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BdCareerRegion = 'BD-C' | 'BD-E';

export type BdCareerHubDef = {
  icao: string;
  name: string;
  region: BdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Bangladesh hubs. Dhaka is VGHS (not VGZR Zia). */
export const BD_CAREER_HUBS: readonly BdCareerHubDef[] = [
  {
    icao: 'VGHS',
    name: 'Dhaka Hazrat Shahjalal',
    region: 'BD-C',
    hubTier: 'major',
    lat: 23.8433,
    lon: 90.3978,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'VGRJ',
    name: 'Rajshahi Shah Makhdum',
    region: 'BD-C',
    hubTier: 'spoke',
    lat: 24.4372,
    lon: 88.6165,
    produce: { general: 1.2, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'VGEG',
    name: 'Chittagong Shah Amanat',
    region: 'BD-E',
    hubTier: 'regional',
    lat: 22.2496,
    lon: 91.8133,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 1.0, fuel: 1.15 },
  },
  {
    icao: 'VGSY',
    name: 'Sylhet Osmani International',
    region: 'BD-E',
    hubTier: 'regional',
    lat: 24.964,
    lon: 91.8647,
    produce: { general: 1.25, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const BD_CAREER_HUB_COUNT = 4;

export function buildBdFeederCorridors(
  hubs: readonly BdCareerHubDef[] = BD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBdCareerHubCatalog(): void {
  if (BD_CAREER_HUBS.length !== BD_CAREER_HUB_COUNT) {
    throw new Error(
      `BD_CAREER_HUBS length ${BD_CAREER_HUBS.length} !== ${BD_CAREER_HUB_COUNT}`,
    );
  }
  if (!BD_CAREER_HUBS.some((h) => h.icao === 'VGHS' && h.hubTier === 'major')) {
    throw new Error('BD catalog must include major VGHS (Dhaka Shahjalal)');
  }
  if (!BD_CAREER_HUBS.some((h) => h.icao === 'VGEG')) {
    throw new Error('BD catalog must include VGEG Chittagong (port pickup)');
  }
  if (BD_CAREER_HUBS.some((h) => h.icao === 'VGZR')) {
    throw new Error('BD catalog must not seed VGZR (Dhaka is VGHS)');
  }
}
