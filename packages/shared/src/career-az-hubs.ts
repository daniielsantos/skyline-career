/**
 * Azerbaijan career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AzCareerRegion = 'AZ-C';

export type AzCareerHubDef = {
  icao: string;
  name: string;
  region: AzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Azerbaijan hubs. */
export const AZ_CAREER_HUBS: readonly AzCareerHubDef[] = [
  {
    icao: 'UBBB',
    name: 'Baku Heydar Aliyev',
    region: 'AZ-C',
    hubTier: 'major',
    lat: 40.4675,
    lon: 50.0467,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'UBGN',
    name: 'Ganja',
    region: 'AZ-C',
    hubTier: 'regional',
    lat: 40.7377,
    lon: 46.3176,
    produce: { general: 1.2, perishables: 1.15, machinery: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
];

export const AZ_CAREER_HUB_COUNT = 2;

export function buildAzFeederCorridors(
  hubs: readonly AzCareerHubDef[] = AZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAzCareerHubCatalog(): void {
  if (AZ_CAREER_HUBS.length !== AZ_CAREER_HUB_COUNT) {
    throw new Error(
      `AZ_CAREER_HUBS length ${AZ_CAREER_HUBS.length} !== ${AZ_CAREER_HUB_COUNT}`,
    );
  }
  if (!AZ_CAREER_HUBS.some((h) => h.icao === 'UBBB' && h.hubTier === 'major')) {
    throw new Error('AZ catalog must include major UBBB');
  }
}
