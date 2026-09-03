/**
 * Portugal career hub catalog — EU-1 Western core.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { PT_DENSIFY_HUBS, PT_DENSIFY_HUB_COUNT } from './career-pt-hubs-densify.js';

export type PtCareerRegion = 'PT-N' | 'PT-C' | 'PT-S' | 'PT-M' | 'PT-A';

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

/** 9 curated Portugal hubs (mainland + Madeira + Azores). */
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
  {
    icao: 'LPMA',
    name: 'Funchal Cristiano Ronaldo',
    region: 'PT-M',
    hubTier: 'major',
    lat: 32.6978,
    lon: -16.7746,
    produce: { perishables: 1.3, general: 1.25, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'LPPD',
    name: 'Ponta Delgada João Paulo II',
    region: 'PT-A',
    hubTier: 'major',
    lat: 37.7412,
    lon: -25.6979,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.2 },
  },
  ...PT_DENSIFY_HUBS,
];

export const PT_CAREER_HUB_COUNT = 9 + PT_DENSIFY_HUB_COUNT;

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
  if (!PT_CAREER_HUBS.some((h) => h.icao === 'LPMA' && h.hubTier === 'major')) {
    throw new Error('PT catalog must include major LPMA (Madeira)');
  }
  if (!PT_CAREER_HUBS.some((h) => h.icao === 'LPPD' && h.hubTier === 'major')) {
    throw new Error('PT catalog must include major LPPD (Azores)');
  }
  if (PT_CAREER_HUBS.some((h) => h.icao === 'LPPS')) {
    throw new Error('PT catalog must use LPMA for Madeira, not LPPS Porto Santo');
  }
  if (PT_CAREER_HUBS.some((h) => h.icao === 'LPLA')) {
    throw new Error('PT catalog must use LPPD for Azores cargo, not LPLA Lajes');
  }
  if (PT_CAREER_HUBS.some((h) => h.icao === 'LPVL')) {
    throw new Error('PT catalog must use LPVZ for Viseu, not LPVL Vilar de Luz');
  }
  if (PT_CAREER_HUBS.some((h) => h.icao === 'LPSI')) {
    throw new Error('PT catalog must use LPPM for Portimao, not LPSI Sines');
  }
}
