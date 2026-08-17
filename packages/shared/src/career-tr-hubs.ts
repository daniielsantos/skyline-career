/**
 * Turkey career hub catalog — EU-7 East.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TrCareerRegion = 'TR-W' | 'TR-C' | 'TR-E';

export type TrCareerHubDef = {
  icao: string;
  name: string;
  region: TrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 8 curated Turkey hubs. */
export const TR_CAREER_HUBS: readonly TrCareerHubDef[] = [
  {
    icao: 'LTFM',
    name: 'Istanbul',
    region: 'TR-W',
    hubTier: 'major',
    lat: 41.2753,
    lon: 28.7519,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.1 },
  },
  {
    icao: 'LTFJ',
    name: 'Istanbul Sabiha Gokcen',
    region: 'TR-W',
    hubTier: 'regional',
    lat: 40.8986,
    lon: 29.3092,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'LTBJ',
    name: 'Izmir Adnan Menderes',
    region: 'TR-W',
    hubTier: 'regional',
    lat: 38.2924,
    lon: 27.157,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LTAC',
    name: 'Ankara Esenboga',
    region: 'TR-C',
    hubTier: 'major',
    lat: 40.1281,
    lon: 32.9951,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LTAI',
    name: 'Antalya',
    region: 'TR-C',
    hubTier: 'regional',
    lat: 36.8987,
    lon: 30.8005,
    produce: { perishables: 1.35, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 0.95 },
  },
  {
    icao: 'LTAJ',
    name: 'Gaziantep',
    region: 'TR-E',
    hubTier: 'regional',
    lat: 36.9472,
    lon: 37.4787,
    produce: { general: 1.25, machinery: 1.15, perishables: 1.15 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LTCG',
    name: 'Trabzon',
    region: 'TR-E',
    hubTier: 'regional',
    lat: 40.9951,
    lon: 39.7897,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'LTCE',
    name: 'Erzurum',
    region: 'TR-E',
    hubTier: 'spoke',
    lat: 39.9565,
    lon: 41.1702,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const TR_CAREER_HUB_COUNT = 8;

export function buildTrFeederCorridors(
  hubs: readonly TrCareerHubDef[] = TR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTrCareerHubCatalog(): void {
  if (TR_CAREER_HUBS.length !== TR_CAREER_HUB_COUNT) {
    throw new Error(
      `TR_CAREER_HUBS length ${TR_CAREER_HUBS.length} !== ${TR_CAREER_HUB_COUNT}`,
    );
  }
  if (!TR_CAREER_HUBS.some((h) => h.icao === 'LTFM' && h.hubTier === 'major')) {
    throw new Error('TR catalog must include major LTFM');
  }
  if (!TR_CAREER_HUBS.some((h) => h.icao === 'LTAC' && h.hubTier === 'major')) {
    throw new Error('TR catalog must include major LTAC');
  }
}
