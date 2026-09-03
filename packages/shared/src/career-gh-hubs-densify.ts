/**
 * Ghana densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into GH_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GhCareerRegion } from './career-gh-hubs.js';

type GhDensifyHub = {
  icao: string;
  name: string;
  region: GhCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** GH densify (+4). */
export const GH_DENSIFY_HUBS: readonly GhDensifyHub[] = [
  {
    icao: 'DGLE',
    name: "Yakubu Tali International Airport",
    region: 'GH-C',
    hubTier: 'regional',
    lat: 9.55391,
    lon: -0.86606,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'DGAH',
    name: "Ho Airport",
    region: 'GH-C',
    hubTier: 'regional',
    lat: 6.57969,
    lon: 0.53255,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'DGSN',
    name: "Sunyani Airport",
    region: 'GH-C',
    hubTier: 'regional',
    lat: 7.36183,
    lon: -2.32876,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'DGTK',
    name: "Takoradi Airport",
    region: 'GH-C',
    hubTier: 'regional',
    lat: 4.89606,
    lon: -1.77476,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const GH_DENSIFY_HUB_COUNT = GH_DENSIFY_HUBS.length;
