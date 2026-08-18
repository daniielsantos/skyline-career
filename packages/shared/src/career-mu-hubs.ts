/**
 * Mauritius career hub catalog — AF-6 Africa leftovers (Indian Ocean island hop).
 *
 * SSR cargo major is FIMP. Skip Rodrigues FIMR (separate island; own fuel hub).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MuCareerRegion = 'MU-C';

export type MuCareerHubDef = {
  icao: string;
  name: string;
  region: MuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Mauritius hub. Plaisance is FIMP (not FIMR Rodrigues). */
export const MU_CAREER_HUBS: readonly MuCareerHubDef[] = [
  {
    icao: 'FIMP',
    name: 'Mauritius Sir Seewoosagur Ramgoolam',
    region: 'MU-C',
    hubTier: 'major',
    lat: -20.4302,
    lon: 57.6836,
    produce: { perishables: 1.3, general: 1.25, electronics: 1.15 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.2 },
  },
];

export const MU_CAREER_HUB_COUNT = 1;

export function buildMuFeederCorridors(
  hubs: readonly MuCareerHubDef[] = MU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMuCareerHubCatalog(): void {
  if (MU_CAREER_HUBS.length !== MU_CAREER_HUB_COUNT) {
    throw new Error(
      `MU_CAREER_HUBS length ${MU_CAREER_HUBS.length} !== ${MU_CAREER_HUB_COUNT}`,
    );
  }
  if (!MU_CAREER_HUBS.some((h) => h.icao === 'FIMP' && h.hubTier === 'major')) {
    throw new Error('MU catalog must include major FIMP (SSR)');
  }
  if (MU_CAREER_HUBS.some((h) => h.icao === 'FIMR')) {
    throw new Error('MU catalog must use FIMP for Mauritius, not FIMR Rodrigues');
  }
}
