/**
 * Brunei career hub catalog — Asia-28 Borneo gap (deferred from Asia-12).
 *
 * Bandar Seri Begawan cargo major is WBSB (not Malaysia WB*).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BnCareerRegion = 'BN-C';

export type BnCareerHubDef = {
  icao: string;
  name: string;
  region: BnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Brunei hub. Muara seaport pickup is WBSB. */
export const BN_CAREER_HUBS: readonly BnCareerHubDef[] = [
  {
    icao: 'WBSB',
    name: 'Brunei International',
    region: 'BN-C',
    hubTier: 'major',
    lat: 4.9442,
    lon: 114.928,
    produce: { general: 1.25, electronics: 1.15, supplies: 1.1 },
    consume: { perishables: 1.1, machinery: 0.95, fuel: 1.15 },
  },
];

export const BN_CAREER_HUB_COUNT = 1;

export function buildBnFeederCorridors(
  hubs: readonly BnCareerHubDef[] = BN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBnCareerHubCatalog(): void {
  if (BN_CAREER_HUBS.length !== BN_CAREER_HUB_COUNT) {
    throw new Error(
      `BN_CAREER_HUBS length ${BN_CAREER_HUBS.length} !== ${BN_CAREER_HUB_COUNT}`,
    );
  }
  if (!BN_CAREER_HUBS.some((h) => h.icao === 'WBSB' && h.hubTier === 'major')) {
    throw new Error('BN catalog must include major WBSB (Brunei International)');
  }
}
