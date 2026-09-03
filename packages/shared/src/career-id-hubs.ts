/**
 * Indonesia career hub catalog — Asia-12 Java / Sumatra / Wallacea face.
 *
 * Jakarta cargo major is WIII Soekarno-Hatta (not WIHH Halim). Medan civil is
 * WIMM Kualanamu (not closed WIMK Polonia / Soewondo). Bali is WADD (legacy
 * WRRR omitted). Semarang WARS/WAHS, Yogyakarta WAHI, Batam WIDD, Papua WAJJ,
 * and Manado WAMM are deferred.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { ID_DENSIFY_HUBS, ID_DENSIFY_HUB_COUNT } from './career-id-hubs-densify.js';

export type IdCareerRegion = 'ID-J' | 'ID-S' | 'ID-B' | 'ID-K' | 'ID-U';

export type IdCareerHubDef = {
  icao: string;
  name: string;
  region: IdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 6 curated Indonesia hubs. Tanjung Priok pickup is WIII; Tanjung Perak is WARR. */
export const ID_CAREER_HUBS: readonly IdCareerHubDef[] = [
  {
    icao: 'WIII',
    name: 'Jakarta Soekarno-Hatta',
    region: 'ID-J',
    hubTier: 'major',
    lat: -6.1256,
    lon: 106.656,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'WARR',
    name: 'Surabaya Juanda',
    region: 'ID-J',
    hubTier: 'regional',
    lat: -7.3798,
    lon: 112.787,
    produce: { machinery: 1.3, general: 1.35, supplies: 1.15 },
    consume: { perishables: 1.15, electronics: 1.05, fuel: 1.15 },
  },
  {
    icao: 'WIMM',
    name: 'Medan Kualanamu',
    region: 'ID-S',
    hubTier: 'regional',
    lat: 3.6378,
    lon: 98.8706,
    produce: { perishables: 1.3, general: 1.3, supplies: 1.15 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
  {
    icao: 'WADD',
    name: 'Denpasar Ngurah Rai',
    region: 'ID-B',
    hubTier: 'regional',
    lat: -8.7484,
    lon: 115.1671,
    produce: { general: 1.35, electronics: 1.15, perishables: 1.2 },
    consume: { supplies: 1.2, machinery: 1.0, fuel: 1.2 },
  },
  {
    icao: 'WALL',
    name: 'Balikpapan Sepinggan',
    region: 'ID-K',
    hubTier: 'regional',
    lat: -1.2683,
    lon: 116.8945,
    produce: { machinery: 1.35, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 1.0, fuel: 1.2 },
  },
  {
    icao: 'WAAA',
    name: 'Makassar Sultan Hasanuddin',
    region: 'ID-U',
    hubTier: 'regional',
    lat: -5.0755,
    lon: 119.5537,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 1.0, fuel: 1.15 },
  },
  ...ID_DENSIFY_HUBS,
];

export const ID_CAREER_HUB_COUNT = 6 + ID_DENSIFY_HUB_COUNT;

export function buildIdFeederCorridors(
  hubs: readonly IdCareerHubDef[] = ID_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIdCareerHubCatalog(): void {
  if (ID_CAREER_HUBS.length !== ID_CAREER_HUB_COUNT) {
    throw new Error(
      `ID_CAREER_HUBS length ${ID_CAREER_HUBS.length} !== ${ID_CAREER_HUB_COUNT}`,
    );
  }
  if (!ID_CAREER_HUBS.some((h) => h.icao === 'WIII' && h.hubTier === 'major')) {
    throw new Error('ID catalog must include major WIII (Soekarno-Hatta)');
  }
  if (ID_CAREER_HUBS.some((h) => h.icao === 'WIHH' && h.hubTier === 'major')) {
    throw new Error('ID catalog must not treat WIHH Halim as the cargo major');
  }
  if (
    ID_CAREER_HUBS.some((h) =>
      ['WIMK', 'WRRR', 'WIDD', 'WAJJ', 'WAMM'].includes(h.icao),
    )
  ) {
    throw new Error(
      'ID catalog must not seed WIMK / WRRR / WIDD / WAJJ / WAMM',
    );
  }
}
