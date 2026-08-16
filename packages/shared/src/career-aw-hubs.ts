/**
 * Aruba career hub catalog — NL territory light (CW-style).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AwCareerRegion = 'AW-C';

export type AwCareerHubDef = {
  icao: string;
  name: string;
  region: AwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Aruba hub — Queen Beatrix. */
export const AW_CAREER_HUBS: readonly AwCareerHubDef[] = [
  {
    icao: 'TNCA',
    name: 'Aruba Queen Beatrix',
    region: 'AW-C',
    hubTier: 'major',
    lat: 12.5014,
    lon: -70.0152,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
];

export const AW_CAREER_HUB_COUNT = 1;

export function buildAwFeederCorridors(
  hubs: readonly AwCareerHubDef[] = AW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAwCareerHubCatalog(): void {
  if (AW_CAREER_HUBS.length !== AW_CAREER_HUB_COUNT) {
    throw new Error(
      `AW_CAREER_HUBS length ${AW_CAREER_HUBS.length} !== ${AW_CAREER_HUB_COUNT}`,
    );
  }
  const h = AW_CAREER_HUBS[0]!;
  if (h.icao !== 'TNCA' || h.region !== 'AW-C') {
    throw new Error('AW catalog must be TNCA / AW-C');
  }
}
