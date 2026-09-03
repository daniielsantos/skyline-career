/**
 * South Korea career hub catalog — Asia-13 Yellow Sea / Korea Strait face.
 *
 * Seoul cargo major is RKSI Incheon (not RKSS Gimpo). Busan is RKPK Gimhae.
 * Jeju RKPC is an island fuel hub. North Korea KP* omitted.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { KR_DENSIFY_HUBS, KR_DENSIFY_HUB_COUNT } from './career-kr-hubs-densify.js';

export type KrCareerRegion = 'KR-C' | 'KR-S' | 'KR-J';

export type KrCareerHubDef = {
  icao: string;
  name: string;
  region: KrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Korea hubs. Incheon port pickup is RKSI; Busan is RKPK. */
export const KR_CAREER_HUBS: readonly KrCareerHubDef[] = [
  {
    icao: 'RKSI',
    name: 'Seoul Incheon',
    region: 'KR-C',
    hubTier: 'major',
    lat: 37.4691,
    lon: 126.451,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'RKPK',
    name: 'Busan Gimhae',
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.1795,
    lon: 128.938,
    produce: { machinery: 1.3, general: 1.35, supplies: 1.15 },
    consume: { perishables: 1.15, electronics: 1.05, fuel: 1.15 },
  },
  {
    icao: 'RKPC',
    name: 'Jeju International',
    region: 'KR-J',
    hubTier: 'regional',
    lat: 33.5121,
    lon: 126.4925,
    produce: { general: 1.25, perishables: 1.2, electronics: 1.1 },
    consume: { supplies: 1.15, machinery: 1.0, fuel: 1.2 },
  },
  ...KR_DENSIFY_HUBS,
];

export const KR_CAREER_HUB_COUNT = 3 + KR_DENSIFY_HUB_COUNT;

export function buildKrFeederCorridors(
  hubs: readonly KrCareerHubDef[] = KR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKrCareerHubCatalog(): void {
  if (KR_CAREER_HUBS.length !== KR_CAREER_HUB_COUNT) {
    throw new Error(
      `KR_CAREER_HUBS length ${KR_CAREER_HUBS.length} !== ${KR_CAREER_HUB_COUNT}`,
    );
  }
  if (!KR_CAREER_HUBS.some((h) => h.icao === 'RKSI' && h.hubTier === 'major')) {
    throw new Error('KR catalog must include major RKSI (Incheon)');
  }
  if (KR_CAREER_HUBS.some((h) => h.icao === 'RKSS' && h.hubTier === 'major')) {
    throw new Error('KR catalog must not treat RKSS Gimpo as the cargo major');
  }
  if (KR_CAREER_HUBS.some((h) => ['RKSS', 'RKJB'].includes(h.icao))) {
    throw new Error('KR catalog must not seed RKSS Gimpo or RKJB Muan');
  }
}
