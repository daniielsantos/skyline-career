/**
 * DR Congo career hub catalog — AF-3 Sub-Saharan leftovers (Congo basin).
 *
 * Kinshasa cargo major is FZAA N'djili (not FZAB N'dolo).
 * Lubumbashi FZQA is the southern mining pole (own fuel hub — no road to Kinshasa).
 * Kisangani cargo is FZIC Bangoka (not FZIA Simisini).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CdCareerRegion = 'CD-W' | 'CD-S' | 'CD-N';

export type CdCareerHubDef = {
  icao: string;
  name: string;
  region: CdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated DR Congo hubs. Kinshasa is FZAA; Lubumbashi is FZQA; Kisangani is FZIC. */
export const CD_CAREER_HUBS: readonly CdCareerHubDef[] = [
  {
    icao: 'FZAA',
    name: "Kinshasa N'djili",
    region: 'CD-W',
    hubTier: 'major',
    lat: -4.3858,
    lon: 15.4446,
    produce: { general: 1.4, electronics: 1.2, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'FZQA',
    name: 'Lubumbashi International',
    region: 'CD-S',
    hubTier: 'regional',
    lat: -11.5915,
    lon: 27.5308,
    produce: { machinery: 1.35, general: 1.3, supplies: 1.2 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
  {
    icao: 'FZIC',
    name: 'Kisangani Bangoka',
    region: 'CD-N',
    hubTier: 'regional',
    lat: 0.4816,
    lon: 25.338,
    produce: { general: 1.25, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.95, fuel: 1.15 },
  },
];

export const CD_CAREER_HUB_COUNT = 3;

export function buildCdFeederCorridors(
  hubs: readonly CdCareerHubDef[] = CD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCdCareerHubCatalog(): void {
  if (CD_CAREER_HUBS.length !== CD_CAREER_HUB_COUNT) {
    throw new Error(
      `CD_CAREER_HUBS length ${CD_CAREER_HUBS.length} !== ${CD_CAREER_HUB_COUNT}`,
    );
  }
  if (!CD_CAREER_HUBS.some((h) => h.icao === 'FZAA' && h.hubTier === 'major')) {
    throw new Error("CD catalog must include major FZAA (N'djili)");
  }
  if (!CD_CAREER_HUBS.some((h) => h.icao === 'FZQA')) {
    throw new Error('CD catalog must include FZQA Lubumbashi');
  }
  if (CD_CAREER_HUBS.some((h) => h.icao === 'FZAB')) {
    throw new Error("CD catalog must use FZAA for Kinshasa cargo, not FZAB N'dolo");
  }
  if (!CD_CAREER_HUBS.some((h) => h.icao === 'FZIC')) {
    throw new Error('CD catalog must include FZIC Kisangani Bangoka');
  }
  if (CD_CAREER_HUBS.some((h) => h.icao === 'FZIA')) {
    throw new Error('CD catalog must use FZIC for Kisangani, not FZIA Simisini');
  }
}
