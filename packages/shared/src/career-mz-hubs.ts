/**
 * Mozambique career hub catalog — AF-2 Sub-Saharan densify (Indian Ocean face).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { MZ_DENSIFY_HUBS, MZ_DENSIFY_HUB_COUNT } from './career-mz-hubs-densify.js';

export type MzCareerRegion = 'MZ-S' | 'MZ-C';

export type MzCareerHubDef = {
  icao: string;
  name: string;
  region: MzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Mozambique hubs. Maputo cargo major is FQMA. */
export const MZ_CAREER_HUBS: readonly MzCareerHubDef[] = [
  {
    icao: 'FQMA',
    name: 'Maputo International',
    region: 'MZ-S',
    hubTier: 'major',
    lat: -25.9208,
    lon: 32.5726,
    produce: { general: 1.4, perishables: 1.25, machinery: 1.2 },
    consume: { electronics: 1.0, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FQBR',
    name: 'Beira',
    region: 'MZ-C',
    hubTier: 'regional',
    lat: -19.7964,
    lon: 34.9076,
    produce: { machinery: 1.25, general: 1.3, perishables: 1.2 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
  ...MZ_DENSIFY_HUBS,
];

export const MZ_CAREER_HUB_COUNT = 2 + MZ_DENSIFY_HUB_COUNT;

export function buildMzFeederCorridors(
  hubs: readonly MzCareerHubDef[] = MZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMzCareerHubCatalog(): void {
  if (MZ_CAREER_HUBS.length !== MZ_CAREER_HUB_COUNT) {
    throw new Error(
      `MZ_CAREER_HUBS length ${MZ_CAREER_HUBS.length} !== ${MZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!MZ_CAREER_HUBS.some((h) => h.icao === 'FQMA' && h.hubTier === 'major')) {
    throw new Error('MZ catalog must include major FQMA (Maputo)');
  }
  if (!MZ_CAREER_HUBS.some((h) => h.icao === 'FQBR')) {
    throw new Error('MZ catalog must include FQBR Beira (port pickup)');
  }
  if (MZ_CAREER_HUBS.some((h) => h.icao === 'FQBE')) {
    throw new Error('MZ catalog must use FQBR for Beira, not FQBE');
  }
}
