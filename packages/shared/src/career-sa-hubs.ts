/**
 * Saudi Arabia career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SaCareerRegion = 'SA-W' | 'SA-C' | 'SA-E';

export type SaCareerHubDef = {
  icao: string;
  name: string;
  region: SaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const westCoast = {
  produce: { general: 1.25, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 1.0, machinery: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const gulfCoast = {
  produce: { machinery: 1.3, general: 1.25, electronics: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, supplies: 1.05, fuel: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 10 curated Saudi hubs. */
export const SA_CAREER_HUBS: readonly SaCareerHubDef[] = [
  {
    icao: 'OEJN',
    name: 'Jeddah King Abdulaziz',
    region: 'SA-W',
    hubTier: 'major',
    lat: 21.6796,
    lon: 39.1565,
    produce: { general: 1.5, electronics: 1.35, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OEMA',
    name: 'Medina Prince Mohammad Bin Abdulaziz',
    region: 'SA-W',
    hubTier: 'regional',
    lat: 24.5534,
    lon: 39.705,
    ...westCoast,
  },
  {
    icao: 'OETF',
    name: 'Taif',
    region: 'SA-W',
    hubTier: 'spoke',
    lat: 21.4834,
    lon: 40.5441,
    ...westCoast,
  },
  {
    icao: 'OEAB',
    name: 'Abha',
    region: 'SA-W',
    hubTier: 'spoke',
    lat: 18.2404,
    lon: 42.6566,
    ...westCoast,
  },
  {
    icao: 'OERK',
    name: 'Riyadh King Khalid',
    region: 'SA-C',
    hubTier: 'major',
    lat: 24.9576,
    lon: 46.6988,
    produce: { electronics: 1.5, general: 1.55, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.1 },
  },
  {
    icao: 'OEGS',
    name: 'Gassim',
    region: 'SA-C',
    hubTier: 'regional',
    lat: 26.3028,
    lon: 43.774,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'OEHL',
    name: 'Hail',
    region: 'SA-C',
    hubTier: 'spoke',
    lat: 27.4379,
    lon: 41.6863,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'OEDF',
    name: 'Dammam King Fahd',
    region: 'SA-E',
    hubTier: 'major',
    lat: 26.4712,
    lon: 49.7979,
    produce: { machinery: 1.45, electronics: 1.35, general: 1.4 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'OEAH',
    name: 'Al Ahsa',
    region: 'SA-E',
    hubTier: 'spoke',
    lat: 25.2853,
    lon: 49.4852,
    ...gulfCoast,
  },
  {
    icao: 'OEYN',
    name: 'Yanbu',
    region: 'SA-W',
    hubTier: 'spoke',
    lat: 24.1442,
    lon: 38.0634,
    ...westCoast,
  },
];

export const SA_CAREER_HUB_COUNT = 10;

export function buildSaFeederCorridors(
  hubs: readonly SaCareerHubDef[] = SA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSaCareerHubCatalog(): void {
  if (SA_CAREER_HUBS.length !== SA_CAREER_HUB_COUNT) {
    throw new Error(
      `SA_CAREER_HUBS length ${SA_CAREER_HUBS.length} !== ${SA_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['OEJN', 'OERK', 'OEDF'] as const) {
    if (!SA_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`SA catalog must include major ${icao}`);
    }
  }
  if (!SA_CAREER_HUBS.some((h) => h.icao === 'OETF')) {
    throw new Error('SA catalog must include OETF (Taif), not OETH');
  }
  if (SA_CAREER_HUBS.some((h) => h.icao === 'OETH')) {
    throw new Error('SA catalog must use OETF for Taif, not OETH');
  }
}
