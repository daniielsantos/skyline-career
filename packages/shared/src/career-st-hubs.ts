/**
 * São Tomé and Príncipe career hub catalog — AF-5 West Africa leftovers
 * (Gulf of Guinea island hop).
 *
 * São Tomé cargo major is FPST. Skip Príncipe FPPR.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type StCareerRegion = 'ST-C';

export type StCareerHubDef = {
  icao: string;
  name: string;
  region: StCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated São Tomé hub. São Tomé is FPST (not FPPR Príncipe). */
export const ST_CAREER_HUBS: readonly StCareerHubDef[] = [
  {
    icao: 'FPST',
    name: 'São Tomé International',
    region: 'ST-C',
    hubTier: 'major',
    lat: 0.3782,
    lon: 6.7122,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.15 },
  },
];

export const ST_CAREER_HUB_COUNT = 1;

export function buildStFeederCorridors(
  hubs: readonly StCareerHubDef[] = ST_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertStCareerHubCatalog(): void {
  if (ST_CAREER_HUBS.length !== ST_CAREER_HUB_COUNT) {
    throw new Error(
      `ST_CAREER_HUBS length ${ST_CAREER_HUBS.length} !== ${ST_CAREER_HUB_COUNT}`,
    );
  }
  if (!ST_CAREER_HUBS.some((h) => h.icao === 'FPST' && h.hubTier === 'major')) {
    throw new Error('ST catalog must include major FPST (São Tomé)');
  }
  if (ST_CAREER_HUBS.some((h) => h.icao === 'FPPR')) {
    throw new Error('ST catalog must use FPST for São Tomé, not FPPR Príncipe');
  }
}
