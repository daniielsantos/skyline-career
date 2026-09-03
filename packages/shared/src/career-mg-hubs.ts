/**
 * Madagascar career hub catalog — AF-6 Africa leftovers (Indian Ocean).
 *
 * Antananarivo cargo major is FMMI Ivato. Toamasina FMMT is the seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { MG_DENSIFY_HUBS, MG_DENSIFY_HUB_COUNT } from './career-mg-hubs-densify.js';

export type MgCareerRegion = 'MG-C' | 'MG-E';

export type MgCareerHubDef = {
  icao: string;
  name: string;
  region: MgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Madagascar hubs. Capital is FMMI; coast is FMMT. */
export const MG_CAREER_HUBS: readonly MgCareerHubDef[] = [
  {
    icao: 'FMMI',
    name: 'Antananarivo Ivato',
    region: 'MG-C',
    hubTier: 'major',
    lat: -18.7969,
    lon: 47.4788,
    produce: { general: 1.35, perishables: 1.25, electronics: 1.15 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FMMT',
    name: 'Toamasina Ambalamanasy',
    region: 'MG-E',
    hubTier: 'regional',
    lat: -18.1135,
    lon: 49.3923,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.15 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.1 },
  },
  ...MG_DENSIFY_HUBS,
];

export const MG_CAREER_HUB_COUNT = 2 + MG_DENSIFY_HUB_COUNT;

export function buildMgFeederCorridors(
  hubs: readonly MgCareerHubDef[] = MG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMgCareerHubCatalog(): void {
  if (MG_CAREER_HUBS.length !== MG_CAREER_HUB_COUNT) {
    throw new Error(
      `MG_CAREER_HUBS length ${MG_CAREER_HUBS.length} !== ${MG_CAREER_HUB_COUNT}`,
    );
  }
  if (!MG_CAREER_HUBS.some((h) => h.icao === 'FMMI' && h.hubTier === 'major')) {
    throw new Error('MG catalog must include major FMMI (Ivato)');
  }
  if (!MG_CAREER_HUBS.some((h) => h.icao === 'FMMT')) {
    throw new Error('MG catalog must include FMMT Toamasina (port pickup)');
  }
}
