/**
 * Israel career hub catalog — MENA-1 Mediterranean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type IlCareerRegion = 'IL-C' | 'IL-S';

export type IlCareerHubDef = {
  icao: string;
  name: string;
  region: IlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Israel hubs. Eilat is LLER (Ramon), not LLET. */
export const IL_CAREER_HUBS: readonly IlCareerHubDef[] = [
  {
    icao: 'LLBG',
    name: 'Tel Aviv Ben Gurion',
    region: 'IL-C',
    hubTier: 'major',
    lat: 32.0114,
    lon: 34.8867,
    produce: { electronics: 1.45, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LLHA',
    name: 'Haifa',
    region: 'IL-C',
    hubTier: 'spoke',
    lat: 32.8094,
    lon: 35.0431,
    produce: { machinery: 1.15, general: 1.2, supplies: 1.05 },
    consume: { perishables: 1.1, electronics: 1.0 },
  },
  {
    icao: 'LLER',
    name: 'Eilat Ramon',
    region: 'IL-S',
    hubTier: 'regional',
    lat: 29.7239,
    lon: 35.0114,
    produce: { perishables: 1.2, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const IL_CAREER_HUB_COUNT = 3;

export function buildIlFeederCorridors(
  hubs: readonly IlCareerHubDef[] = IL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIlCareerHubCatalog(): void {
  if (IL_CAREER_HUBS.length !== IL_CAREER_HUB_COUNT) {
    throw new Error(
      `IL_CAREER_HUBS length ${IL_CAREER_HUBS.length} !== ${IL_CAREER_HUB_COUNT}`,
    );
  }
  if (!IL_CAREER_HUBS.some((h) => h.icao === 'LLBG' && h.hubTier === 'major')) {
    throw new Error('IL catalog must include major LLBG');
  }
  if (!IL_CAREER_HUBS.some((h) => h.icao === 'LLER')) {
    throw new Error('IL catalog must include LLER (Ramon), not LLET');
  }
  if (IL_CAREER_HUBS.some((h) => h.icao === 'LLET')) {
    throw new Error('IL catalog must use LLER for Eilat, not LLET');
  }
}
