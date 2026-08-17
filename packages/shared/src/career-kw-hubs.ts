/**
 * Kuwait career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KwCareerRegion = 'KW-C';

export type KwCareerHubDef = {
  icao: string;
  name: string;
  region: KwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Kuwait hub (MSFS Facilities ident OKKK, not OKBK). */
export const KW_CAREER_HUBS: readonly KwCareerHubDef[] = [
  {
    icao: 'OKKK',
    name: 'Kuwait International',
    region: 'KW-C',
    hubTier: 'major',
    lat: 29.2266,
    lon: 47.9689,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.1 },
  },
];

export const KW_CAREER_HUB_COUNT = 1;

export function buildKwFeederCorridors(
  hubs: readonly KwCareerHubDef[] = KW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKwCareerHubCatalog(): void {
  if (KW_CAREER_HUBS.length !== KW_CAREER_HUB_COUNT) {
    throw new Error(
      `KW_CAREER_HUBS length ${KW_CAREER_HUBS.length} !== ${KW_CAREER_HUB_COUNT}`,
    );
  }
  if (!KW_CAREER_HUBS.some((h) => h.icao === 'OKKK' && h.hubTier === 'major')) {
    throw new Error('KW catalog must include major OKKK (not OKBK)');
  }
  if (KW_CAREER_HUBS.some((h) => h.icao === 'OKBK')) {
    throw new Error('KW catalog must use OKKK, not OKBK');
  }
}
