/**
 * Greece career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { GR_DENSIFY_HUBS, GR_DENSIFY_HUB_COUNT } from './career-gr-hubs-densify.js';

export type GrCareerRegion = 'GR-N' | 'GR-S';

export type GrCareerHubDef = {
  icao: string;
  name: string;
  region: GrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const island = {
  produce: { perishables: 1.3, general: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 8 curated Greece hubs. */
export const GR_CAREER_HUBS: readonly GrCareerHubDef[] = [
  {
    icao: 'LGTS',
    name: 'Thessaloniki Makedonia',
    region: 'GR-N',
    hubTier: 'regional',
    lat: 40.5197,
    lon: 22.9709,
    produce: { general: 1.25, machinery: 1.15, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'LGAL',
    name: 'Alexandroupolis',
    region: 'GR-N',
    hubTier: 'spoke',
    lat: 40.8557,
    lon: 25.9563,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LGKR',
    name: 'Corfu Ioannis Kapodistrias',
    region: 'GR-N',
    hubTier: 'spoke',
    lat: 39.6019,
    lon: 19.9117,
    ...island,
  },
  {
    icao: 'LGAV',
    name: 'Athens Eleftherios Venizelos',
    region: 'GR-S',
    hubTier: 'major',
    lat: 37.9364,
    lon: 23.9445,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LGIR',
    name: 'Heraklion Nikos Kazantzakis',
    region: 'GR-S',
    hubTier: 'regional',
    lat: 35.3397,
    lon: 25.1803,
    ...island,
  },
  {
    icao: 'LGSA',
    name: 'Chania Ioannis Daskalogiannis',
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 35.5317,
    lon: 24.1497,
    ...island,
  },
  {
    icao: 'LGRP',
    name: 'Rhodes Diagoras',
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 36.4054,
    lon: 28.0862,
    ...island,
  },
  {
    icao: 'LGKO',
    name: 'Kos',
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 36.7933,
    lon: 27.0917,
    ...island,
  },
  ...GR_DENSIFY_HUBS,
];

export const GR_CAREER_HUB_COUNT = 8 + GR_DENSIFY_HUB_COUNT;

export function buildGrFeederCorridors(
  hubs: readonly GrCareerHubDef[] = GR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGrCareerHubCatalog(): void {
  if (GR_CAREER_HUBS.length !== GR_CAREER_HUB_COUNT) {
    throw new Error(
      `GR_CAREER_HUBS length ${GR_CAREER_HUBS.length} !== ${GR_CAREER_HUB_COUNT}`,
    );
  }
  if (!GR_CAREER_HUBS.some((h) => h.icao === 'LGAV' && h.hubTier === 'major')) {
    throw new Error('GR catalog must include major LGAV');
  }
}
