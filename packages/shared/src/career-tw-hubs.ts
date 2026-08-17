/**
 * Taiwan career hub catalog — Asia-14 Formosa Strait face.
 *
 * Taipei cargo major is RCTP Taoyuan (not RCSS Songshan). Kaohsiung RCKH is
 * the southern seaport pickup. Taichung RCMQ / Tainan RCNN air bases omitted.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TwCareerRegion = 'TW-N' | 'TW-S';

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

/** 3 curated Taiwan hubs. Keelung/Taipei pickup is RCTP; Kaohsiung is RCKH. */
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
];

export const TW_CAREER_HUB_COUNT = 3;

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
  if (TW_CAREER_HUBS.some((h) => ['RCMQ', 'RCNN', 'RCQC'].includes(h.icao))) {
    throw new Error('TW catalog must not seed RCMQ / RCNN / RCQC');
  }
}
