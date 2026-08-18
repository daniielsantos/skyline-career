/**
 * Comoros career hub catalog — AF-6 Africa leftovers (Indian Ocean island hop).
 *
 * Moroni cargo major is FMCH Prince Said Ibrahim. Skip Mohéli / Anjouan.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KmCareerRegion = 'KM-C';

export type KmCareerHubDef = {
  icao: string;
  name: string;
  region: KmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Comoros hub. Moroni is FMCH. */
export const KM_CAREER_HUBS: readonly KmCareerHubDef[] = [
  {
    icao: 'FMCH',
    name: 'Moroni Prince Said Ibrahim',
    region: 'KM-C',
    hubTier: 'major',
    lat: -11.5337,
    lon: 43.2719,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.15 },
  },
];

export const KM_CAREER_HUB_COUNT = 1;

export function buildKmFeederCorridors(
  hubs: readonly KmCareerHubDef[] = KM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKmCareerHubCatalog(): void {
  if (KM_CAREER_HUBS.length !== KM_CAREER_HUB_COUNT) {
    throw new Error(
      `KM_CAREER_HUBS length ${KM_CAREER_HUBS.length} !== ${KM_CAREER_HUB_COUNT}`,
    );
  }
  if (!KM_CAREER_HUBS.some((h) => h.icao === 'FMCH' && h.hubTier === 'major')) {
    throw new Error('KM catalog must include major FMCH (Moroni)');
  }
}
