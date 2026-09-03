/**
 * Honduras densify — commercial MH* airports (MSFS + SimBrief).
 * Merged into HN_CAREER_HUBS. No bush strips.
 * MHNJ Guanaja dropped — absent in stock MSFS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { HnCareerRegion } from './career-hn-hubs.js';

type HnDensifyHub = {
  icao: string;
  name: string;
  region: HnCareerRegion;
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

/** HN densify (+6) → 12 total. MHNJ Guanaja dropped — absent in stock MSFS. */
export const HN_DENSIFY_HUBS: readonly HnDensifyHub[] = [
  {
    icao: 'MHPL',
    name: 'Puerto Lempira',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 15.2622,
    lon: -83.7812,
    ...agroSpoke,
  },
  {
    icao: 'MHCA',
    name: 'Catacamas',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 14.9167,
    lon: -85.9,
    ...agroSpoke,
  },
  // Wave C densify (+2) — MHJU/MHRC absent in stock MSFS
  {
    icao: 'MHPR',
    name: 'Palmerola',
    region: 'HN-C',
    hubTier: 'regional',
    lat: 14.3824,
    lon: -87.6212,
    produce: { general: 1.25, electronics: 1.05, supplies: 1.0 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'MHTJ',
    name: 'Trujillo',
    region: 'HN-C',
    hubTier: 'spoke',
    lat: 15.9266,
    lon: -85.9386,
    ...agroSpoke,
  },
];

export const HN_DENSIFY_HUB_COUNT = HN_DENSIFY_HUBS.length;
