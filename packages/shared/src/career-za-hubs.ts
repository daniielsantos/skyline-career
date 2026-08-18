/**
 * South Africa career hub catalog — AF-1 Sub-Saharan core (southern pole).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ZaCareerRegion = 'ZA-G' | 'ZA-W' | 'ZA-E';

export type ZaCareerHubDef = {
  icao: string;
  name: string;
  region: ZaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/**
 * 3 curated South Africa hubs. Johannesburg cargo major is FAOR (not FALA /
 * FAGM). Durban is FALE King Shaka (not closed FADN).
 */
export const ZA_CAREER_HUBS: readonly ZaCareerHubDef[] = [
  {
    icao: 'FAOR',
    name: 'Johannesburg O.R. Tambo',
    region: 'ZA-G',
    hubTier: 'major',
    lat: -26.1392,
    lon: 28.246,
    produce: { electronics: 1.45, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'FACT',
    name: 'Cape Town International',
    region: 'ZA-W',
    hubTier: 'major',
    lat: -33.9648,
    lon: 18.6017,
    produce: { perishables: 1.3, general: 1.4, electronics: 1.2 },
    consume: { machinery: 1.0, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FALE',
    name: 'Durban King Shaka',
    region: 'ZA-E',
    hubTier: 'regional',
    lat: -29.6144,
    lon: 31.1197,
    produce: { machinery: 1.25, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
];

export const ZA_CAREER_HUB_COUNT = 3;

export function buildZaFeederCorridors(
  hubs: readonly ZaCareerHubDef[] = ZA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertZaCareerHubCatalog(): void {
  if (ZA_CAREER_HUBS.length !== ZA_CAREER_HUB_COUNT) {
    throw new Error(
      `ZA_CAREER_HUBS length ${ZA_CAREER_HUBS.length} !== ${ZA_CAREER_HUB_COUNT}`,
    );
  }
  if (!ZA_CAREER_HUBS.some((h) => h.icao === 'FAOR' && h.hubTier === 'major')) {
    throw new Error('ZA catalog must include major FAOR (O.R. Tambo)');
  }
  if (!ZA_CAREER_HUBS.some((h) => h.icao === 'FACT' && h.hubTier === 'major')) {
    throw new Error('ZA catalog must include major FACT (Cape Town)');
  }
  if (!ZA_CAREER_HUBS.some((h) => h.icao === 'FALE')) {
    throw new Error('ZA catalog must include FALE King Shaka (port pickup)');
  }
  if (ZA_CAREER_HUBS.some((h) => h.icao === 'FADN')) {
    throw new Error('ZA catalog must use FALE for Durban, not closed FADN');
  }
  if (ZA_CAREER_HUBS.some((h) => h.icao === 'FALA' || h.icao === 'FAGM')) {
    throw new Error('ZA catalog must use FAOR for Johannesburg cargo, not FALA/FAGM');
  }
}
