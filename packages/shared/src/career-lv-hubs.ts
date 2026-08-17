/**
 * Latvia career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LvCareerRegion = 'LV-C';

export type LvCareerHubDef = {
  icao: string;
  name: string;
  region: LvCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Latvia hubs. */
export const LV_CAREER_HUBS: readonly LvCareerHubDef[] = [
  {
    icao: 'EVRA',
    name: 'Riga',
    region: 'LV-C',
    hubTier: 'major',
    lat: 56.9236,
    lon: 23.9711,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'EVLA',
    name: 'Liepaja',
    region: 'LV-C',
    hubTier: 'spoke',
    lat: 56.5175,
    lon: 21.0969,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'EVVA',
    name: 'Ventspils',
    region: 'LV-C',
    hubTier: 'spoke',
    lat: 57.3578,
    lon: 21.5442,
    produce: { general: 1.15, machinery: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
];

export const LV_CAREER_HUB_COUNT = 3;

export function buildLvFeederCorridors(
  hubs: readonly LvCareerHubDef[] = LV_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLvCareerHubCatalog(): void {
  if (LV_CAREER_HUBS.length !== LV_CAREER_HUB_COUNT) {
    throw new Error(
      `LV_CAREER_HUBS length ${LV_CAREER_HUBS.length} !== ${LV_CAREER_HUB_COUNT}`,
    );
  }
  if (!LV_CAREER_HUBS.some((h) => h.icao === 'EVRA' && h.hubTier === 'major')) {
    throw new Error('LV catalog must include major EVRA');
  }
}
