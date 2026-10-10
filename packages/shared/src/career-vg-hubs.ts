/**
 * British Virgin Islands career hubs — one region, no road link off the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type VgCareerRegion = 'VG-C';

export type VgCareerHubDef = {
  icao: string;
  name: string;
  region: VgCareerRegion;
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

export const VG_CAREER_HUBS: readonly VgCareerHubDef[] = [
  {
    icao: 'TUPJ',
    name: 'Beef Island Terrance B Lettsome',
    region: 'VG-C',
    hubTier: 'major',
    lat: 18.4456,
    lon: -64.5417,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TUPW',
    name: 'Virgin Gorda',
    region: 'VG-C',
    hubTier: 'spoke',
    lat: 18.4467,
    lon: -64.4278,
    ...islandSpoke,
  },
];

export const VG_CAREER_HUB_COUNT = VG_CAREER_HUBS.length;

export function buildVgFeederCorridors(
  hubs: readonly VgCareerHubDef[] = VG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVgCareerHubCatalog(): void {
  if (VG_CAREER_HUBS.length !== VG_CAREER_HUB_COUNT) {
    throw new Error(
      `VG_CAREER_HUBS length ${VG_CAREER_HUBS.length} !== ${VG_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of VG_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate VG hub ${id}`);
    seen.add(id);
    if (h.region !== 'VG-C') throw new Error(`${id} must use VG-C`);
  }
}
