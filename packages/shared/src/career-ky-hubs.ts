/**
 * Cayman Islands career hubs — one region, no road link off the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KyCareerRegion = 'KY-C';

export type KyCareerHubDef = {
  icao: string;
  name: string;
  region: KyCareerRegion;
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

export const KY_CAREER_HUBS: readonly KyCareerHubDef[] = [
  {
    icao: 'MWCR',
    name: 'George Town Owen Roberts',
    region: 'KY-C',
    hubTier: 'major',
    lat: 19.2928,
    lon: -81.3578,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MWCB',
    name: 'Cayman Brac Gerrard Smith',
    region: 'KY-C',
    hubTier: 'spoke',
    lat: 19.687,
    lon: -79.8828,
    ...islandSpoke,
  },
];

export const KY_CAREER_HUB_COUNT = KY_CAREER_HUBS.length;

export function buildKyFeederCorridors(
  hubs: readonly KyCareerHubDef[] = KY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKyCareerHubCatalog(): void {
  if (KY_CAREER_HUBS.length !== KY_CAREER_HUB_COUNT) {
    throw new Error(
      `KY_CAREER_HUBS length ${KY_CAREER_HUBS.length} !== ${KY_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of KY_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate KY hub ${id}`);
    seen.add(id);
    if (h.region !== 'KY-C') throw new Error(`${id} must use KY-C`);
  }
}
