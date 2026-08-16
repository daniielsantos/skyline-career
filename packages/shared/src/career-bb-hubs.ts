/**
 * Barbados career hub catalog — intl-first (Grantley Adams only; island too small for denser domestic).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BbCareerRegion = 'BB-C';

export type BbCareerHubDef = {
  icao: string;
  name: string;
  region: BbCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Barbados hub — cargo/OFP gateway. */
export const BB_CAREER_HUBS: readonly BbCareerHubDef[] = [
  {
    icao: 'TBPB',
    name: 'Bridgetown Grantley Adams',
    region: 'BB-C',
    hubTier: 'major',
    lat: 13.0746,
    lon: -59.4925,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
];

export const BB_CAREER_HUB_COUNT = 1;

export function buildBbFeederCorridors(
  hubs: readonly BbCareerHubDef[] = BB_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBbCareerHubCatalog(): void {
  if (BB_CAREER_HUBS.length !== BB_CAREER_HUB_COUNT) {
    throw new Error(
      `BB_CAREER_HUBS length ${BB_CAREER_HUBS.length} !== ${BB_CAREER_HUB_COUNT}`,
    );
  }
  const h = BB_CAREER_HUBS[0]!;
  if (h.icao !== 'TBPB' || h.region !== 'BB-C') {
    throw new Error('BB catalog must be TBPB / BB-C');
  }
}
