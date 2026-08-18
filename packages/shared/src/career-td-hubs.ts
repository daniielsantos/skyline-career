/**
 * Chad career hub catalog — AF-4 Central Africa / Congo basin.
 * Landlocked — no seaport pickup.
 *
 * N'Djamena cargo major is FTTJ.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TdCareerRegion = 'TD-C';

export type TdCareerHubDef = {
  icao: string;
  name: string;
  region: TdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Chad hub. N'Djamena is FTTJ. */
export const TD_CAREER_HUBS: readonly TdCareerHubDef[] = [
  {
    icao: 'FTTJ',
    name: "N'Djamena International",
    region: 'TD-C',
    hubTier: 'major',
    lat: 12.1337,
    lon: 15.034,
    produce: { general: 1.3, supplies: 1.2, machinery: 1.15 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
];

export const TD_CAREER_HUB_COUNT = 1;

export function buildTdFeederCorridors(
  hubs: readonly TdCareerHubDef[] = TD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTdCareerHubCatalog(): void {
  if (TD_CAREER_HUBS.length !== TD_CAREER_HUB_COUNT) {
    throw new Error(
      `TD_CAREER_HUBS length ${TD_CAREER_HUBS.length} !== ${TD_CAREER_HUB_COUNT}`,
    );
  }
  if (!TD_CAREER_HUBS.some((h) => h.icao === 'FTTJ' && h.hubTier === 'major')) {
    throw new Error("TD catalog must include major FTTJ (N'Djamena)");
  }
}
