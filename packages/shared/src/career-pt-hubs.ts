/**
 * Portugal career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PtCareerRegion = 'PT-N' | 'PT-C' | 'PT-S';

export type PtCareerHubDef = {
  icao: string;
  name: string;
  region: PtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const city = {
  produce: { general: 1.2, electronics: 1.05, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated Portugal hubs. */
export const PT_CAREER_HUBS: readonly PtCareerHubDef[] = [
  {
    icao: 'LPPR',
    name: 'Porto Francisco Sa Carneiro',
    region: 'PT-N',
    hubTier: 'regional',
    lat: 41.2481,
    lon: -8.68139,
    produce: { general: 1.25, machinery: 1.15, electronics: 1.05 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'LPVR',
    name: 'Vila Real',
    region: 'PT-N',
    hubTier: 'spoke',
    lat: 41.2744,
    lon: -7.72047,
    ...agro,
  },
  {
    icao: 'LPPT',
    name: 'Lisbon Humberto Delgado',
    region: 'PT-C',
    hubTier: 'major',
    lat: 38.7813,
    lon: -9.13592,
    produce: { general: 1.45, electronics: 1.25, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'LPCS',
    name: 'Cascais',
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.725,
    lon: -9.35523,
    ...city,
  },
  {
    icao: 'LPBJ',
    name: 'Beja',
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.0789,
    lon: -7.9324,
    ...agro,
  },
  {
    icao: 'LPFR',
    name: 'Faro',
    region: 'PT-S',
    hubTier: 'regional',
    lat: 37.0144,
    lon: -7.96591,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LPPM',
    name: 'Portimao',
    region: 'PT-S',
    hubTier: 'spoke',
    lat: 37.1493,
    lon: -8.58396,
    ...agro,
  },
];

export const PT_CAREER_HUB_COUNT = 7;

export function buildPtFeederCorridors(
  hubs: readonly PtCareerHubDef[] = PT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPtCareerHubCatalog(): void {
  if (PT_CAREER_HUBS.length !== PT_CAREER_HUB_COUNT) {
    throw new Error(
      `PT_CAREER_HUBS length ${PT_CAREER_HUBS.length} !== ${PT_CAREER_HUB_COUNT}`,
    );
  }
  if (!PT_CAREER_HUBS.some((h) => h.icao === 'LPPT' && h.hubTier === 'major')) {
    throw new Error('PT catalog must include major LPPT');
  }
}
