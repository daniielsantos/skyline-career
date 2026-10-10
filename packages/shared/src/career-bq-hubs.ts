/**
 * Caribbean Netherlands career hubs — Bonaire, Sint Eustatius, Saba.
 * One region, no road link between the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BqCareerRegion = 'BQ-C';

export type BqCareerHubDef = {
  icao: string;
  name: string;
  region: BqCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const islandSpoke = {
  produce: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  consume: { electronics: 0.95, machinery: 0.9, fuel: 0.9 },
} as const;

export const BQ_CAREER_HUBS: readonly BqCareerHubDef[] = [
  {
    icao: 'TNCB',
    name: 'Bonaire Flamingo',
    region: 'BQ-C',
    hubTier: 'major',
    lat: 12.1308,
    lon: -68.2674,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TNCE',
    name: 'Sint Eustatius F D Roosevelt',
    region: 'BQ-C',
    hubTier: 'spoke',
    lat: 17.4965,
    lon: -62.9795,
    ...islandSpoke,
  },
  {
    icao: 'TNCS',
    name: 'Saba Juancho Yrausquin',
    region: 'BQ-C',
    hubTier: 'spoke',
    lat: 17.6454,
    lon: -63.2206,
    ...islandSpoke,
  },
];

export const BQ_CAREER_HUB_COUNT = BQ_CAREER_HUBS.length;

export function buildBqFeederCorridors(
  hubs: readonly BqCareerHubDef[] = BQ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBqCareerHubCatalog(): void {
  if (BQ_CAREER_HUBS.length !== BQ_CAREER_HUB_COUNT) {
    throw new Error(
      `BQ_CAREER_HUBS length ${BQ_CAREER_HUBS.length} !== ${BQ_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of BQ_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate BQ hub ${id}`);
    seen.add(id);
    if (h.region !== 'BQ-C') throw new Error(`${id} must use BQ-C`);
  }
}
