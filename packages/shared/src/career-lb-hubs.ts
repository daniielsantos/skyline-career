/**
 * Lebanon career hub catalog — MENA-4 Levant-east.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LbCareerRegion = 'LB-C';

export type LbCareerHubDef = {
  icao: string;
  name: string;
  region: LbCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Lebanon hub (Beirut Rafic Hariri). */
export const LB_CAREER_HUBS: readonly LbCareerHubDef[] = [
  {
    icao: 'OLBA',
    name: 'Beirut Rafic Hariri',
    region: 'LB-C',
    hubTier: 'major',
    lat: 33.8209,
    lon: 35.4884,
    produce: { electronics: 1.45, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.25, supplies: 1.15, general: 1.05 },
  },
];

export const LB_CAREER_HUB_COUNT = 1;

export function buildLbFeederCorridors(
  hubs: readonly LbCareerHubDef[] = LB_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLbCareerHubCatalog(): void {
  if (LB_CAREER_HUBS.length !== LB_CAREER_HUB_COUNT) {
    throw new Error(
      `LB_CAREER_HUBS length ${LB_CAREER_HUBS.length} !== ${LB_CAREER_HUB_COUNT}`,
    );
  }
  if (!LB_CAREER_HUBS.some((h) => h.icao === 'OLBA' && h.hubTier === 'major')) {
    throw new Error('LB catalog must include major OLBA');
  }
}
