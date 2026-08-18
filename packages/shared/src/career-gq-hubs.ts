/**
 * Equatorial Guinea career hub catalog — AF-4 Central Africa / Congo basin.
 *
 * Malabo cargo major is FGSL (Bioko). Skip mainland FGBT Bata and FGMY Mengomeyén.
 * Do not seed ident OCS (Corisco) — gps_code is FGCO.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GqCareerRegion = 'GQ-N';

export type GqCareerHubDef = {
  icao: string;
  name: string;
  region: GqCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Equatorial Guinea hub. Malabo is FGSL (not OCS/FGCO Corisco). */
export const GQ_CAREER_HUBS: readonly GqCareerHubDef[] = [
  {
    icao: 'FGSL',
    name: 'Malabo International',
    region: 'GQ-N',
    hubTier: 'major',
    lat: 3.7553,
    lon: 8.7087,
    produce: { general: 1.3, electronics: 1.15, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
];

export const GQ_CAREER_HUB_COUNT = 1;

export function buildGqFeederCorridors(
  hubs: readonly GqCareerHubDef[] = GQ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGqCareerHubCatalog(): void {
  if (GQ_CAREER_HUBS.length !== GQ_CAREER_HUB_COUNT) {
    throw new Error(
      `GQ_CAREER_HUBS length ${GQ_CAREER_HUBS.length} !== ${GQ_CAREER_HUB_COUNT}`,
    );
  }
  if (!GQ_CAREER_HUBS.some((h) => h.icao === 'FGSL' && h.hubTier === 'major')) {
    throw new Error('GQ catalog must include major FGSL (Malabo)');
  }
  if (GQ_CAREER_HUBS.some((h) => h.icao === 'OCS' || h.icao === 'FGCO')) {
    throw new Error('GQ catalog must use FGSL for Malabo, not OCS/FGCO Corisco');
  }
}
