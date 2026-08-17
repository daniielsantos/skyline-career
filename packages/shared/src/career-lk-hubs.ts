/**
 * Sri Lanka career hub catalog — Asia-4 Indian Ocean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LkCareerRegion = 'LK-W' | 'LK-E';

export type LkCareerHubDef = {
  icao: string;
  name: string;
  region: LkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const island = {
  produce: { general: 1.2, perishables: 1.2, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 4 curated Sri Lanka hubs. Colombo intl is VCBI (not VCCC Ratmalana). */
export const LK_CAREER_HUBS: readonly LkCareerHubDef[] = [
  {
    icao: 'VCBI',
    name: 'Colombo Bandaranaike',
    region: 'LK-W',
    hubTier: 'major',
    lat: 7.1808,
    lon: 79.8841,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'VCCC',
    name: 'Colombo Ratmalana',
    region: 'LK-W',
    hubTier: 'spoke',
    lat: 6.8216,
    lon: 79.8859,
    ...island,
  },
  {
    icao: 'VCRI',
    name: 'Mattala Rajapaksa',
    region: 'LK-E',
    hubTier: 'regional',
    lat: 6.2839,
    lon: 81.1242,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VCCJ',
    name: 'Jaffna International',
    region: 'LK-E',
    hubTier: 'spoke',
    lat: 9.7923,
    lon: 80.0701,
    ...island,
  },
];

export const LK_CAREER_HUB_COUNT = 4;

export function buildLkFeederCorridors(
  hubs: readonly LkCareerHubDef[] = LK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLkCareerHubCatalog(): void {
  if (LK_CAREER_HUBS.length !== LK_CAREER_HUB_COUNT) {
    throw new Error(
      `LK_CAREER_HUBS length ${LK_CAREER_HUBS.length} !== ${LK_CAREER_HUB_COUNT}`,
    );
  }
  if (!LK_CAREER_HUBS.some((h) => h.icao === 'VCBI' && h.hubTier === 'major')) {
    throw new Error('LK catalog must include major VCBI (Colombo Bandaranaike)');
  }
  if (!LK_CAREER_HUBS.some((h) => h.icao === 'VCRI')) {
    throw new Error('LK catalog must include VCRI Mattala');
  }
  const colomboMajor = LK_CAREER_HUBS.find((h) => h.icao === 'VCCC');
  if (colomboMajor?.hubTier === 'major') {
    throw new Error('VCCC Ratmalana must not be the Colombo major (use VCBI)');
  }
}
