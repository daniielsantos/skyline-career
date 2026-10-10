/**
 * Saint Kitts and Nevis career hubs — one region, no road link off the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KnCareerRegion = 'KN-C';

export type KnCareerHubDef = {
  icao: string;
  name: string;
  region: KnCareerRegion;
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

export const KN_CAREER_HUBS: readonly KnCareerHubDef[] = [
  {
    icao: 'TKPK',
    name: 'Basseterre Robert L Bradshaw',
    region: 'KN-C',
    hubTier: 'major',
    lat: 17.3111,
    lon: -62.7186,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TKPN',
    name: 'Nevis Vance W Amory',
    region: 'KN-C',
    hubTier: 'spoke',
    lat: 17.2056,
    lon: -62.59,
    ...islandSpoke,
  },
];

export const KN_CAREER_HUB_COUNT = KN_CAREER_HUBS.length;

export function buildKnFeederCorridors(
  hubs: readonly KnCareerHubDef[] = KN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKnCareerHubCatalog(): void {
  if (KN_CAREER_HUBS.length !== KN_CAREER_HUB_COUNT) {
    throw new Error(
      `KN_CAREER_HUBS length ${KN_CAREER_HUBS.length} !== ${KN_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of KN_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate KN hub ${id}`);
    seen.add(id);
    if (h.region !== 'KN-C') throw new Error(`${id} must use KN-C`);
  }
}
