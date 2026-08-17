/**
 * Turkmenistan career hub catalog — Asia-5 Central Asia Caspian.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TmCareerRegion = 'TM-C';

export type TmCareerHubDef = {
  icao: string;
  name: string;
  region: TmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Turkmenistan hubs. Turkmenbashi is UTAK (not UTBK). */
export const TM_CAREER_HUBS: readonly TmCareerHubDef[] = [
  {
    icao: 'UTAA',
    name: 'Ashgabat International',
    region: 'TM-C',
    hubTier: 'major',
    lat: 37.9868,
    lon: 58.361,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'UTAK',
    name: 'Turkmenbashi International',
    region: 'TM-C',
    hubTier: 'regional',
    lat: 40.0628,
    lon: 53.0051,
    produce: { machinery: 1.25, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
];

export const TM_CAREER_HUB_COUNT = 2;

export function buildTmFeederCorridors(
  hubs: readonly TmCareerHubDef[] = TM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTmCareerHubCatalog(): void {
  if (TM_CAREER_HUBS.length !== TM_CAREER_HUB_COUNT) {
    throw new Error(
      `TM_CAREER_HUBS length ${TM_CAREER_HUBS.length} !== ${TM_CAREER_HUB_COUNT}`,
    );
  }
  if (!TM_CAREER_HUBS.some((h) => h.icao === 'UTAA' && h.hubTier === 'major')) {
    throw new Error('TM catalog must include major UTAA (Ashgabat)');
  }
  if (!TM_CAREER_HUBS.some((h) => h.icao === 'UTAK')) {
    throw new Error('TM catalog must include UTAK Turkmenbashi (not UTBK)');
  }
  if (TM_CAREER_HUBS.some((h) => h.icao === 'UTBK')) {
    throw new Error('TM catalog must not use UTBK (Turkmenbashi is UTAK)');
  }
}
