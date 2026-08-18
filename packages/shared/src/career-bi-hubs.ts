/**
 * Burundi career hub catalog — AF-4 Central Africa / Great Lakes leftover.
 * Landlocked — no seaport pickup.
 *
 * Bujumbura cargo major is HBBA Melchior Ndadaye.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BiCareerRegion = 'BI-C';

export type BiCareerHubDef = {
  icao: string;
  name: string;
  region: BiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Burundi hub. Bujumbura is HBBA. */
export const BI_CAREER_HUBS: readonly BiCareerHubDef[] = [
  {
    icao: 'HBBA',
    name: 'Bujumbura Melchior Ndadaye',
    region: 'BI-C',
    hubTier: 'major',
    lat: -3.324,
    lon: 29.3185,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const BI_CAREER_HUB_COUNT = 1;

export function buildBiFeederCorridors(
  hubs: readonly BiCareerHubDef[] = BI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBiCareerHubCatalog(): void {
  if (BI_CAREER_HUBS.length !== BI_CAREER_HUB_COUNT) {
    throw new Error(
      `BI_CAREER_HUBS length ${BI_CAREER_HUBS.length} !== ${BI_CAREER_HUB_COUNT}`,
    );
  }
  if (!BI_CAREER_HUBS.some((h) => h.icao === 'HBBA' && h.hubTier === 'major')) {
    throw new Error('BI catalog must include major HBBA (Bujumbura)');
  }
}
