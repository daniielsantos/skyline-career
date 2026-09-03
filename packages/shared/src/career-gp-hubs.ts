/**
 * Guadeloupe career hub catalog — FR territory light (GF-style).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { GP_DENSIFY_HUBS, GP_DENSIFY_HUB_COUNT } from './career-gp-hubs-densify.js';

export type GpCareerRegion = 'GP-C';

export type GpCareerHubDef = {
  icao: string;
  name: string;
  region: GpCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated + densify Guadeloupe hubs — Pointe-a-Pitre + out-islands. */
export const GP_CAREER_HUBS: readonly GpCareerHubDef[] = [
  {
    icao: 'TFFR',
    name: 'Pointe-a-Pitre Le Raizet',
    region: 'GP-C',
    hubTier: 'major',
    lat: 16.2653,
    lon: -61.5318,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TFFM',
    name: 'Marie-Galante',
    region: 'GP-C',
    hubTier: 'spoke',
    lat: 15.8687,
    lon: -61.2701,
    produce: { perishables: 1.3, general: 1.05, supplies: 0.95 },
    consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
  },
  ...GP_DENSIFY_HUBS,
];

export const GP_CAREER_HUB_COUNT = 2 + GP_DENSIFY_HUB_COUNT;

export function buildGpFeederCorridors(
  hubs: readonly GpCareerHubDef[] = GP_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGpCareerHubCatalog(): void {
  if (GP_CAREER_HUBS.length !== GP_CAREER_HUB_COUNT) {
    throw new Error(
      `GP_CAREER_HUBS length ${GP_CAREER_HUBS.length} !== ${GP_CAREER_HUB_COUNT}`,
    );
  }
}
