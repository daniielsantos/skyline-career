/**
 * Togo career hub catalog — AF-5 West Africa leftovers.
 *
 * Lomé cargo major is DXXX Tokoin (not DXNG Niamtougou).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TgCareerRegion = 'TG-S';

export type TgCareerHubDef = {
  icao: string;
  name: string;
  region: TgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Togo hub. Lomé is DXXX (not DXNG). */
export const TG_CAREER_HUBS: readonly TgCareerHubDef[] = [
  {
    icao: 'DXXX',
    name: 'Lomé Tokoin',
    region: 'TG-S',
    hubTier: 'major',
    lat: 6.1656,
    lon: 1.2545,
    produce: { general: 1.3, perishables: 1.2, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.1, fuel: 1.15 },
  },
];

export const TG_CAREER_HUB_COUNT = 1;

export function buildTgFeederCorridors(
  hubs: readonly TgCareerHubDef[] = TG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTgCareerHubCatalog(): void {
  if (TG_CAREER_HUBS.length !== TG_CAREER_HUB_COUNT) {
    throw new Error(
      `TG_CAREER_HUBS length ${TG_CAREER_HUBS.length} !== ${TG_CAREER_HUB_COUNT}`,
    );
  }
  if (!TG_CAREER_HUBS.some((h) => h.icao === 'DXXX' && h.hubTier === 'major')) {
    throw new Error('TG catalog must include major DXXX (Tokoin)');
  }
  if (TG_CAREER_HUBS.some((h) => h.icao === 'DXNG')) {
    throw new Error('TG catalog must use DXXX for Lomé, not DXNG Niamtougou');
  }
}
