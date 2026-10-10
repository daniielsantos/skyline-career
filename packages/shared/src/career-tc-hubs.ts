/**
 * Turks and Caicos career hubs — one region, no road link off the islands.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TcCareerRegion = 'TC-C';

export type TcCareerHubDef = {
  icao: string;
  name: string;
  region: TcCareerRegion;
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

export const TC_CAREER_HUBS: readonly TcCareerHubDef[] = [
  {
    icao: 'MBPV',
    name: 'Providenciales',
    region: 'TC-C',
    hubTier: 'major',
    lat: 21.7738,
    lon: -72.2687,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MBGT',
    name: 'Grand Turk JAGS McCartney',
    region: 'TC-C',
    hubTier: 'spoke',
    lat: 21.4444,
    lon: -71.1418,
    ...islandSpoke,
  },
  {
    icao: 'MBNC',
    name: 'North Caicos',
    region: 'TC-C',
    hubTier: 'spoke',
    lat: 21.9175,
    lon: -71.9397,
    ...islandSpoke,
  },
  {
    icao: 'MBSC',
    name: 'South Caicos',
    region: 'TC-C',
    hubTier: 'spoke',
    lat: 21.5158,
    lon: -71.5291,
    ...islandSpoke,
  },
];

export const TC_CAREER_HUB_COUNT = TC_CAREER_HUBS.length;

export function buildTcFeederCorridors(
  hubs: readonly TcCareerHubDef[] = TC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTcCareerHubCatalog(): void {
  if (TC_CAREER_HUBS.length !== TC_CAREER_HUB_COUNT) {
    throw new Error(
      `TC_CAREER_HUBS length ${TC_CAREER_HUBS.length} !== ${TC_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of TC_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate TC hub ${id}`);
    seen.add(id);
    if (h.region !== 'TC-C') throw new Error(`${id} must use TC-C`);
  }
}
