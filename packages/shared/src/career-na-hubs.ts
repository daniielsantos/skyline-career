/**
 * Namibia career hub catalog — AF-2 Sub-Saharan densify (Atlantic south).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NaCareerRegion = 'NA-C' | 'NA-W';

export type NaCareerHubDef = {
  icao: string;
  name: string;
  region: NaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/**
 * 2 curated Namibia hubs. Windhoek cargo major is FYWH Hosea Kutako
 * (not FYWE Eros). Walvis Bay FYWB is the seaport pickup.
 */
export const NA_CAREER_HUBS: readonly NaCareerHubDef[] = [
  {
    icao: 'FYWH',
    name: 'Windhoek Hosea Kutako',
    region: 'NA-C',
    hubTier: 'major',
    lat: -22.4799,
    lon: 17.4709,
    produce: { electronics: 1.25, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'FYWB',
    name: 'Walvis Bay',
    region: 'NA-W',
    hubTier: 'regional',
    lat: -22.9197,
    lon: 14.5111,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
];

export const NA_CAREER_HUB_COUNT = 2;

export function buildNaFeederCorridors(
  hubs: readonly NaCareerHubDef[] = NA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNaCareerHubCatalog(): void {
  if (NA_CAREER_HUBS.length !== NA_CAREER_HUB_COUNT) {
    throw new Error(
      `NA_CAREER_HUBS length ${NA_CAREER_HUBS.length} !== ${NA_CAREER_HUB_COUNT}`,
    );
  }
  if (!NA_CAREER_HUBS.some((h) => h.icao === 'FYWH' && h.hubTier === 'major')) {
    throw new Error('NA catalog must include major FYWH (Hosea Kutako)');
  }
  if (!NA_CAREER_HUBS.some((h) => h.icao === 'FYWB')) {
    throw new Error('NA catalog must include FYWB Walvis Bay (port pickup)');
  }
  if (NA_CAREER_HUBS.some((h) => h.icao === 'FYWE')) {
    throw new Error('NA catalog must use FYWH for Windhoek cargo, not FYWE Eros');
  }
}
