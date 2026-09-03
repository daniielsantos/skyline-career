/**
 * Slovakia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into SK_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SkCareerRegion } from './career-sk-hubs.js';

type SkDensifyHub = {
  icao: string;
  name: string;
  region: SkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** SK densify (+2). */
export const SK_DENSIFY_HUBS: readonly SkDensifyHub[] = [
  {
    icao: 'LZZI',
    name: "Zilina",
    region: 'SK-C',
    hubTier: 'spoke',
    lat: 49.2315,
    lon: 18.6135,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LZSL',
    name: "Sliac",
    region: 'SK-C',
    hubTier: 'spoke',
    lat: 48.6378,
    lon: 19.1342,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const SK_DENSIFY_HUB_COUNT = SK_DENSIFY_HUBS.length;
