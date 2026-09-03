/**
 * Grenada career hub catalog — intl-first light chain.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { GD_DENSIFY_HUBS, GD_DENSIFY_HUB_COUNT } from './career-gd-hubs-densify.js';

export type GdCareerRegion = 'GD-C';

export type GdCareerHubDef = {
  icao: string;
  name: string;
  region: GdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated + densify Grenada hubs — Maurice Bishop + Carriacou. */
export const GD_CAREER_HUBS: readonly GdCareerHubDef[] = [
  {
    icao: 'TGPY',
    name: 'St Georges Maurice Bishop',
    region: 'GD-C',
    hubTier: 'major',
    lat: 12.0042,
    lon: -61.7862,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  ...GD_DENSIFY_HUBS,
];

export const GD_CAREER_HUB_COUNT = 1 + GD_DENSIFY_HUB_COUNT;

export function buildGdFeederCorridors(
  hubs: readonly GdCareerHubDef[] = GD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGdCareerHubCatalog(): void {
  if (GD_CAREER_HUBS.length !== GD_CAREER_HUB_COUNT) {
    throw new Error(
      `GD_CAREER_HUBS length ${GD_CAREER_HUBS.length} !== ${GD_CAREER_HUB_COUNT}`,
    );
  }
  if (!GD_CAREER_HUBS.some((h) => h.icao === 'TGPY' && h.region === 'GD-C')) {
    throw new Error('GD catalog must include TGPY / GD-C');
  }
}
