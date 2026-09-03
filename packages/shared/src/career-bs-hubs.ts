/**
 * Bahamas career hub catalog — intl-first island pattern.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { BS_DENSIFY_HUBS, BS_DENSIFY_HUB_COUNT } from './career-bs-hubs-densify.js';

export type BsCareerRegion = 'BS-C';

export type BsCareerHubDef = {
  icao: string;
  name: string;
  region: BsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const agroSpoke = {
  produce: { perishables: 1.3, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Bahamas hubs — Nassau + Family Islands. */
export const BS_CAREER_HUBS: readonly BsCareerHubDef[] = [
  {
    icao: 'MYNN',
    name: 'Nassau Lynden Pindling',
    region: 'BS-C',
    hubTier: 'major',
    lat: 25.039,
    lon: -77.4662,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MYGF',
    name: 'Freeport Grand Bahama',
    region: 'BS-C',
    hubTier: 'regional',
    lat: 26.5587,
    lon: -78.6956,
    produce: { general: 1.2, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'MYEH',
    name: 'North Eleuthera',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 25.4749,
    lon: -76.6835,
    ...agroSpoke,
  },
  {
    icao: 'MYSM',
    name: 'San Salvador',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 24.0633,
    lon: -74.524,
    ...agroSpoke,
  },
  {
    icao: 'MYAF',
    name: 'Andros Town',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 24.6979,
    lon: -77.7959,
    ...agroSpoke,
  },
  ...BS_DENSIFY_HUBS,
];

export const BS_CAREER_HUB_COUNT = 5 + BS_DENSIFY_HUB_COUNT;

export function buildBsFeederCorridors(
  hubs: readonly BsCareerHubDef[] = BS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBsCareerHubCatalog(): void {
  if (BS_CAREER_HUBS.length !== BS_CAREER_HUB_COUNT) {
    throw new Error(
      `BS_CAREER_HUBS length ${BS_CAREER_HUBS.length} !== ${BS_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of BS_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate BS hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'BS-C') n += 1;
  }
  if (n !== BS_CAREER_HUB_COUNT) {
    throw new Error(`BS-C has ${n} hubs, expected ${BS_CAREER_HUB_COUNT}`);
  }
}
