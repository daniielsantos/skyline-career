/**
 * Tunisia career hub catalog — MENA-1 Mediterranean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TnCareerRegion = 'TN-N' | 'TN-S';

export type TnCareerHubDef = {
  icao: string;
  name: string;
  region: TnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Tunisia hubs. */
export const TN_CAREER_HUBS: readonly TnCareerHubDef[] = [
  {
    icao: 'DTTA',
    name: 'Tunis Carthage',
    region: 'TN-N',
    hubTier: 'major',
    lat: 36.851,
    lon: 10.2272,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.15 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'DTMB',
    name: 'Monastir Habib Bourguiba',
    region: 'TN-N',
    hubTier: 'regional',
    lat: 35.7581,
    lon: 10.7547,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'DTTJ',
    name: 'Djerba Zarzis',
    region: 'TN-S',
    hubTier: 'regional',
    lat: 33.875,
    lon: 10.7755,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'DTTX',
    name: 'Sfax Thyna',
    region: 'TN-S',
    hubTier: 'spoke',
    lat: 34.7178,
    lon: 10.6908,
    produce: { machinery: 1.15, general: 1.2, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
];

export const TN_CAREER_HUB_COUNT = 4;

export function buildTnFeederCorridors(
  hubs: readonly TnCareerHubDef[] = TN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTnCareerHubCatalog(): void {
  if (TN_CAREER_HUBS.length !== TN_CAREER_HUB_COUNT) {
    throw new Error(
      `TN_CAREER_HUBS length ${TN_CAREER_HUBS.length} !== ${TN_CAREER_HUB_COUNT}`,
    );
  }
  if (!TN_CAREER_HUBS.some((h) => h.icao === 'DTTA' && h.hubTier === 'major')) {
    throw new Error('TN catalog must include major DTTA');
  }
}
