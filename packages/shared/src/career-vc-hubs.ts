/**
 * Saint Vincent and the Grenadines career hubs — one region, no road link off the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type VcCareerRegion = 'VC-C';

export type VcCareerHubDef = {
  icao: string;
  name: string;
  region: VcCareerRegion;
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

export const VC_CAREER_HUBS: readonly VcCareerHubDef[] = [
  {
    icao: 'TVSA',
    name: 'Kingstown Argyle',
    region: 'VC-C',
    hubTier: 'major',
    lat: 13.16,
    lon: -61.1486,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TVSB',
    name: 'Bequia J F Mitchell',
    region: 'VC-C',
    hubTier: 'spoke',
    lat: 12.9886,
    lon: -61.2622,
    ...islandSpoke,
  },
  {
    icao: 'TVSC',
    name: 'Canouan',
    region: 'VC-C',
    hubTier: 'spoke',
    lat: 12.7008,
    lon: -61.345,
    ...islandSpoke,
  },
  {
    icao: 'TVSM',
    name: 'Mustique',
    region: 'VC-C',
    hubTier: 'spoke',
    lat: 12.8878,
    lon: -61.18,
    ...islandSpoke,
  },
  {
    icao: 'TVSU',
    name: 'Union Island',
    region: 'VC-C',
    hubTier: 'spoke',
    lat: 12.5986,
    lon: -61.4147,
    ...islandSpoke,
  },
];

export const VC_CAREER_HUB_COUNT = VC_CAREER_HUBS.length;

export function buildVcFeederCorridors(
  hubs: readonly VcCareerHubDef[] = VC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVcCareerHubCatalog(): void {
  if (VC_CAREER_HUBS.length !== VC_CAREER_HUB_COUNT) {
    throw new Error(
      `VC_CAREER_HUBS length ${VC_CAREER_HUBS.length} !== ${VC_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of VC_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate VC hub ${id}`);
    seen.add(id);
    if (h.region !== 'VC-C') throw new Error(`${id} must use VC-C`);
  }
}
