/**
 * Lithuania densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into LT_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { LtCareerRegion } from './career-lt-hubs.js';

type LtDensifyHub = {
  icao: string;
  name: string;
  region: LtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** LT densify (+2). */
export const LT_DENSIFY_HUBS: readonly LtDensifyHub[] = [
  {
    icao: 'EYPN',
    name: "Panevezys",
    region: 'LT-C',
    hubTier: 'spoke',
    lat: 55.7333,
    lon: 24.45,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EYPR',
    name: "Prienai",
    region: 'LT-C',
    hubTier: 'spoke',
    lat: 54.6531,
    lon: 24.0122,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const LT_DENSIFY_HUB_COUNT = LT_DENSIFY_HUBS.length;
