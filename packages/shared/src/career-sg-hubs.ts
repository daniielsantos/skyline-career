/**
 * Singapore career hub catalog — Asia-11 Strait of Malacca hinge.
 *
 * Changi is WSSS. Air bases WSAP / WSAT / WSAG / WSAC and Seletar WSSL omitted.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SgCareerRegion = 'SG-C';

export type SgCareerHubDef = {
  icao: string;
  name: string;
  region: SgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Singapore hub. Changi is the seaport pickup. */
export const SG_CAREER_HUBS: readonly SgCareerHubDef[] = [
  {
    icao: 'WSSS',
    name: 'Singapore Changi',
    region: 'SG-C',
    hubTier: 'major',
    lat: 1.3502,
    lon: 103.994,
    produce: { electronics: 1.55, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.3, supplies: 1.25, general: 1.1, fuel: 1.3 },
  },
];

export const SG_CAREER_HUB_COUNT = 1;

export function buildSgFeederCorridors(
  hubs: readonly SgCareerHubDef[] = SG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSgCareerHubCatalog(): void {
  if (SG_CAREER_HUBS.length !== SG_CAREER_HUB_COUNT) {
    throw new Error(
      `SG_CAREER_HUBS length ${SG_CAREER_HUBS.length} !== ${SG_CAREER_HUB_COUNT}`,
    );
  }
  if (!SG_CAREER_HUBS.some((h) => h.icao === 'WSSS' && h.hubTier === 'major')) {
    throw new Error('SG catalog must include major WSSS (Changi)');
  }
  if (SG_CAREER_HUBS.some((h) => ['WSAP', 'WSAT', 'WSSL'].includes(h.icao))) {
    throw new Error('SG catalog must not seed Paya Lebar, Tengah, or Seletar');
  }
}
