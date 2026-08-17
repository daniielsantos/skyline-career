/**
 * Albania career hub catalog — EU-6 W. Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AlCareerRegion = 'AL-C';

export type AlCareerHubDef = {
  icao: string;
  name: string;
  region: AlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Albania hubs. */
export const AL_CAREER_HUBS: readonly AlCareerHubDef[] = [
  {
    icao: 'LATI',
    name: 'Tirana Mother Teresa',
    region: 'AL-C',
    hubTier: 'major',
    lat: 41.4147,
    lon: 19.7206,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LAKU',
    name: 'Kukes',
    region: 'AL-C',
    hubTier: 'spoke',
    lat: 42.0339,
    lon: 20.4158,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const AL_CAREER_HUB_COUNT = 2;

export function buildAlFeederCorridors(
  hubs: readonly AlCareerHubDef[] = AL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAlCareerHubCatalog(): void {
  if (AL_CAREER_HUBS.length !== AL_CAREER_HUB_COUNT) {
    throw new Error(
      `AL_CAREER_HUBS length ${AL_CAREER_HUBS.length} !== ${AL_CAREER_HUB_COUNT}`,
    );
  }
  if (!AL_CAREER_HUBS.some((h) => h.icao === 'LATI' && h.hubTier === 'major')) {
    throw new Error('AL catalog must include major LATI');
  }
}
