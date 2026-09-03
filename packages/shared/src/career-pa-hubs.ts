/**
 * Panama career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { PA_DENSIFY_HUBS, PA_DENSIFY_HUB_COUNT } from './career-pa-hubs-densify.js';

export type PaCareerRegion = 'PA-C';

export type PaCareerHubDef = {
  icao: string;
  name: string;
  region: PaCareerRegion;
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

/** 7 curated + densify Panama hubs — Canal corridor + interior / Bocas. */
export const PA_CAREER_HUBS: readonly PaCareerHubDef[] = [
  {
    icao: 'MPTO',
    name: 'Panama City Tocumen',
    region: 'PA-C',
    hubTier: 'major',
    lat: 9.0714,
    lon: -79.3835,
    produce: { general: 1.5, electronics: 1.25, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MPMG',
    name: 'Panama City Marcos A. Gelabert',
    region: 'PA-C',
    hubTier: 'regional',
    lat: 8.9733,
    lon: -79.5556,
    produce: { general: 1.2, electronics: 1.1, supplies: 1.05 },
    consume: { perishables: 1.1, machinery: 0.95 },
  },
  {
    icao: 'MPDA',
    name: 'David Enrique Malek',
    region: 'PA-C',
    hubTier: 'regional',
    lat: 8.391,
    lon: -82.4349,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'MPPA',
    name: 'Panama Pacifico',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 8.9148,
    lon: -79.5996,
    ...drySpoke,
  },
  {
    icao: 'MPSM',
    name: 'Rio Hato Scarlett Martinez',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 8.3758,
    lon: -80.1279,
    ...agroSpoke,
  },
  {
    icao: 'MPBO',
    name: 'Bocas del Toro Isla Colon',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 9.3408,
    lon: -82.2508,
    ...agroSpoke,
  },
  {
    icao: 'MPCH',
    name: 'Changuinola Cap Manuel Nino',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 9.4587,
    lon: -82.5168,
    ...agroSpoke,
  },
  ...PA_DENSIFY_HUBS,
];

export const PA_CAREER_HUB_COUNT = 7 + PA_DENSIFY_HUB_COUNT;

export function buildPaFeederCorridors(
  hubs: readonly PaCareerHubDef[] = PA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPaCareerHubCatalog(): void {
  if (PA_CAREER_HUBS.length !== PA_CAREER_HUB_COUNT) {
    throw new Error(
      `PA_CAREER_HUBS length ${PA_CAREER_HUBS.length} !== ${PA_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of PA_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate PA hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['PA-C'] !== PA_CAREER_HUB_COUNT) {
    throw new Error(
      `PA-C has ${byRegion['PA-C'] ?? 0} hubs, expected ${PA_CAREER_HUB_COUNT}`,
    );
  }
}
