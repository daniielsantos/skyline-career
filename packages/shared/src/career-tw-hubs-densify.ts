/**
 * Taiwan densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into TW_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { TwCareerRegion } from './career-tw-hubs.js';

type TwDensifyHub = {
  icao: string;
  name: string;
  region: TwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** TW densify (+7). */
export const TW_DENSIFY_HUBS: readonly TwDensifyHub[] = [
  {
    icao: 'RCYU',
    name: "Hualien Chiashan Airport",
    region: 'TW-N',
    hubTier: 'regional',
    lat: 24.02316,
    lon: 121.61799,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RCWA',
    name: "Wang-an Airport",
    region: 'TW-C',
    hubTier: 'spoke',
    lat: 23.3674,
    lon: 119.503,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RCKU',
    name: "Chiayi Airport",
    region: 'TW-C',
    hubTier: 'regional',
    lat: 23.46258,
    lon: 120.39054,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RCBS',
    name: "Kinmen Airport",
    region: 'TW-N',
    hubTier: 'regional',
    lat: 24.4279,
    lon: 118.359,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RCLY',
    name: "Lanyu Airport",
    region: 'TW-S',
    hubTier: 'regional',
    lat: 22.027,
    lon: 121.535,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RCMT',
    name: "Matsu Beigan Airport",
    region: 'TW-N',
    hubTier: 'regional',
    lat: 26.22414,
    lon: 120.00268,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RCFG',
    name: "Matsu Nangan Airport",
    region: 'TW-N',
    hubTier: 'regional',
    lat: 26.15966,
    lon: 119.95838,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const TW_DENSIFY_HUB_COUNT = TW_DENSIFY_HUBS.length;
