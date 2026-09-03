/**
 * Malawi career hub catalog — AF-3 Sub-Saharan leftovers.
 * Landlocked — no seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { MW_DENSIFY_HUBS, MW_DENSIFY_HUB_COUNT } from './career-mw-hubs-densify.js';

export type MwCareerRegion = 'MW-C' | 'MW-S';

export type MwCareerHubDef = {
  icao: string;
  name: string;
  region: MwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Malawi hubs. Lilongwe cargo major is FWKI Kamuzu. */
export const MW_CAREER_HUBS: readonly MwCareerHubDef[] = [
  {
    icao: 'FWKI',
    name: 'Lilongwe Kamuzu',
    region: 'MW-C',
    hubTier: 'major',
    lat: -13.7894,
    lon: 33.781,
    produce: { perishables: 1.3, general: 1.3, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
  {
    icao: 'FWCL',
    name: 'Blantyre Chileka',
    region: 'MW-S',
    hubTier: 'regional',
    lat: -15.6772,
    lon: 34.9723,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.1 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
  ...MW_DENSIFY_HUBS,
];

export const MW_CAREER_HUB_COUNT = 2 + MW_DENSIFY_HUB_COUNT;

export function buildMwFeederCorridors(
  hubs: readonly MwCareerHubDef[] = MW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMwCareerHubCatalog(): void {
  if (MW_CAREER_HUBS.length !== MW_CAREER_HUB_COUNT) {
    throw new Error(
      `MW_CAREER_HUBS length ${MW_CAREER_HUBS.length} !== ${MW_CAREER_HUB_COUNT}`,
    );
  }
  if (!MW_CAREER_HUBS.some((h) => h.icao === 'FWKI' && h.hubTier === 'major')) {
    throw new Error('MW catalog must include major FWKI (Kamuzu)');
  }
  if (!MW_CAREER_HUBS.some((h) => h.icao === 'FWCL')) {
    throw new Error('MW catalog must include FWCL Chileka');
  }
}
