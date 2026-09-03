/**
 * Bulgaria career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { BG_DENSIFY_HUBS, BG_DENSIFY_HUB_COUNT } from './career-bg-hubs-densify.js';

export type BgCareerRegion = 'BG-C';

export type BgCareerHubDef = {
  icao: string;
  name: string;
  region: BgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Bulgaria hubs. */
export const BG_CAREER_HUBS: readonly BgCareerHubDef[] = [
  {
    icao: 'LBSF',
    name: 'Sofia',
    region: 'BG-C',
    hubTier: 'major',
    lat: 42.6952,
    lon: 23.4062,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LBWN',
    name: 'Varna',
    region: 'BG-C',
    hubTier: 'regional',
    lat: 43.2321,
    lon: 27.8251,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LBBG',
    name: 'Burgas',
    region: 'BG-C',
    hubTier: 'regional',
    lat: 42.5696,
    lon: 27.5152,
    produce: { general: 1.2, perishables: 1.2, machinery: 1.05 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LBPD',
    name: 'Plovdiv',
    region: 'BG-C',
    hubTier: 'spoke',
    lat: 42.0678,
    lon: 24.8508,
    produce: { general: 1.15, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  ...BG_DENSIFY_HUBS,
];

export const BG_CAREER_HUB_COUNT = 4 + BG_DENSIFY_HUB_COUNT;

export function buildBgFeederCorridors(
  hubs: readonly BgCareerHubDef[] = BG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBgCareerHubCatalog(): void {
  if (BG_CAREER_HUBS.length !== BG_CAREER_HUB_COUNT) {
    throw new Error(
      `BG_CAREER_HUBS length ${BG_CAREER_HUBS.length} !== ${BG_CAREER_HUB_COUNT}`,
    );
  }
  if (!BG_CAREER_HUBS.some((h) => h.icao === 'LBSF' && h.hubTier === 'major')) {
    throw new Error('BG catalog must include major LBSF');
  }
}
