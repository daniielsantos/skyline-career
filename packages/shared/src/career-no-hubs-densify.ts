/**
 * Norway densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into NO_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NoCareerRegion } from './career-no-hubs.js';

type NoDensifyHub = {
  icao: string;
  name: string;
  region: NoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** NO densify (+4). */
export const NO_DENSIFY_HUBS: readonly NoDensifyHub[] = [
  {
    icao: 'ENBO',
    name: "Bodo",
    region: 'NO-N',
    hubTier: 'regional',
    lat: 67.2692,
    lon: 14.3653,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'ENML',
    name: "Molde Aro",
    region: 'NO-S',
    hubTier: 'spoke',
    lat: 62.7447,
    lon: 7.2625,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'ENHD',
    name: "Haugesund Karmoy",
    region: 'NO-S',
    hubTier: 'spoke',
    lat: 59.3453,
    lon: 5.20836,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'ENKB',
    name: "Kristiansund Kvernberget",
    region: 'NO-S',
    hubTier: 'spoke',
    lat: 63.1118,
    lon: 7.82452,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const NO_DENSIFY_HUB_COUNT = NO_DENSIFY_HUBS.length;
