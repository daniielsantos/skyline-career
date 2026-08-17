/**
 * Norway career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NoCareerRegion = 'NO-S' | 'NO-N';

export type NoCareerHubDef = {
  icao: string;
  name: string;
  region: NoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const coastal = {
  produce: { perishables: 1.4, general: 1.15, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
};

const industrial = {
  produce: { machinery: 1.3, electronics: 1.15, general: 1.2 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 8 curated Norway hubs. */
export const NO_CAREER_HUBS: readonly NoCareerHubDef[] = [
  {
    icao: 'ENGM',
    name: 'Oslo Gardermoen',
    region: 'NO-S',
    hubTier: 'major',
    lat: 60.1939,
    lon: 11.1004,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'ENBR',
    name: 'Bergen Flesland',
    region: 'NO-S',
    hubTier: 'regional',
    lat: 60.2934,
    lon: 5.21814,
    produce: { perishables: 1.3, general: 1.25, machinery: 1.1 },
    consume: { electronics: 1.0, supplies: 1.05 },
  },
  {
    icao: 'ENZV',
    name: 'Stavanger Sola',
    region: 'NO-S',
    hubTier: 'regional',
    lat: 58.8767,
    lon: 5.63778,
    ...industrial,
  },
  {
    icao: 'ENCN',
    name: 'Kristiansand Kjevik',
    region: 'NO-S',
    hubTier: 'spoke',
    lat: 58.2042,
    lon: 8.08537,
    ...coastal,
  },
  {
    icao: 'ENTO',
    name: 'Sandefjord Torp',
    region: 'NO-S',
    hubTier: 'spoke',
    lat: 59.1867,
    lon: 10.2586,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'ENVA',
    name: 'Trondheim Vaernes',
    region: 'NO-N',
    hubTier: 'regional',
    lat: 63.4578,
    lon: 10.924,
    produce: { machinery: 1.2, general: 1.2, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'ENTC',
    name: 'Tromso',
    region: 'NO-N',
    hubTier: 'regional',
    lat: 69.6833,
    lon: 18.9189,
    ...coastal,
  },
  {
    icao: 'ENAL',
    name: 'Alesund Vigra',
    region: 'NO-N',
    hubTier: 'spoke',
    lat: 62.5625,
    lon: 6.1197,
    ...coastal,
  },
];

export const NO_CAREER_HUB_COUNT = 8;

export function buildNoFeederCorridors(
  hubs: readonly NoCareerHubDef[] = NO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNoCareerHubCatalog(): void {
  if (NO_CAREER_HUBS.length !== NO_CAREER_HUB_COUNT) {
    throw new Error(
      `NO_CAREER_HUBS length ${NO_CAREER_HUBS.length} !== ${NO_CAREER_HUB_COUNT}`,
    );
  }
  if (!NO_CAREER_HUBS.some((h) => h.icao === 'ENGM' && h.hubTier === 'major')) {
    throw new Error('NO catalog must include major ENGM');
  }
}
