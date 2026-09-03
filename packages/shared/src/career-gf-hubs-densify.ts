/**
 * French Guiana densify — commercial SO* airports (MSFS + SimBrief).
 * Merged into GF_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GfCareerRegion } from './career-gf-hubs.js';

type GfDensifyHub = {
  icao: string;
  name: string;
  region: GfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** GF densify (+3) → 6 total. */
export const GF_DENSIFY_HUBS: readonly GfDensifyHub[] = [
  {
    icao: 'SOOM',
    name: 'St Laurent du Maroni',
    region: 'GF-C',
    hubTier: 'spoke',
    lat: 5.4831,
    lon: -54.0344,
    ...drySpoke,
  },
  {
    icao: 'SOOS',
    name: 'Saul',
    region: 'GF-C',
    hubTier: 'spoke',
    lat: 3.6136,
    lon: -53.2042,
    produce: { general: 1.05, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  // Wave C densify (+1)
  {
    icao: 'SOGS',
    name: 'Grand-Santi',
    region: 'GF-C',
    hubTier: 'spoke',
    lat: 4.2858,
    lon: -54.3731,
    ...drySpoke,
  },
];

export const GF_DENSIFY_HUB_COUNT = GF_DENSIFY_HUBS.length;
