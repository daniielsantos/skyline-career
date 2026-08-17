/**
 * Cook Islands career hub catalog — Rarotonga + Aitutaki.
 *
 * Rarotonga cargo major is NCRG; Aitutaki is NCAI.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CkCareerRegion = 'CK-C' | 'CK-N';

export type CkCareerHubDef = {
  icao: string;
  name: string;
  region: CkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Cook Islands hubs — Rarotonga (CK-C) + Aitutaki (CK-N). */
export const CK_CAREER_HUBS: readonly CkCareerHubDef[] = [
  {
    icao: 'NCRG',
    name: 'Rarotonga International',
    region: 'CK-C',
    hubTier: 'major',
    lat: -21.2027,
    lon: -159.806,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
  {
    icao: 'NCAI',
    name: 'Aitutaki International',
    region: 'CK-N',
    hubTier: 'major',
    lat: -18.8309,
    lon: -159.7642,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.1 },
  },
];

export const CK_CAREER_HUB_COUNT = 2;

export function buildCkFeederCorridors(
  hubs: readonly CkCareerHubDef[] = CK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCkCareerHubCatalog(): void {
  if (CK_CAREER_HUBS.length !== CK_CAREER_HUB_COUNT) {
    throw new Error(
      `CK_CAREER_HUBS length ${CK_CAREER_HUBS.length} !== ${CK_CAREER_HUB_COUNT}`,
    );
  }
  if (!CK_CAREER_HUBS.some((h) => h.icao === 'NCRG' && h.hubTier === 'major')) {
    throw new Error('CK catalog must include major NCRG (Rarotonga)');
  }
  if (!CK_CAREER_HUBS.some((h) => h.icao === 'NCAI' && h.hubTier === 'major')) {
    throw new Error('CK catalog must include major NCAI (Aitutaki)');
  }
}
