/**
 * Burkina Faso career hub catalog — AF-5 West Africa leftovers.
 * Landlocked — no seaport pickup.
 *
 * Ouagadougou cargo major is DFFD Thomas Sankara.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BfCareerRegion = 'BF-C';

export type BfCareerHubDef = {
  icao: string;
  name: string;
  region: BfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Burkina Faso hub. Ouagadougou is DFFD. */
export const BF_CAREER_HUBS: readonly BfCareerHubDef[] = [
  {
    icao: 'DFFD',
    name: 'Ouagadougou Thomas Sankara',
    region: 'BF-C',
    hubTier: 'major',
    lat: 12.3532,
    lon: -1.5124,
    produce: { general: 1.3, supplies: 1.2, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.95, fuel: 1.15 },
  },
];

export const BF_CAREER_HUB_COUNT = 1;

export function buildBfFeederCorridors(
  hubs: readonly BfCareerHubDef[] = BF_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBfCareerHubCatalog(): void {
  if (BF_CAREER_HUBS.length !== BF_CAREER_HUB_COUNT) {
    throw new Error(
      `BF_CAREER_HUBS length ${BF_CAREER_HUBS.length} !== ${BF_CAREER_HUB_COUNT}`,
    );
  }
  if (!BF_CAREER_HUBS.some((h) => h.icao === 'DFFD' && h.hubTier === 'major')) {
    throw new Error('BF catalog must include major DFFD (Ouagadougou)');
  }
}
