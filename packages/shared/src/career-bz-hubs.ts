/**
 * Belize career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BzCareerRegion = 'BZ-C';

export type BzCareerHubDef = {
  icao: string;
  name: string;
  region: BzCareerRegion;
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

/** 4 curated Belize hubs — Goldson + coastal spokes. */
export const BZ_CAREER_HUBS: readonly BzCareerHubDef[] = [
  {
    icao: 'MZBZ',
    name: 'Belize City Philip S. W. Goldson',
    region: 'BZ-C',
    hubTier: 'major',
    lat: 17.5391,
    lon: -88.3082,
    produce: { general: 1.4, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MZPL',
    name: 'Placencia',
    region: 'BZ-C',
    hubTier: 'regional',
    lat: 16.5369,
    lon: -88.3615,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'MZBE',
    name: 'Belize City Municipal',
    region: 'BZ-C',
    hubTier: 'spoke',
    lat: 17.5164,
    lon: -88.1944,
    ...drySpoke,
  },
  {
    icao: 'MZSP',
    name: 'San Pedro Ambergris Caye',
    region: 'BZ-C',
    hubTier: 'spoke',
    lat: 17.9139,
    lon: -87.9711,
    ...agroSpoke,
  },
];

export const BZ_CAREER_HUB_COUNT = 4;

export function buildBzFeederCorridors(
  hubs: readonly BzCareerHubDef[] = BZ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBzCareerHubCatalog(): void {
  if (BZ_CAREER_HUBS.length !== BZ_CAREER_HUB_COUNT) {
    throw new Error(
      `BZ_CAREER_HUBS length ${BZ_CAREER_HUBS.length} !== ${BZ_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of BZ_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate BZ hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['BZ-C'] !== 4) {
    throw new Error(`BZ-C has ${byRegion['BZ-C'] ?? 0} hubs, expected 4`);
  }
}
