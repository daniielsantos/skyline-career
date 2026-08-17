/**
 * Taiwan career hub catalog — Asia-14 Formosa Strait face.
 *
 * Taipei cargo major is RCTP Taoyuan (not RCSS Songshan). Kaohsiung RCKH is
 * the southern seaport pickup. Taichung RCMQ and Tainan RCNN added Asia-31.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TwCareerRegion = 'TW-N' | 'TW-S' | 'TW-C';

export type TwCareerHubDef = {
  icao: string;
  name: string;
  region: TwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 5 curated Taiwan hubs. Keelung/Taipei pickup is RCTP; Kaohsiung is RCKH. */
export const TW_CAREER_HUBS: readonly TwCareerHubDef[] = [
  {
    icao: 'RCTP',
    name: 'Taiwan Taoyuan International',
    region: 'TW-N',
    hubTier: 'major',
    lat: 25.0777,
    lon: 121.233,
    produce: { electronics: 1.55, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'RCSS',
    name: 'Taipei Songshan',
    region: 'TW-N',
    hubTier: 'regional',
    lat: 25.0672,
    lon: 121.5528,
    produce: { general: 1.3, electronics: 1.2, supplies: 1.1 },
    consume: { perishables: 1.15, machinery: 1.0, fuel: 1.1 },
  },
  {
    icao: 'RCKH',
    name: 'Kaohsiung International',
    region: 'TW-S',
    hubTier: 'regional',
    lat: 22.5771,
    lon: 120.35,
    produce: { machinery: 1.3, general: 1.35, electronics: 1.2 },
    consume: { perishables: 1.15, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'RCMQ',
    name: 'Taichung International',
    region: 'TW-C',
    hubTier: 'regional',
    lat: 24.2647,
    lon: 120.621,
    produce: { machinery: 1.25, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.1, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'RCNN',
    name: 'Tainan International',
    region: 'TW-S',
    hubTier: 'regional',
    lat: 22.9504,
    lon: 120.206,
    produce: { electronics: 1.2, general: 1.25, supplies: 1.05 },
    consume: { perishables: 1.1, machinery: 0.95, fuel: 1.1 },
  },
];

export const TW_CAREER_HUB_COUNT = 5;

export function buildTwFeederCorridors(
  hubs: readonly TwCareerHubDef[] = TW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTwCareerHubCatalog(): void {
  if (TW_CAREER_HUBS.length !== TW_CAREER_HUB_COUNT) {
    throw new Error(
      `TW_CAREER_HUBS length ${TW_CAREER_HUBS.length} !== ${TW_CAREER_HUB_COUNT}`,
    );
  }
  if (!TW_CAREER_HUBS.some((h) => h.icao === 'RCTP' && h.hubTier === 'major')) {
    throw new Error('TW catalog must include major RCTP (Taoyuan)');
  }
  if (TW_CAREER_HUBS.some((h) => h.icao === 'RCSS' && h.hubTier === 'major')) {
    throw new Error('TW catalog must not treat RCSS Songshan as the cargo major');
  }
  if (TW_CAREER_HUBS.some((h) => h.icao === 'RCQC')) {
    throw new Error('TW catalog must not seed RCQC');
  }
}
