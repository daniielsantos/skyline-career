/**
 * Bosnia and Herzegovina career hub catalog — EU-6 W. Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BaCareerRegion = 'BA-C';

export type BaCareerHubDef = {
  icao: string;
  name: string;
  region: BaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Bosnia hubs. */
export const BA_CAREER_HUBS: readonly BaCareerHubDef[] = [
  {
    icao: 'LQSA',
    name: 'Sarajevo',
    region: 'BA-C',
    hubTier: 'major',
    lat: 43.8246,
    lon: 18.3315,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LQBK',
    name: 'Banja Luka',
    region: 'BA-C',
    hubTier: 'regional',
    lat: 44.9414,
    lon: 17.2975,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LQTZ',
    name: 'Tuzla',
    region: 'BA-C',
    hubTier: 'regional',
    lat: 44.4587,
    lon: 18.7248,
    produce: { general: 1.2, machinery: 1.15, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
  {
    icao: 'LQMO',
    name: 'Mostar',
    region: 'BA-C',
    hubTier: 'spoke',
    lat: 43.2829,
    lon: 17.8459,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const BA_CAREER_HUB_COUNT = 4;

export function buildBaFeederCorridors(
  hubs: readonly BaCareerHubDef[] = BA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBaCareerHubCatalog(): void {
  if (BA_CAREER_HUBS.length !== BA_CAREER_HUB_COUNT) {
    throw new Error(
      `BA_CAREER_HUBS length ${BA_CAREER_HUBS.length} !== ${BA_CAREER_HUB_COUNT}`,
    );
  }
  if (!BA_CAREER_HUBS.some((h) => h.icao === 'LQSA' && h.hubTier === 'major')) {
    throw new Error('BA catalog must include major LQSA');
  }
}
