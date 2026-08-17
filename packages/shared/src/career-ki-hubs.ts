/**
 * Kiribati career hub catalog — Asia-17 leftover Pacific face.
 *
 * Tarawa cargo major is NGTA Bonriki (not Cassidy PLCH on Kiritimati).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KiCareerRegion = 'KI-T';

export type KiCareerHubDef = {
  icao: string;
  name: string;
  region: KiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Kiribati hub. Tarawa seaport pickup is NGTA. */
export const KI_CAREER_HUBS: readonly KiCareerHubDef[] = [
  {
    icao: 'NGTA',
    name: 'Tarawa Bonriki',
    region: 'KI-T',
    hubTier: 'major',
    lat: 1.3816,
    lon: 173.147,
    produce: { general: 1.25, supplies: 1.2, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.2 },
  },
];

export const KI_CAREER_HUB_COUNT = 1;

export function buildKiFeederCorridors(
  hubs: readonly KiCareerHubDef[] = KI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKiCareerHubCatalog(): void {
  if (KI_CAREER_HUBS.length !== KI_CAREER_HUB_COUNT) {
    throw new Error(
      `KI_CAREER_HUBS length ${KI_CAREER_HUBS.length} !== ${KI_CAREER_HUB_COUNT}`,
    );
  }
  if (!KI_CAREER_HUBS.some((h) => h.icao === 'NGTA' && h.hubTier === 'major')) {
    throw new Error('KI catalog must include major NGTA (Bonriki)');
  }
  if (KI_CAREER_HUBS.some((h) => ['PLCH', 'NGTU'].includes(h.icao))) {
    throw new Error('KI catalog must not seed PLCH Cassidy or NGTU this slice');
  }
}
