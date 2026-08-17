/**
 * Guatemala career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GtCareerRegion = 'GT-C';

export type GtCareerHubDef = {
  icao: string;
  name: string;
  region: GtCareerRegion;
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

/** 6 curated Guatemala hubs — capital + Petén + coasts (civil MSFS idents). */
export const GT_CAREER_HUBS: readonly GtCareerHubDef[] = [
  {
    icao: 'MGGT',
    name: 'Guatemala City La Aurora',
    region: 'GT-C',
    hubTier: 'major',
    lat: 14.5833,
    lon: -90.5275,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MGMM',
    name: 'Flores Mundo Maya',
    region: 'GT-C',
    hubTier: 'regional',
    lat: 16.9138,
    lon: -89.8664,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'MGSJ',
    name: 'Puerto San Jose',
    region: 'GT-C',
    hubTier: 'regional',
    lat: 13.9362,
    lon: -90.8358,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'MGCB',
    name: 'Coban',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 15.469,
    lon: -90.4067,
    ...agroSpoke,
  },
  {
    icao: 'MGQZ',
    name: 'Quezaltenango',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 14.8656,
    lon: -91.502,
    ...agroSpoke,
  },
  {
    icao: 'MGRT',
    name: 'Retalhuleu',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 14.521,
    lon: -91.6973,
    ...drySpoke,
  },
];

export const GT_CAREER_HUB_COUNT = 6;

export function buildGtFeederCorridors(
  hubs: readonly GtCareerHubDef[] = GT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGtCareerHubCatalog(): void {
  if (GT_CAREER_HUBS.length !== GT_CAREER_HUB_COUNT) {
    throw new Error(
      `GT_CAREER_HUBS length ${GT_CAREER_HUBS.length} !== ${GT_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of GT_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate GT hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['GT-C'] !== 6) {
    throw new Error(`GT-C has ${byRegion['GT-C'] ?? 0} hubs, expected 6`);
  }
}
