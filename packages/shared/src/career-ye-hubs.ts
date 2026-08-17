/**
 * Yemen career hub catalog — MENA-6 Red Sea / Gulf of Aden.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type YeCareerRegion = 'YE-N' | 'YE-S';

export type YeCareerHubDef = {
  icao: string;
  name: string;
  region: YeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const highland = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 4 curated Yemen hubs. Sana'a is OYSN; Aden is OYAA. */
export const YE_CAREER_HUBS: readonly YeCareerHubDef[] = [
  {
    icao: 'OYSN',
    name: "Sana'a International",
    region: 'YE-N',
    hubTier: 'major',
    lat: 15.4764,
    lon: 44.2197,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OYHD',
    name: 'Hodeidah',
    region: 'YE-N',
    hubTier: 'regional',
    lat: 14.753,
    lon: 42.9763,
    produce: { machinery: 1.25, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
  {
    icao: 'OYAA',
    name: 'Aden International',
    region: 'YE-S',
    hubTier: 'major',
    lat: 12.8295,
    lon: 45.0288,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'OYRN',
    name: 'Mukalla Riyan',
    region: 'YE-S',
    hubTier: 'spoke',
    lat: 14.6626,
    lon: 49.375,
    ...highland,
  },
];

export const YE_CAREER_HUB_COUNT = 4;

export function buildYeFeederCorridors(
  hubs: readonly YeCareerHubDef[] = YE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertYeCareerHubCatalog(): void {
  if (YE_CAREER_HUBS.length !== YE_CAREER_HUB_COUNT) {
    throw new Error(
      `YE_CAREER_HUBS length ${YE_CAREER_HUBS.length} !== ${YE_CAREER_HUB_COUNT}`,
    );
  }
  if (!YE_CAREER_HUBS.some((h) => h.icao === 'OYSN' && h.hubTier === 'major')) {
    throw new Error('YE catalog must include major OYSN (Sana\'a)');
  }
  if (!YE_CAREER_HUBS.some((h) => h.icao === 'OYAA' && h.hubTier === 'major')) {
    throw new Error('YE catalog must include major OYAA (Aden)');
  }
  if (!YE_CAREER_HUBS.some((h) => h.icao === 'OYHD')) {
    throw new Error('YE catalog must include OYHD Hodeidah (port pickup)');
  }
}
