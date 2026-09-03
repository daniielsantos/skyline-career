/**
 * Zimbabwe densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ZW_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ZwCareerRegion } from './career-zw-hubs.js';

type ZwDensifyHub = {
  icao: string;
  name: string;
  region: ZwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ZW densify (+3). */
export const ZW_DENSIFY_HUBS: readonly ZwDensifyHub[] = [
  {
    icao: 'FVFA',
    name: "Victoria Falls International Airport",
    region: 'ZW-C',
    hubTier: 'regional',
    lat: -18.09744,
    lon: 25.83687,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FVKB',
    name: "Kariba Airport",
    region: 'ZW-C',
    hubTier: 'regional',
    lat: -16.5198,
    lon: 28.885,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FVCZ',
    name: "Buffalo Range Airport",
    region: 'ZW-S',
    hubTier: 'regional',
    lat: -21.0081,
    lon: 31.5786,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const ZW_DENSIFY_HUB_COUNT = ZW_DENSIFY_HUBS.length;
