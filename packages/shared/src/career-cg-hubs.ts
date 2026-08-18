/**
 * Republic of the Congo career hub catalog — AF-4 Central Africa / Congo basin.
 *
 * Brazzaville cargo major is FCBB Maya-Maya (not Kinshasa FZAA; ISO is CG not CD).
 * Pointe-Noire FCPP is the Atlantic oil/port hinge.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CgCareerRegion = 'CG-C' | 'CG-W';

export type CgCareerHubDef = {
  icao: string;
  name: string;
  region: CgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Congo-Brazzaville hubs. Capital is FCBB; coast is FCPP. */
export const CG_CAREER_HUBS: readonly CgCareerHubDef[] = [
  {
    icao: 'FCBB',
    name: 'Brazzaville Maya-Maya',
    region: 'CG-C',
    hubTier: 'major',
    lat: -4.2517,
    lon: 15.253,
    produce: { general: 1.35, electronics: 1.2, machinery: 1.15 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FCPP',
    name: 'Pointe-Noire Agostinho-Neto',
    region: 'CG-W',
    hubTier: 'regional',
    lat: -4.816,
    lon: 11.8866,
    produce: { machinery: 1.3, general: 1.25, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
];

export const CG_CAREER_HUB_COUNT = 2;

export function buildCgFeederCorridors(
  hubs: readonly CgCareerHubDef[] = CG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCgCareerHubCatalog(): void {
  if (CG_CAREER_HUBS.length !== CG_CAREER_HUB_COUNT) {
    throw new Error(
      `CG_CAREER_HUBS length ${CG_CAREER_HUBS.length} !== ${CG_CAREER_HUB_COUNT}`,
    );
  }
  if (!CG_CAREER_HUBS.some((h) => h.icao === 'FCBB' && h.hubTier === 'major')) {
    throw new Error('CG catalog must include major FCBB (Maya-Maya)');
  }
  if (!CG_CAREER_HUBS.some((h) => h.icao === 'FCPP')) {
    throw new Error('CG catalog must include FCPP Pointe-Noire');
  }
  if (CG_CAREER_HUBS.some((h) => h.icao === 'FZAA')) {
    throw new Error('CG catalog is Congo-Brazzaville (FCBB), not Kinshasa FZAA');
  }
}
