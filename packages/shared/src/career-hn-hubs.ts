/**
 * Honduras career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { HN_DENSIFY_HUBS, HN_DENSIFY_HUB_COUNT } from './career-hn-hubs-densify.js';

export type HnCareerRegion = 'HN-C';

export type HnCareerHubDef = {
  icao: string;
  name: string;
  region: HnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.8, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.4, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Honduras hubs — capital / north coast / Bay Islands. */
export const HN_CAREER_HUBS: readonly HnCareerHubDef[] = [
  {
    icao: 'MHTG',
    name: 'Tegucigalpa Toncontin',
    region: 'HN-C',
    hubTier: 'major',
    lat: 14.0609,
    lon: -87.2172,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MHLM',
    name: 'San Pedro Sula Ramon Villeda',
    region: 'HN-C',
    hubTier: 'regional',
    lat: 15.4526,
    lon: -87.9236,
    produce: { general: 1.3, machinery: 1.15, perishables: 1.1 },
    consume: { electronics: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MHLC',
    name: 'La Ceiba Goloson',
    region: 'HN-C',
    hubTier: 'regional',
    lat: 15.7425,
    lon: -86.853,
    produce: { perishables: 1.25, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'MHRO',
    name: 'Roatan Juan Manuel Galvez',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 16.3168,
    lon: -86.523,
    ...agroSpoke,
  },
  {
    icao: 'MHUT',
    name: 'Utila',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 16.1131,
    lon: -86.8803,
    ...agroSpoke,
  },
  {
    icao: 'MHTE',
    name: 'Tela',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 15.7759,
    lon: -87.4759,
    ...drySpoke,
  },
  ...HN_DENSIFY_HUBS,
];

export const HN_CAREER_HUB_COUNT = 6 + HN_DENSIFY_HUB_COUNT;

export function buildHnFeederCorridors(
  hubs: readonly HnCareerHubDef[] = HN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertHnCareerHubCatalog(): void {
  if (HN_CAREER_HUBS.length !== HN_CAREER_HUB_COUNT) {
    throw new Error(
      `HN_CAREER_HUBS length ${HN_CAREER_HUBS.length} !== ${HN_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of HN_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate HN hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['HN-C'] !== HN_CAREER_HUB_COUNT) {
    throw new Error(
      `HN-C has ${byRegion['HN-C'] ?? 0} hubs, expected ${HN_CAREER_HUB_COUNT}`,
    );
  }
}
