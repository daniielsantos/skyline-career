/**
 * Costa Rica career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { CR_DENSIFY_HUBS, CR_DENSIFY_HUB_COUNT } from './career-cr-hubs-densify.js';

export type CrCareerRegion = 'CR-C';

export type CrCareerHubDef = {
  icao: string;
  name: string;
  region: CrCareerRegion;
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
  produce: { perishables: 1.45, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated + densify Costa Rica hubs — Valle Central + coasts. */
export const CR_CAREER_HUBS: readonly CrCareerHubDef[] = [
  {
    icao: 'MROC',
    name: 'San Jose Juan Santamaria',
    region: 'CR-C',
    hubTier: 'major',
    lat: 9.9939,
    lon: -84.2088,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MRLB',
    name: 'Liberia Daniel Oduber',
    region: 'CR-C',
    hubTier: 'regional',
    lat: 10.5933,
    lon: -85.5444,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 1.05, machinery: 0.95 },
  },
  {
    icao: 'MRPV',
    name: 'San Jose Tobias Bolanos',
    region: 'CR-C',
    hubTier: 'regional',
    lat: 9.9571,
    lon: -84.1398,
    produce: { general: 1.15, supplies: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'MRLM',
    name: 'Limon',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 9.9579,
    lon: -83.022,
    ...agroSpoke,
  },
  {
    icao: 'MRGF',
    name: 'Golfito',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 8.654,
    lon: -83.1822,
    ...agroSpoke,
  },
  {
    icao: 'MRNS',
    name: 'Nosara',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 9.9765,
    lon: -85.653,
    ...agroSpoke,
  },
  {
    icao: 'MRPM',
    name: 'Palmar Sur',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 8.951,
    lon: -83.4686,
    ...drySpoke,
  },
  ...CR_DENSIFY_HUBS,
];

export const CR_CAREER_HUB_COUNT = 7 + CR_DENSIFY_HUB_COUNT;

export function buildCrFeederCorridors(
  hubs: readonly CrCareerHubDef[] = CR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCrCareerHubCatalog(): void {
  if (CR_CAREER_HUBS.length !== CR_CAREER_HUB_COUNT) {
    throw new Error(
      `CR_CAREER_HUBS length ${CR_CAREER_HUBS.length} !== ${CR_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of CR_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate CR hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['CR-C'] !== CR_CAREER_HUB_COUNT) {
    throw new Error(
      `CR-C has ${byRegion['CR-C'] ?? 0} hubs, expected ${CR_CAREER_HUB_COUNT}`,
    );
  }
}
