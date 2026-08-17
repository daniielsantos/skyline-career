/**
 * Romania career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type RoCareerRegion = 'RO-W' | 'RO-E';

export type RoCareerHubDef = {
  icao: string;
  name: string;
  region: RoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const industrial = {
  produce: { machinery: 1.25, electronics: 1.15, general: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Romania hubs. */
export const RO_CAREER_HUBS: readonly RoCareerHubDef[] = [
  {
    icao: 'LRTR',
    name: 'Timisoara Traian Vuia',
    region: 'RO-W',
    hubTier: 'regional',
    lat: 45.8099,
    lon: 21.3379,
    ...industrial,
  },
  {
    icao: 'LRCL',
    name: 'Cluj Napoca',
    region: 'RO-W',
    hubTier: 'regional',
    lat: 46.7852,
    lon: 23.6862,
    ...industrial,
  },
  {
    icao: 'LRSB',
    name: 'Sibiu',
    region: 'RO-W',
    hubTier: 'spoke',
    lat: 45.7856,
    lon: 24.0913,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LROP',
    name: 'Bucharest Henri Coanda',
    region: 'RO-E',
    hubTier: 'major',
    lat: 44.5711,
    lon: 26.085,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LRIA',
    name: 'Iasi',
    region: 'RO-E',
    hubTier: 'regional',
    lat: 47.1785,
    lon: 27.6206,
    produce: { general: 1.2, perishables: 1.2, electronics: 1.05 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LRCV',
    name: 'Craiova',
    region: 'RO-E',
    hubTier: 'spoke',
    lat: 44.3181,
    lon: 23.8886,
    ...industrial,
  },
];

export const RO_CAREER_HUB_COUNT = 6;

export function buildRoFeederCorridors(
  hubs: readonly RoCareerHubDef[] = RO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertRoCareerHubCatalog(): void {
  if (RO_CAREER_HUBS.length !== RO_CAREER_HUB_COUNT) {
    throw new Error(
      `RO_CAREER_HUBS length ${RO_CAREER_HUBS.length} !== ${RO_CAREER_HUB_COUNT}`,
    );
  }
  if (!RO_CAREER_HUBS.some((h) => h.icao === 'LROP' && h.hubTier === 'major')) {
    throw new Error('RO catalog must include major LROP');
  }
}
