/**
 * North Macedonia career hub catalog — EU-6 W. Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MkCareerRegion = 'MK-C';

export type MkCareerHubDef = {
  icao: string;
  name: string;
  region: MkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated North Macedonia hubs. */
export const MK_CAREER_HUBS: readonly MkCareerHubDef[] = [
  {
    icao: 'LWSK',
    name: 'Skopje',
    region: 'MK-C',
    hubTier: 'major',
    lat: 41.9616,
    lon: 21.6214,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LWOH',
    name: 'Ohrid',
    region: 'MK-C',
    hubTier: 'regional',
    lat: 41.18,
    lon: 20.7423,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
];

export const MK_CAREER_HUB_COUNT = 2;

export function buildMkFeederCorridors(
  hubs: readonly MkCareerHubDef[] = MK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMkCareerHubCatalog(): void {
  if (MK_CAREER_HUBS.length !== MK_CAREER_HUB_COUNT) {
    throw new Error(
      `MK_CAREER_HUBS length ${MK_CAREER_HUBS.length} !== ${MK_CAREER_HUB_COUNT}`,
    );
  }
  if (!MK_CAREER_HUBS.some((h) => h.icao === 'LWSK' && h.hubTier === 'major')) {
    throw new Error('MK catalog must include major LWSK');
  }
}
