/**
 * Tonga career hub catalog — Tongatapu + Vava'u.
 *
 * Tongatapu cargo major is NFTF Fua'amotu; Vava'u is NFTV (northern group).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ToCareerRegion = 'TO-T' | 'TO-V';

export type ToCareerHubDef = {
  icao: string;
  name: string;
  region: ToCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Tonga hubs — Tongatapu (TO-T) + Vava'u (TO-V). */
export const TO_CAREER_HUBS: readonly ToCareerHubDef[] = [
  {
    icao: 'NFTF',
    name: "Fua'amotu International",
    region: 'TO-T',
    hubTier: 'major',
    lat: -21.2414,
    lon: -175.1492,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
  {
    icao: 'NFTV',
    name: "Vava'u International",
    region: 'TO-V',
    hubTier: 'major',
    lat: -18.5854,
    lon: -173.965,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.1 },
  },
];

export const TO_CAREER_HUB_COUNT = 2;

export function buildToFeederCorridors(
  hubs: readonly ToCareerHubDef[] = TO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertToCareerHubCatalog(): void {
  if (TO_CAREER_HUBS.length !== TO_CAREER_HUB_COUNT) {
    throw new Error(
      `TO_CAREER_HUBS length ${TO_CAREER_HUBS.length} !== ${TO_CAREER_HUB_COUNT}`,
    );
  }
  if (!TO_CAREER_HUBS.some((h) => h.icao === 'NFTF' && h.hubTier === 'major')) {
    throw new Error('TO catalog must include major NFTF (Fua\'amotu)');
  }
  if (!TO_CAREER_HUBS.some((h) => h.icao === 'NFTV' && h.hubTier === 'major')) {
    throw new Error('TO catalog must include major NFTV (Vava\'u)');
  }
}
