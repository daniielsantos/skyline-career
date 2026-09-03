/**
 * Mauritania career hub catalog — AF-6 Africa leftovers (Atlantic Sahel).
 *
 * Nouakchott cargo major is GQNO Oumtounsy (closed GQNN is not seeded).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { MR_DENSIFY_HUBS, MR_DENSIFY_HUB_COUNT } from './career-mr-hubs-densify.js';

export type MrCareerRegion = 'MR-W';

export type MrCareerHubDef = {
  icao: string;
  name: string;
  region: MrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Mauritania hub. Nouakchott is GQNO. */
export const MR_CAREER_HUBS: readonly MrCareerHubDef[] = [
  {
    icao: 'GQNO',
    name: 'Nouakchott Oumtounsy',
    region: 'MR-W',
    hubTier: 'major',
    lat: 18.31,
    lon: -15.9697,
    produce: { general: 1.3, supplies: 1.2, machinery: 1.1 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
  ...MR_DENSIFY_HUBS,
];

export const MR_CAREER_HUB_COUNT = 1 + MR_DENSIFY_HUB_COUNT;

export function buildMrFeederCorridors(
  hubs: readonly MrCareerHubDef[] = MR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMrCareerHubCatalog(): void {
  if (MR_CAREER_HUBS.length !== MR_CAREER_HUB_COUNT) {
    throw new Error(
      `MR_CAREER_HUBS length ${MR_CAREER_HUBS.length} !== ${MR_CAREER_HUB_COUNT}`,
    );
  }
  if (!MR_CAREER_HUBS.some((h) => h.icao === 'GQNO' && h.hubTier === 'major')) {
    throw new Error('MR catalog must include major GQNO (Oumtounsy)');
  }
  if (MR_CAREER_HUBS.some((h) => h.icao === 'GQNN')) {
    throw new Error('MR catalog must use GQNO for Nouakchott, not closed GQNN');
  }
}
