/**
 * Guyana densify — commercial SY* airports (MSFS + SimBrief).
 * Merged into GY_CAREER_HUBS. No bush strips.
 * Kaieteur SYKA dropped — MSFS returns no facility coords.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GyCareerRegion } from './career-gy-hubs.js';

type GyDensifyHub = {
  icao: string;
  name: string;
  region: GyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const miningSpoke = {
  produce: { machinery: 1.3, electronics: 1.05, general: 1.05 },
  consume: { perishables: 1.1, supplies: 1.0 },
} as const;

/** GY densify (+4) → 9 total. Kaieteur SYKA dropped — MSFS returns no facility coords. */
export const GY_DENSIFY_HUBS: readonly GyDensifyHub[] = [
  {
    icao: 'SYIB',
    name: 'Imbaimadai',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 5.7083,
    lon: -60.2833,
    ...miningSpoke,
  },
  // Wave C densify (+3)
  {
    icao: 'SYLD',
    name: 'Linden',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 5.96592,
    lon: -58.270302,
    ...miningSpoke,
  },
  {
    icao: 'SYBT',
    name: 'Bartica',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 6.3589,
    lon: -58.6552,
    produce: { general: 1.1, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SYMD',
    name: 'Mahdia',
    region: 'GY-C',
    hubTier: 'spoke',
    lat: 5.2728,
    lon: -59.1493,
    ...miningSpoke,
  },
];

export const GY_DENSIFY_HUB_COUNT = GY_DENSIFY_HUBS.length;
