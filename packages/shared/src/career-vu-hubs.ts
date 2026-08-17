/**
 * Vanuatu career hub catalog — Efate + Espiritu Santo.
 *
 * Port Vila cargo major is NVVV Bauerfield; Santo is NVSS Pekoa.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type VuCareerRegion = 'VU-C' | 'VU-S';

export type VuCareerHubDef = {
  icao: string;
  name: string;
  region: VuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Vanuatu hubs — Efate (VU-C) + Santo (VU-S). */
export const VU_CAREER_HUBS: readonly VuCareerHubDef[] = [
  {
    icao: 'NVVV',
    name: 'Port Vila Bauerfield',
    region: 'VU-C',
    hubTier: 'major',
    lat: -17.6993,
    lon: 168.32,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
  {
    icao: 'NVSS',
    name: 'Santo Pekoa International',
    region: 'VU-S',
    hubTier: 'major',
    lat: -15.505,
    lon: 167.2197,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.1 },
  },
];

export const VU_CAREER_HUB_COUNT = 2;

export function buildVuFeederCorridors(
  hubs: readonly VuCareerHubDef[] = VU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVuCareerHubCatalog(): void {
  if (VU_CAREER_HUBS.length !== VU_CAREER_HUB_COUNT) {
    throw new Error(
      `VU_CAREER_HUBS length ${VU_CAREER_HUBS.length} !== ${VU_CAREER_HUB_COUNT}`,
    );
  }
  if (!VU_CAREER_HUBS.some((h) => h.icao === 'NVVV' && h.hubTier === 'major')) {
    throw new Error('VU catalog must include major NVVV (Bauerfield)');
  }
  if (!VU_CAREER_HUBS.some((h) => h.icao === 'NVSS' && h.hubTier === 'major')) {
    throw new Error('VU catalog must include major NVSS (Santo Pekoa)');
  }
}
