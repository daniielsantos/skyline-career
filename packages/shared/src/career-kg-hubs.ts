/**
 * Kyrgyzstan career hub catalog — Asia-6 Central Asia east.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KgCareerRegion = 'KG-N' | 'KG-S';

export type KgCareerHubDef = {
  icao: string;
  name: string;
  region: KgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Kyrgyzstan hubs. Bishkek Manas is UCFM (not UAFM); Osh is UCFO (not UAFO). */
export const KG_CAREER_HUBS: readonly KgCareerHubDef[] = [
  {
    icao: 'UCFM',
    name: 'Bishkek Manas International',
    region: 'KG-N',
    hubTier: 'major',
    lat: 43.0613,
    lon: 74.4776,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'UCFL',
    name: 'Issyk-Kul International',
    region: 'KG-N',
    hubTier: 'regional',
    lat: 42.5856,
    lon: 76.7012,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'UCFO',
    name: 'Osh International',
    region: 'KG-S',
    hubTier: 'regional',
    lat: 40.609,
    lon: 72.7933,
    produce: { general: 1.3, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 1.0, supplies: 1.1, fuel: 1.15 },
  },
];

export const KG_CAREER_HUB_COUNT = 3;

export function buildKgFeederCorridors(
  hubs: readonly KgCareerHubDef[] = KG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKgCareerHubCatalog(): void {
  if (KG_CAREER_HUBS.length !== KG_CAREER_HUB_COUNT) {
    throw new Error(
      `KG_CAREER_HUBS length ${KG_CAREER_HUBS.length} !== ${KG_CAREER_HUB_COUNT}`,
    );
  }
  if (!KG_CAREER_HUBS.some((h) => h.icao === 'UCFM' && h.hubTier === 'major')) {
    throw new Error('KG catalog must include major UCFM (Manas, not UAFM)');
  }
  if (!KG_CAREER_HUBS.some((h) => h.icao === 'UCFO')) {
    throw new Error('KG catalog must include UCFO Osh (not UAFO)');
  }
  if (KG_CAREER_HUBS.some((h) => h.icao === 'UAFM' || h.icao === 'UAFO')) {
    throw new Error('KG catalog must not seed UAFM/UAFO (use UCFM/UCFO)');
  }
}
