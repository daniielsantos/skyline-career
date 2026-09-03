/**
 * French Guiana career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { GF_DENSIFY_HUBS, GF_DENSIFY_HUB_COUNT } from './career-gf-hubs-densify.js';

export type GfCareerRegion = 'GF-C';

export type GfCareerHubDef = {
  icao: string;
  name: string;
  region: GfCareerRegion;
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

/**
 * 3 curated French Guiana hubs — Cayenne + interior spokes.
 */
export const GF_CAREER_HUBS: readonly GfCareerHubDef[] = [
  // ── GF-C (3) ─────────────────────────────────────────────────────────────
  {
    icao: 'SOCA',
    name: 'Cayenne Félix Eboué',
    region: 'GF-C',
    hubTier: 'major',
    lat: 4.81996,
    lon: -52.3604,
    produce: { general: 1.45, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SOOG',
    name: 'Saint-Georges',
    region: 'GF-C',
    hubTier: 'spoke',
    lat: 3.8903,
    lon: -51.805,
    ...agroSpoke,
  },
  {
    icao: 'SOOA',
    name: 'Maripasoula',
    region: 'GF-C',
    hubTier: 'spoke',
    lat: 3.6575,
    lon: -54.0372,
    ...drySpoke,
  },
  ...GF_DENSIFY_HUBS,
];

export const GF_CAREER_HUB_COUNT = 3 + GF_DENSIFY_HUB_COUNT;

export function buildGfFeederCorridors(
  hubs: readonly GfCareerHubDef[] = GF_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGfCareerHubCatalog(): void {
  if (GF_CAREER_HUBS.length !== GF_CAREER_HUB_COUNT) {
    throw new Error(
      `GF_CAREER_HUBS length ${GF_CAREER_HUBS.length} !== ${GF_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of GF_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate GF hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<GfCareerRegion, number> = {
    'GF-C': GF_CAREER_HUB_COUNT,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `GF region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
