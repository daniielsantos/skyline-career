/**
 * Syria career hub catalog — MENA-4 Levant-east.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SyCareerRegion = 'SY-S' | 'SY-N';

export type SyCareerHubDef = {
  icao: string;
  name: string;
  region: SyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const inland = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 3 curated Syria hubs. Damascus is OSDI. */
export const SY_CAREER_HUBS: readonly SyCareerHubDef[] = [
  {
    icao: 'OSDI',
    name: 'Damascus International',
    region: 'SY-S',
    hubTier: 'major',
    lat: 33.4114,
    lon: 36.5156,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OSAP',
    name: 'Aleppo',
    region: 'SY-N',
    hubTier: 'regional',
    lat: 36.1807,
    lon: 37.2244,
    ...inland,
  },
  {
    icao: 'OSLK',
    name: 'Latakia Bassel Al-Assad',
    region: 'SY-N',
    hubTier: 'spoke',
    lat: 35.4011,
    lon: 35.9487,
    produce: { machinery: 1.2, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
];

export const SY_CAREER_HUB_COUNT = 3;

export function buildSyFeederCorridors(
  hubs: readonly SyCareerHubDef[] = SY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSyCareerHubCatalog(): void {
  if (SY_CAREER_HUBS.length !== SY_CAREER_HUB_COUNT) {
    throw new Error(
      `SY_CAREER_HUBS length ${SY_CAREER_HUBS.length} !== ${SY_CAREER_HUB_COUNT}`,
    );
  }
  if (!SY_CAREER_HUBS.some((h) => h.icao === 'OSDI' && h.hubTier === 'major')) {
    throw new Error('SY catalog must include major OSDI');
  }
  if (!SY_CAREER_HUBS.some((h) => h.icao === 'OSLK')) {
    throw new Error('SY catalog must include OSLK Latakia (port pickup)');
  }
}
