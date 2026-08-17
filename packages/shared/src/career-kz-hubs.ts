/**
 * Kazakhstan career hub catalog — Asia-5 Central Asia Caspian / steppe.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KzCareerRegion = 'KZ-S' | 'KZ-N';

export type KzCareerHubDef = {
  icao: string;
  name: string;
  region: KzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Kazakhstan hubs. Almaty is UAAA; Astana is UACC. */
export const KZ_CAREER_HUBS: readonly KzCareerHubDef[] = [
  {
    icao: 'UAAA',
    name: 'Almaty International',
    region: 'KZ-S',
    hubTier: 'major',
    lat: 43.3543,
    lon: 77.0428,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'UAII',
    name: 'Shymkent International',
    region: 'KZ-S',
    hubTier: 'regional',
    lat: 42.365,
    lon: 69.4756,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 1.0, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'UACC',
    name: 'Astana Nursultan Nazarbayev',
    region: 'KZ-N',
    hubTier: 'major',
    lat: 51.027,
    lon: 71.4671,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'UATE',
    name: 'Aktau International',
    region: 'KZ-N',
    hubTier: 'regional',
    lat: 43.8601,
    lon: 51.0909,
    produce: { machinery: 1.25, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
];

export const KZ_CAREER_HUB_COUNT = 4;

export function buildKzFeederCorridors(
  hubs: readonly KzCareerHubDef[] = KZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKzCareerHubCatalog(): void {
  if (KZ_CAREER_HUBS.length !== KZ_CAREER_HUB_COUNT) {
    throw new Error(
      `KZ_CAREER_HUBS length ${KZ_CAREER_HUBS.length} !== ${KZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!KZ_CAREER_HUBS.some((h) => h.icao === 'UAAA' && h.hubTier === 'major')) {
    throw new Error('KZ catalog must include major UAAA (Almaty)');
  }
  if (!KZ_CAREER_HUBS.some((h) => h.icao === 'UACC' && h.hubTier === 'major')) {
    throw new Error('KZ catalog must include major UACC (Astana)');
  }
  if (!KZ_CAREER_HUBS.some((h) => h.icao === 'UATE')) {
    throw new Error('KZ catalog must include UATE Aktau (Caspian port pickup)');
  }
}
