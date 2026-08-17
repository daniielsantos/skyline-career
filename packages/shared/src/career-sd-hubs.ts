/**
 * Sudan career hub catalog — MENA-5 Maghreb/Nile gap.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SdCareerRegion = 'SD-C' | 'SD-E';

export type SdCareerHubDef = {
  icao: string;
  name: string;
  region: SdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const inland = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 3 curated Sudan hubs. Khartoum is HSSK (not legacy HSSS). */
export const SD_CAREER_HUBS: readonly SdCareerHubDef[] = [
  {
    icao: 'HSSK',
    name: 'Khartoum International',
    region: 'SD-C',
    hubTier: 'major',
    lat: 15.5895,
    lon: 32.5532,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'HSOB',
    name: 'El Obeid',
    region: 'SD-C',
    hubTier: 'spoke',
    lat: 13.1532,
    lon: 30.2327,
    ...inland,
  },
  {
    icao: 'HSPN',
    name: 'Port Sudan',
    region: 'SD-E',
    hubTier: 'regional',
    lat: 19.4336,
    lon: 37.2341,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
];

export const SD_CAREER_HUB_COUNT = 3;

export function buildSdFeederCorridors(
  hubs: readonly SdCareerHubDef[] = SD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSdCareerHubCatalog(): void {
  if (SD_CAREER_HUBS.length !== SD_CAREER_HUB_COUNT) {
    throw new Error(
      `SD_CAREER_HUBS length ${SD_CAREER_HUBS.length} !== ${SD_CAREER_HUB_COUNT}`,
    );
  }
  if (!SD_CAREER_HUBS.some((h) => h.icao === 'HSSK' && h.hubTier === 'major')) {
    throw new Error('SD catalog must include major HSSK (Khartoum)');
  }
  if (!SD_CAREER_HUBS.some((h) => h.icao === 'HSPN')) {
    throw new Error('SD catalog must include HSPN Port Sudan (port pickup)');
  }
  if (SD_CAREER_HUBS.some((h) => h.icao === 'HSSS')) {
    throw new Error('SD catalog must use HSSK for Khartoum, not legacy HSSS');
  }
}
