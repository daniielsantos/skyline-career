/**
 * Croatia career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type HrCareerRegion = 'HR-N' | 'HR-S';

export type HrCareerHubDef = {
  icao: string;
  name: string;
  region: HrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const coastal = {
  produce: { perishables: 1.35, general: 1.2, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Croatia hubs. */
export const HR_CAREER_HUBS: readonly HrCareerHubDef[] = [
  {
    icao: 'LDZA',
    name: 'Zagreb',
    region: 'HR-N',
    hubTier: 'major',
    lat: 45.7429,
    lon: 16.0688,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LDPL',
    name: 'Pula',
    region: 'HR-N',
    hubTier: 'spoke',
    lat: 44.8935,
    lon: 13.9222,
    ...coastal,
  },
  {
    icao: 'LDSP',
    name: 'Split',
    region: 'HR-S',
    hubTier: 'regional',
    lat: 43.5389,
    lon: 16.298,
    ...coastal,
  },
  {
    icao: 'LDDU',
    name: 'Dubrovnik',
    region: 'HR-S',
    hubTier: 'regional',
    lat: 42.5614,
    lon: 18.2682,
    ...coastal,
  },
  {
    icao: 'LDZD',
    name: 'Zadar',
    region: 'HR-S',
    hubTier: 'spoke',
    lat: 44.1083,
    lon: 15.3467,
    ...coastal,
  },
];

export const HR_CAREER_HUB_COUNT = 5;

export function buildHrFeederCorridors(
  hubs: readonly HrCareerHubDef[] = HR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertHrCareerHubCatalog(): void {
  if (HR_CAREER_HUBS.length !== HR_CAREER_HUB_COUNT) {
    throw new Error(
      `HR_CAREER_HUBS length ${HR_CAREER_HUBS.length} !== ${HR_CAREER_HUB_COUNT}`,
    );
  }
  if (!HR_CAREER_HUBS.some((h) => h.icao === 'LDZA' && h.hubTier === 'major')) {
    throw new Error('HR catalog must include major LDZA');
  }
}
