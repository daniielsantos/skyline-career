/**
 * Seychelles career hub catalog — AF-6 Africa leftovers (Indian Ocean island hop).
 *
 * Mahé cargo major is FSIA. Skip Praslin FSPP (separate island; own fuel hub).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ScCareerRegion = 'SC-N';

export type ScCareerHubDef = {
  icao: string;
  name: string;
  region: ScCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Seychelles hub. Mahé is FSIA (not FSPP Praslin). */
export const SC_CAREER_HUBS: readonly ScCareerHubDef[] = [
  {
    icao: 'FSIA',
    name: 'Seychelles International',
    region: 'SC-N',
    hubTier: 'major',
    lat: -4.6743,
    lon: 55.5218,
    produce: { perishables: 1.3, general: 1.2, electronics: 1.1 },
    consume: { machinery: 0.9, supplies: 1.15, fuel: 1.2 },
  },
];

export const SC_CAREER_HUB_COUNT = 1;

export function buildScFeederCorridors(
  hubs: readonly ScCareerHubDef[] = SC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertScCareerHubCatalog(): void {
  if (SC_CAREER_HUBS.length !== SC_CAREER_HUB_COUNT) {
    throw new Error(
      `SC_CAREER_HUBS length ${SC_CAREER_HUBS.length} !== ${SC_CAREER_HUB_COUNT}`,
    );
  }
  if (!SC_CAREER_HUBS.some((h) => h.icao === 'FSIA' && h.hubTier === 'major')) {
    throw new Error('SC catalog must include major FSIA (Mahé)');
  }
  if (SC_CAREER_HUBS.some((h) => h.icao === 'FSPP')) {
    throw new Error('SC catalog must use FSIA for Mahé, not FSPP Praslin');
  }
}
