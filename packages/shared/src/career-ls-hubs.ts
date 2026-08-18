/**
 * Lesotho career hub catalog — AF-6 Africa leftovers (southern cone).
 * Landlocked — no seaport pickup.
 *
 * Maseru cargo major is FXMM Moshoeshoe I.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LsCareerRegion = 'LS-C';

export type LsCareerHubDef = {
  icao: string;
  name: string;
  region: LsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Lesotho hub. Maseru is FXMM. */
export const LS_CAREER_HUBS: readonly LsCareerHubDef[] = [
  {
    icao: 'FXMM',
    name: 'Maseru Moshoeshoe I',
    region: 'LS-C',
    hubTier: 'major',
    lat: -29.4563,
    lon: 27.5545,
    produce: { general: 1.25, supplies: 1.15, perishables: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const LS_CAREER_HUB_COUNT = 1;

export function buildLsFeederCorridors(
  hubs: readonly LsCareerHubDef[] = LS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLsCareerHubCatalog(): void {
  if (LS_CAREER_HUBS.length !== LS_CAREER_HUB_COUNT) {
    throw new Error(
      `LS_CAREER_HUBS length ${LS_CAREER_HUBS.length} !== ${LS_CAREER_HUB_COUNT}`,
    );
  }
  if (!LS_CAREER_HUBS.some((h) => h.icao === 'FXMM' && h.hubTier === 'major')) {
    throw new Error('LS catalog must include major FXMM (Moshoeshoe I)');
  }
}
