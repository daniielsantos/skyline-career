/**
 * Rwanda career hub catalog — AF-2 Sub-Saharan densify (Great Lakes).
 * Landlocked — no seaport pickup.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { RW_DENSIFY_HUBS, RW_DENSIFY_HUB_COUNT } from './career-rw-hubs-densify.js';

export type RwCareerRegion = 'RW-C';

export type RwCareerHubDef = {
  icao: string;
  name: string;
  region: RwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Rwanda hub. Kigali cargo major is HRYR. */
export const RW_CAREER_HUBS: readonly RwCareerHubDef[] = [
  {
    icao: 'HRYR',
    name: 'Kigali International',
    region: 'RW-C',
    hubTier: 'major',
    lat: -1.9686,
    lon: 30.1395,
    produce: { general: 1.3, electronics: 1.2, perishables: 1.2 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
  ...RW_DENSIFY_HUBS,
];

export const RW_CAREER_HUB_COUNT = 1 + RW_DENSIFY_HUB_COUNT;

export function buildRwFeederCorridors(
  hubs: readonly RwCareerHubDef[] = RW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertRwCareerHubCatalog(): void {
  if (RW_CAREER_HUBS.length !== RW_CAREER_HUB_COUNT) {
    throw new Error(
      `RW_CAREER_HUBS length ${RW_CAREER_HUBS.length} !== ${RW_CAREER_HUB_COUNT}`,
    );
  }
  if (!RW_CAREER_HUBS.some((h) => h.icao === 'HRYR' && h.hubTier === 'major')) {
    throw new Error('RW catalog must include major HRYR (Kigali)');
  }
}
