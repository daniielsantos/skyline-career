/**
 * Cote d'Ivoire densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into CI_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CiCareerRegion } from './career-ci-hubs.js';

type CiDensifyHub = {
  icao: string;
  name: string;
  region: CiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** CI densify (+4). */
export const CI_DENSIFY_HUBS: readonly CiDensifyHub[] = [
  {
    icao: 'DIBK',
    name: "Bouaké Airport",
    region: 'CI-S',
    hubTier: 'regional',
    lat: 7.7388,
    lon: -5.07367,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'DIKO',
    name: "Korhogo Airport",
    region: 'CI-S',
    hubTier: 'regional',
    lat: 9.38718,
    lon: -5.55666,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'DISP',
    name: "San Pedro Airport",
    region: 'CI-S',
    hubTier: 'regional',
    lat: 4.74672,
    lon: -6.66082,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'DIYO',
    name: "Yamoussoukro International Airport",
    region: 'CI-S',
    hubTier: 'regional',
    lat: 6.90317,
    lon: -5.36558,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const CI_DENSIFY_HUB_COUNT = CI_DENSIFY_HUBS.length;
