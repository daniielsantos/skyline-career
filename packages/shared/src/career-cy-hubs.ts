/**
 * Cyprus career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CyCareerRegion = 'CY-C';

export type CyCareerHubDef = {
  icao: string;
  name: string;
  region: CyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Cyprus hubs. */
export const CY_CAREER_HUBS: readonly CyCareerHubDef[] = [
  {
    icao: 'LCLK',
    name: 'Larnaca',
    region: 'CY-C',
    hubTier: 'major',
    lat: 34.8751,
    lon: 33.6249,
    produce: { electronics: 1.25, general: 1.3, perishables: 1.2 },
    consume: { supplies: 1.1, machinery: 0.95, general: 1.05 },
  },
  {
    icao: 'LCPH',
    name: 'Paphos',
    region: 'CY-C',
    hubTier: 'regional',
    lat: 34.718,
    lon: 32.4857,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const CY_CAREER_HUB_COUNT = 2;

export function buildCyFeederCorridors(
  hubs: readonly CyCareerHubDef[] = CY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCyCareerHubCatalog(): void {
  if (CY_CAREER_HUBS.length !== CY_CAREER_HUB_COUNT) {
    throw new Error(
      `CY_CAREER_HUBS length ${CY_CAREER_HUBS.length} !== ${CY_CAREER_HUB_COUNT}`,
    );
  }
  if (!CY_CAREER_HUBS.some((h) => h.icao === 'LCLK' && h.hubTier === 'major')) {
    throw new Error('CY catalog must include major LCLK');
  }
}
