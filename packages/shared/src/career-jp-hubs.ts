/**
 * Japan career hub catalog — Asia-13 Kanto / Kansai / Kyushu / Hokkaido face.
 *
 * Tokyo cargo major is RJAA Narita (not RJTT Haneda). Kansai is RJBB (not
 * Itami RJOO). Nagoya Komaki RJNN omitted (Centrair RJGG deferred). Okinawa
 * ROAH deferred.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { JP_DENSIFY_HUBS, JP_DENSIFY_HUB_COUNT } from './career-jp-hubs-densify.js';

export type JpCareerRegion = 'JP-E' | 'JP-W' | 'JP-S' | 'JP-N';

export type JpCareerHubDef = {
  icao: string;
  name: string;
  region: JpCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 5 curated Japan hubs. Tokyo/Yokohama pickup is RJTT; Osaka/Kobe is RJBB. */
export const JP_CAREER_HUBS: readonly JpCareerHubDef[] = [
  {
    icao: 'RJAA',
    name: 'Tokyo Narita',
    region: 'JP-E',
    hubTier: 'major',
    lat: 35.7686,
    lon: 140.3887,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'RJTT',
    name: 'Tokyo Haneda',
    region: 'JP-E',
    hubTier: 'regional',
    lat: 35.5497,
    lon: 139.787,
    produce: { general: 1.35, electronics: 1.2, supplies: 1.15 },
    consume: { perishables: 1.2, machinery: 1.05, fuel: 1.15 },
  },
  {
    icao: 'RJBB',
    name: 'Osaka Kansai',
    region: 'JP-W',
    hubTier: 'regional',
    lat: 34.4273,
    lon: 135.244,
    produce: { electronics: 1.35, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'RJFF',
    name: 'Fukuoka',
    region: 'JP-S',
    hubTier: 'regional',
    lat: 33.5859,
    lon: 130.451,
    produce: { general: 1.3, electronics: 1.2, perishables: 1.15 },
    consume: { machinery: 1.05, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'RJCC',
    name: 'Sapporo New Chitose',
    region: 'JP-N',
    hubTier: 'regional',
    lat: 42.7748,
    lon: 141.6904,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
  ...JP_DENSIFY_HUBS,
];

export const JP_CAREER_HUB_COUNT = 5 + JP_DENSIFY_HUB_COUNT;

export function buildJpFeederCorridors(
  hubs: readonly JpCareerHubDef[] = JP_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertJpCareerHubCatalog(): void {
  if (JP_CAREER_HUBS.length !== JP_CAREER_HUB_COUNT) {
    throw new Error(
      `JP_CAREER_HUBS length ${JP_CAREER_HUBS.length} !== ${JP_CAREER_HUB_COUNT}`,
    );
  }
  if (!JP_CAREER_HUBS.some((h) => h.icao === 'RJAA' && h.hubTier === 'major')) {
    throw new Error('JP catalog must include major RJAA (Narita)');
  }
  if (JP_CAREER_HUBS.some((h) => h.icao === 'RJTT' && h.hubTier === 'major')) {
    throw new Error('JP catalog must not treat RJTT Haneda as the cargo major');
  }
  if (JP_CAREER_HUBS.some((h) => ['RJOO', 'RJNN', 'ROAH', 'RJGG'].includes(h.icao))) {
    throw new Error('JP catalog must not seed Itami, Komaki, Naha, or Centrair');
  }
}
