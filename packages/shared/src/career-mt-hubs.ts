/**
 * Malta career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MtCareerRegion = 'MT-C';

export type MtCareerHubDef = {
  icao: string;
  name: string;
  region: MtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Malta hub. */
export const MT_CAREER_HUBS: readonly MtCareerHubDef[] = [
  {
    icao: 'LMML',
    name: 'Malta International',
    region: 'MT-C',
    hubTier: 'major',
    lat: 35.8575,
    lon: 14.4775,
    produce: { electronics: 1.2, general: 1.3, perishables: 1.15 },
    consume: { supplies: 1.1, machinery: 0.95, general: 1.05 },
  },
];

export const MT_CAREER_HUB_COUNT = 1;

export function buildMtFeederCorridors(
  hubs: readonly MtCareerHubDef[] = MT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMtCareerHubCatalog(): void {
  if (MT_CAREER_HUBS.length !== MT_CAREER_HUB_COUNT) {
    throw new Error(
      `MT_CAREER_HUBS length ${MT_CAREER_HUBS.length} !== ${MT_CAREER_HUB_COUNT}`,
    );
  }
  if (!MT_CAREER_HUBS.some((h) => h.icao === 'LMML' && h.hubTier === 'major')) {
    throw new Error('MT catalog must include major LMML');
  }
}
