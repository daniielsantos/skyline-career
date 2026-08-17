/**
 * Palau career hub catalog — Asia-16 Micronesia face.
 *
 * Koror cargo major is PTRO Roman Tmetuchl.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PwCareerRegion = 'PW-C';

export type PwCareerHubDef = {
  icao: string;
  name: string;
  region: PwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Palau hub. Koror seaport pickup is PTRO. */
export const PW_CAREER_HUBS: readonly PwCareerHubDef[] = [
  {
    icao: 'PTRO',
    name: 'Palau Roman Tmetuchl',
    region: 'PW-C',
    hubTier: 'major',
    lat: 7.367,
    lon: 134.5441,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
];

export const PW_CAREER_HUB_COUNT = 1;

export function buildPwFeederCorridors(
  hubs: readonly PwCareerHubDef[] = PW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPwCareerHubCatalog(): void {
  if (PW_CAREER_HUBS.length !== PW_CAREER_HUB_COUNT) {
    throw new Error(
      `PW_CAREER_HUBS length ${PW_CAREER_HUBS.length} !== ${PW_CAREER_HUB_COUNT}`,
    );
  }
  if (!PW_CAREER_HUBS.some((h) => h.icao === 'PTRO' && h.hubTier === 'major')) {
    throw new Error('PW catalog must include major PTRO (Roman Tmetuchl)');
  }
}
