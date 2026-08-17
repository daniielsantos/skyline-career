/**
 * Afghanistan career hub catalog — Asia-7 Hindu Kush / South Asia hinge.
 *
 * OAIX Bagram omitted (military). OAJL Jalalabad omitted (spoke too close to Kabul).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AfCareerRegion = 'AF-N' | 'AF-S';

export type AfCareerHubDef = {
  icao: string;
  name: string;
  region: AfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Afghanistan hubs. Kabul is OAKB (not OAIX Bagram). */
export const AF_CAREER_HUBS: readonly AfCareerHubDef[] = [
  {
    icao: 'OAKB',
    name: 'Kabul International',
    region: 'AF-N',
    hubTier: 'major',
    lat: 34.5659,
    lon: 69.2123,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'OAMS',
    name: 'Mazar-i-Sharif International',
    region: 'AF-N',
    hubTier: 'regional',
    lat: 36.7041,
    lon: 67.2105,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.15 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'OAKN',
    name: 'Kandahar International',
    region: 'AF-S',
    hubTier: 'regional',
    lat: 31.5058,
    lon: 65.848,
    produce: { machinery: 1.25, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
  {
    icao: 'OAHR',
    name: 'Herat International',
    region: 'AF-S',
    hubTier: 'regional',
    lat: 34.21,
    lon: 62.2283,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.1 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
];

export const AF_CAREER_HUB_COUNT = 4;

export function buildAfFeederCorridors(
  hubs: readonly AfCareerHubDef[] = AF_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAfCareerHubCatalog(): void {
  if (AF_CAREER_HUBS.length !== AF_CAREER_HUB_COUNT) {
    throw new Error(
      `AF_CAREER_HUBS length ${AF_CAREER_HUBS.length} !== ${AF_CAREER_HUB_COUNT}`,
    );
  }
  if (!AF_CAREER_HUBS.some((h) => h.icao === 'OAKB' && h.hubTier === 'major')) {
    throw new Error('AF catalog must include major OAKB (Kabul)');
  }
  if (!AF_CAREER_HUBS.some((h) => h.icao === 'OAKN')) {
    throw new Error('AF catalog must include OAKN Kandahar');
  }
  if (AF_CAREER_HUBS.some((h) => h.icao === 'OAIX')) {
    throw new Error('AF catalog must not seed OAIX Bagram (use OAKB)');
  }
}
