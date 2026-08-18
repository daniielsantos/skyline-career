/**
 * Eritrea career hub catalog — AF-7 Horn of Africa.
 *
 * Asmara cargo major is HHAS. Massawa port pickup uses HHAS (no second hub).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ErCareerRegion = 'ER-C';

export type ErCareerHubDef = {
  icao: string;
  name: string;
  region: ErCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Eritrea hub. Asmara is HHAS. */
export const ER_CAREER_HUBS: readonly ErCareerHubDef[] = [
  {
    icao: 'HHAS',
    name: 'Asmara International',
    region: 'ER-C',
    hubTier: 'major',
    lat: 15.2919,
    lon: 38.9107,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const ER_CAREER_HUB_COUNT = 1;

export function buildErFeederCorridors(
  hubs: readonly ErCareerHubDef[] = ER_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertErCareerHubCatalog(): void {
  if (ER_CAREER_HUBS.length !== ER_CAREER_HUB_COUNT) {
    throw new Error(
      `ER_CAREER_HUBS length ${ER_CAREER_HUBS.length} !== ${ER_CAREER_HUB_COUNT}`,
    );
  }
  if (!ER_CAREER_HUBS.some((h) => h.icao === 'HHAS' && h.hubTier === 'major')) {
    throw new Error('ER catalog must include major HHAS (Asmara)');
  }
}
