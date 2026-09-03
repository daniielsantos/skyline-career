/**
 * Guyana career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { GY_DENSIFY_HUBS, GY_DENSIFY_HUB_COUNT } from './career-gy-hubs-densify.js';

export type GyCareerRegion = 'GY-C';

export type GyCareerHubDef = {
  icao: string;
  name: string;
  region: GyCareerRegion;
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
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const miningSpoke = {
  produce: { machinery: 1.4, electronics: 1.05, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 5 curated Guyana hubs — coastal capital + interior spokes.
 */
export const GY_CAREER_HUBS: readonly GyCareerHubDef[] = [
  // ── GY-C (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SYCJ',
    name: 'Georgetown Cheddi Jagan',
    region: 'GY-C',
    hubTier: 'major',
    lat: 6.4986,
    lon: -58.2541,
    produce: { general: 1.45, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SYEC',
    name: 'Georgetown Eugene F. Correia',
    region: 'GY-C',
    hubTier: 'regional',
    lat: 6.8069,
    lon: -58.1056,
    produce: { general: 1.2, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SYLT',
    name: 'Lethem',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 3.3728,
    lon: -59.7894,
    ...agroSpoke,
  },
  {
    icao: 'SYAH',
    name: 'Aishalton',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 2.4833,
    lon: -59.3167,
    ...miningSpoke,
  },
  {
    icao: 'SYKT',
    name: 'Kato',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 4.65,
    lon: -59.8333,
    ...drySpoke,
  },
  ...GY_DENSIFY_HUBS,
];

export const GY_CAREER_HUB_COUNT = 5 + GY_DENSIFY_HUB_COUNT;

export function buildGyFeederCorridors(
  hubs: readonly GyCareerHubDef[] = GY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGyCareerHubCatalog(): void {
  if (GY_CAREER_HUBS.length !== GY_CAREER_HUB_COUNT) {
    throw new Error(
      `GY_CAREER_HUBS length ${GY_CAREER_HUBS.length} !== ${GY_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of GY_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate GY hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<GyCareerRegion, number> = {
    'GY-C': GY_CAREER_HUB_COUNT,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `GY region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
