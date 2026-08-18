/**
 * South Sudan career hub catalog — AF-7 Horn of Africa.
 * Landlocked — no seaport pickup.
 *
 * Juba cargo major is HJJJ (not legacy HSSJ).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SsCareerRegion = 'SS-C';

export type SsCareerHubDef = {
  icao: string;
  name: string;
  region: SsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated South Sudan hub. Juba is HJJJ (not HSSJ). */
export const SS_CAREER_HUBS: readonly SsCareerHubDef[] = [
  {
    icao: 'HJJJ',
    name: 'Juba International',
    region: 'SS-C',
    hubTier: 'major',
    lat: 4.872,
    lon: 31.6011,
    produce: { general: 1.3, supplies: 1.2, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const SS_CAREER_HUB_COUNT = 1;

export function buildSsFeederCorridors(
  hubs: readonly SsCareerHubDef[] = SS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSsCareerHubCatalog(): void {
  if (SS_CAREER_HUBS.length !== SS_CAREER_HUB_COUNT) {
    throw new Error(
      `SS_CAREER_HUBS length ${SS_CAREER_HUBS.length} !== ${SS_CAREER_HUB_COUNT}`,
    );
  }
  if (!SS_CAREER_HUBS.some((h) => h.icao === 'HJJJ' && h.hubTier === 'major')) {
    throw new Error('SS catalog must include major HJJJ (Juba)');
  }
  if (SS_CAREER_HUBS.some((h) => h.icao === 'HSSJ')) {
    throw new Error('SS catalog must use HJJJ for Juba, not legacy HSSJ');
  }
}
