/**
 * Solomon Islands career hub catalog — Guadalcanal + Western.
 *
 * Country id is SB (ISO), not Brazil BR. Honiara cargo major is AGGH;
 * Munda is AGGM (Western Province).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SbCareerRegion = 'SB-G' | 'SB-W';

export type SbCareerHubDef = {
  icao: string;
  name: string;
  region: SbCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Solomon Islands hubs — Guadalcanal (SB-G) + Western (SB-W). */
export const SB_CAREER_HUBS: readonly SbCareerHubDef[] = [
  {
    icao: 'AGGH',
    name: 'Honiara International',
    region: 'SB-G',
    hubTier: 'major',
    lat: -9.428,
    lon: 160.055,
    produce: { supplies: 1.25, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, electronics: 1.0, fuel: 1.2 },
  },
  {
    icao: 'AGGM',
    name: 'Munda International',
    region: 'SB-W',
    hubTier: 'major',
    lat: -8.3279,
    lon: 157.263,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.1 },
  },
];

export const SB_CAREER_HUB_COUNT = 2;

export function buildSbFeederCorridors(
  hubs: readonly SbCareerHubDef[] = SB_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSbCareerHubCatalog(): void {
  if (SB_CAREER_HUBS.length !== SB_CAREER_HUB_COUNT) {
    throw new Error(
      `SB_CAREER_HUBS length ${SB_CAREER_HUBS.length} !== ${SB_CAREER_HUB_COUNT}`,
    );
  }
  if (!SB_CAREER_HUBS.some((h) => h.icao === 'AGGH' && h.hubTier === 'major')) {
    throw new Error('SB catalog must include major AGGH (Honiara)');
  }
  if (!SB_CAREER_HUBS.some((h) => h.icao === 'AGGM' && h.hubTier === 'major')) {
    throw new Error('SB catalog must include major AGGM (Munda)');
  }
  if (SB_CAREER_HUBS.some((h) => h.region.startsWith('BR'))) {
    throw new Error('Solomon Islands must not use Brazil BR regions');
  }
}
