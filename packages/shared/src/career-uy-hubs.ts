/**
 * Uruguay career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type UyCareerRegion = 'UY-S';

export type UyCareerHubDef = {
  icao: string;
  name: string;
  region: UyCareerRegion;
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
  consume: { electronics: 0.85, machinery: 0.8, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.4, fuel: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated Uruguay hubs — single South region around Montevideo + interior. */
export const UY_CAREER_HUBS: readonly UyCareerHubDef[] = [
  {
    icao: 'SUMU',
    name: 'Montevideo Carrasco',
    region: 'UY-S',
    hubTier: 'major',
    lat: -34.8384,
    lon: -56.0308,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SULS',
    name: 'Punta del Este Capitan Corbeta',
    region: 'UY-S',
    hubTier: 'regional',
    lat: -34.9144,
    lon: -54.9206,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 1.05, perishables: 1.15 },
  },
  {
    icao: 'SUAA',
    name: 'Montevideo Angel S. Adami',
    region: 'UY-S',
    hubTier: 'spoke',
    lat: -34.7892,
    lon: -56.2647,
    ...drySpoke,
  },
  {
    icao: 'SUPU',
    name: 'Paysandu',
    region: 'UY-S',
    hubTier: 'spoke',
    lat: -32.3633,
    lon: -58.0619,
    ...agroSpoke,
  },
  {
    icao: 'SURV',
    name: 'Rivera',
    region: 'UY-S',
    hubTier: 'spoke',
    lat: -30.9746,
    lon: -55.4762,
    ...agroSpoke,
  },
  {
    icao: 'SUCA',
    name: 'Colonia del Sacramento Laguna de los Patos',
    region: 'UY-S',
    hubTier: 'spoke',
    lat: -34.4564,
    lon: -57.7706,
    ...agroSpoke,
  },
  {
    icao: 'SUAG',
    name: 'Artigas',
    region: 'UY-S',
    hubTier: 'spoke',
    lat: -30.4007,
    lon: -56.5079,
    ...drySpoke,
  },
];

export const UY_CAREER_HUB_COUNT = 7;

export function buildUyFeederCorridors(
  hubs: readonly UyCareerHubDef[] = UY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertUyCareerHubCatalog(): void {
  if (UY_CAREER_HUBS.length !== UY_CAREER_HUB_COUNT) {
    throw new Error(
      `UY_CAREER_HUBS length ${UY_CAREER_HUBS.length} !== ${UY_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of UY_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate UY hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['UY-S'] !== 7) {
    throw new Error(`UY-S has ${byRegion['UY-S'] ?? 0} hubs, expected 7`);
  }
}
