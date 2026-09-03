/**
 * Uganda densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into UG_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { UgCareerRegion } from './career-ug-hubs.js';

type UgDensifyHub = {
  icao: string;
  name: string;
  region: UgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** UG densify (+4). */
export const UG_DENSIFY_HUBS: readonly UgDensifyHub[] = [
  {
    icao: 'HUAR',
    name: "Arua Airport",
    region: 'UG-C',
    hubTier: 'regional',
    lat: 3.04915,
    lon: 30.91171,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HUGU',
    name: "Gulu Airport",
    region: 'UG-C',
    hubTier: 'regional',
    lat: 2.80556,
    lon: 32.2718,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HUSO',
    name: "Soroti Airport",
    region: 'UG-C',
    hubTier: 'regional',
    lat: 1.72769,
    lon: 33.6228,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HUAJ',
    name: "Adjumani Airport",
    region: 'UG-C',
    hubTier: 'spoke',
    lat: 3.33924,
    lon: 31.76385,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const UG_DENSIFY_HUB_COUNT = UG_DENSIFY_HUBS.length;
