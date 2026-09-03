/**
 * Nicaragua densify — commercial MN* airports (MSFS + SimBrief).
 * Merged into NI_CAREER_HUBS. No bush; skip MNCE/MNRR.
 * MNWP is Waspam (not Puerto Cabezas — that is MNPC, already seeded).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NiCareerRegion } from './career-ni-hubs.js';

type NiDensifyHub = {
  icao: string;
  name: string;
  region: NiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
} as const;

/** NI densify (+4) → 9 total. */
export const NI_DENSIFY_HUBS: readonly NiDensifyHub[] = [
  {
    icao: 'MNWP',
    name: 'Waspam',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 14.7394,
    lon: -83.9694,
    ...agroSpoke,
  },
  // Wave C densify (+3)
  {
    icao: 'MNSC',
    name: 'San Carlos',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 11.1356,
    lon: -84.7687,
    ...agroSpoke,
  },
  {
    icao: 'MNSI',
    name: 'Siuna',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 13.7272,
    lon: -84.7778,
    ...agroSpoke,
  },
  {
    icao: 'MNBZ',
    name: 'Bonanza San Pedro',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 14.0315,
    lon: -84.6243,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
];

export const NI_DENSIFY_HUB_COUNT = NI_DENSIFY_HUBS.length;
