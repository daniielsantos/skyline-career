/**
 * Mali career hub catalog — AF-5 West Africa leftovers.
 * Landlocked — no seaport pickup.
 *
 * Bamako cargo major is GABS Modibo Keita (not GAGO Gao).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MlCareerRegion = 'ML-C';

export type MlCareerHubDef = {
  icao: string;
  name: string;
  region: MlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Mali hub. Bamako is GABS (not GAGO). */
export const ML_CAREER_HUBS: readonly MlCareerHubDef[] = [
  {
    icao: 'GABS',
    name: 'Bamako Modibo Keita',
    region: 'ML-C',
    hubTier: 'major',
    lat: 12.5335,
    lon: -7.9499,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.95, fuel: 1.15 },
  },
];

export const ML_CAREER_HUB_COUNT = 1;

export function buildMlFeederCorridors(
  hubs: readonly MlCareerHubDef[] = ML_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMlCareerHubCatalog(): void {
  if (ML_CAREER_HUBS.length !== ML_CAREER_HUB_COUNT) {
    throw new Error(
      `ML_CAREER_HUBS length ${ML_CAREER_HUBS.length} !== ${ML_CAREER_HUB_COUNT}`,
    );
  }
  if (!ML_CAREER_HUBS.some((h) => h.icao === 'GABS' && h.hubTier === 'major')) {
    throw new Error('ML catalog must include major GABS (Bamako)');
  }
  if (ML_CAREER_HUBS.some((h) => h.icao === 'GAGO')) {
    throw new Error('ML catalog must use GABS for Bamako, not GAGO Gao');
  }
}
