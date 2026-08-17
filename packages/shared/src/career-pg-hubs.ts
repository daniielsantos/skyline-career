/**
 * Papua New Guinea career hub catalog — Asia-15 Coral Sea face.
 *
 * Port Moresby cargo major is AYPY Jacksons (not Lae AYNZ). Indonesian Papua
 * WAJJ remains on the ID catalog deferred list.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PgCareerRegion = 'PG-S';

export type PgCareerHubDef = {
  icao: string;
  name: string;
  region: PgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Papua New Guinea hub. Port Moresby seaport pickup is AYPY. */
export const PG_CAREER_HUBS: readonly PgCareerHubDef[] = [
  {
    icao: 'AYPY',
    name: 'Port Moresby Jacksons',
    region: 'PG-S',
    hubTier: 'major',
    lat: -9.4434,
    lon: 147.22,
    produce: { supplies: 1.25, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, electronics: 1.0, fuel: 1.2 },
  },
];

export const PG_CAREER_HUB_COUNT = 1;

export function buildPgFeederCorridors(
  hubs: readonly PgCareerHubDef[] = PG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPgCareerHubCatalog(): void {
  if (PG_CAREER_HUBS.length !== PG_CAREER_HUB_COUNT) {
    throw new Error(
      `PG_CAREER_HUBS length ${PG_CAREER_HUBS.length} !== ${PG_CAREER_HUB_COUNT}`,
    );
  }
  if (!PG_CAREER_HUBS.some((h) => h.icao === 'AYPY' && h.hubTier === 'major')) {
    throw new Error('PG catalog must include major AYPY (Jacksons)');
  }
  if (PG_CAREER_HUBS.some((h) => ['AYNZ', 'WAJJ'].includes(h.icao))) {
    throw new Error('PG catalog must not seed AYNZ Lae or Indonesian WAJJ');
  }
}
