/**
 * Zimbabwe career hub catalog — AF-3 Sub-Saharan leftovers.
 * Landlocked — no seaport pickup.
 *
 * Harare cargo major is FVHA (stock ident). FVRG remaps to FVHA.
 * Bulawayo is FVBU (not FVJN).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ZwCareerRegion = 'ZW-C' | 'ZW-S';

export type ZwCareerHubDef = {
  icao: string;
  name: string;
  region: ZwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Zimbabwe hubs. Harare is FVHA; Bulawayo is FVBU. */
export const ZW_CAREER_HUBS: readonly ZwCareerHubDef[] = [
  {
    icao: 'FVHA',
    name: 'Harare Robert Gabriel Mugabe',
    region: 'ZW-C',
    hubTier: 'major',
    lat: -17.9318,
    lon: 31.0928,
    produce: { electronics: 1.3, general: 1.4, machinery: 1.15 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FVBU',
    name: 'Bulawayo Joshua Mqabuko Nkomo',
    region: 'ZW-S',
    hubTier: 'regional',
    lat: -20.0163,
    lon: 28.6229,
    produce: { general: 1.25, machinery: 1.2, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
];

export const ZW_CAREER_HUB_COUNT = 2;

export function buildZwFeederCorridors(
  hubs: readonly ZwCareerHubDef[] = ZW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertZwCareerHubCatalog(): void {
  if (ZW_CAREER_HUBS.length !== ZW_CAREER_HUB_COUNT) {
    throw new Error(
      `ZW_CAREER_HUBS length ${ZW_CAREER_HUBS.length} !== ${ZW_CAREER_HUB_COUNT}`,
    );
  }
  if (!ZW_CAREER_HUBS.some((h) => h.icao === 'FVHA' && h.hubTier === 'major')) {
    throw new Error('ZW catalog must include major FVHA (Harare)');
  }
  if (!ZW_CAREER_HUBS.some((h) => h.icao === 'FVBU')) {
    throw new Error('ZW catalog must include FVBU Bulawayo');
  }
  if (ZW_CAREER_HUBS.some((h) => h.icao === 'FVRG')) {
    throw new Error('ZW catalog must use FVHA for Harare, not FVRG');
  }
  if (ZW_CAREER_HUBS.some((h) => h.icao === 'FVJN')) {
    throw new Error('ZW catalog must use FVBU for Bulawayo, not FVJN');
  }
}
