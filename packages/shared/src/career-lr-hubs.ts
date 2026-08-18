/**
 * Liberia career hub catalog — AF-5 West Africa leftovers.
 *
 * Monrovia cargo major is GLRB Roberts (not GLMR Spriggs Payne).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LrCareerRegion = 'LR-C';

export type LrCareerHubDef = {
  icao: string;
  name: string;
  region: LrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Liberia hub. Monrovia is GLRB (not GLMR). */
export const LR_CAREER_HUBS: readonly LrCareerHubDef[] = [
  {
    icao: 'GLRB',
    name: 'Monrovia Roberts',
    region: 'LR-C',
    hubTier: 'major',
    lat: 6.2338,
    lon: -10.3623,
    produce: { general: 1.3, machinery: 1.2, supplies: 1.15 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
];

export const LR_CAREER_HUB_COUNT = 1;

export function buildLrFeederCorridors(
  hubs: readonly LrCareerHubDef[] = LR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLrCareerHubCatalog(): void {
  if (LR_CAREER_HUBS.length !== LR_CAREER_HUB_COUNT) {
    throw new Error(
      `LR_CAREER_HUBS length ${LR_CAREER_HUBS.length} !== ${LR_CAREER_HUB_COUNT}`,
    );
  }
  if (!LR_CAREER_HUBS.some((h) => h.icao === 'GLRB' && h.hubTier === 'major')) {
    throw new Error('LR catalog must include major GLRB (Roberts)');
  }
  if (LR_CAREER_HUBS.some((h) => h.icao === 'GLMR')) {
    throw new Error('LR catalog must use GLRB for Monrovia cargo, not GLMR Spriggs Payne');
  }
}
